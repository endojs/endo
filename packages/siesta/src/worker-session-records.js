// @ts-check
import harden from '@endo/harden';
import { Fail, q } from '@endo/errors';
import { Far } from '@endo/far';

/**
 * @import {SiestaStore} from './store-fs.js'
 */

/**
 * Endpoint session records: the durable description of the daemon's
 * one reifying session (the endpoint), so a daemon restart re-seats
 * its exports without reconstructing any live state elsewhere — the
 * hub's tables carry every other session.
 *
 * The machine invariant makes the endpoint's exports describable:
 * every value the endpoint exports is either
 *
 * - a host resource: described as `{ kind: 'resource', name,
 *   description }`, re-instantiated by the registered factory on
 *   restore (instances are per-process singletons per name and
 *   description); or
 * - protocol-internal plumbing — the resolver objects the OCapN layer
 *   mints for op:listen subscriptions and op:deliver replies. Their
 *   function is restored separately (resolver obligations re-attach),
 *   so they are recorded as `{ kind: 'internal' }` and re-seat as
 *   tombstones that only keep the position space aligned; calls to one
 *   fail loudly.
 *
 * Descriptions are keyed by export slot in the endpoint's worker-store
 * tables record; resolver obligations ride along (promise targets
 * re-subscribe, answer targets reject at-most-once), and the answer
 * epoch partitions the endpoint's question positions across daemon
 * processes.
 *
 * @param {object} options
 * @param {SiestaStore} options.store
 * @param {Record<string, (description?: unknown) => object>} [options.resources]
 *   named resource factories; instances are per-process singletons per
 *   (name, description) pair
 * @param {(error: unknown) => void} [options.reportError]
 */
export const makeWorkerSessionRecords = ({
  store,
  resources = {},
  // eslint-disable-next-line no-console
  reportError = error => console.error('siesta worker sessions:', error),
}) => {
  /** @type {WeakMap<object, string>} connection -> workerId */
  const workerIdForConnection = new WeakMap();
  /** @type {WeakMap<object, { name: string, description: unknown }>} */
  const resourceOrigins = new WeakMap();
  /** @type {Map<string, object>} (name, description) -> singleton */
  const resourceInstances = new Map();
  /** @type {Map<string, any>} workerId -> ResumedSession controls */
  const resumedByWorkerId = new Map();
  /** True while re-seating exports, whose re-fired hooks are echoes. */
  let restoring = false;

  /**
   * @param {string} name
   * @param {unknown} [description]
   */
  const provideResource = (name, description = null) => {
    const key = `${name}|${JSON.stringify(description)}`;
    let instance = resourceInstances.get(key);
    if (instance === undefined) {
      const makeResource = resources[name];
      typeof makeResource === 'function' ||
        Fail`siesta worker sessions: unknown resource ${q(name)}`;
      instance = makeResource(description);
      resourceInstances.set(key, instance);
      resourceOrigins.set(instance, harden({ name, description }));
    }
    return instance;
  };

  /**
   * @param {any} description
   * @returns {object}
   */
  const provideCapability = description => {
    if (description.kind === 'resource') {
      return provideResource(description.name, description.description ?? null);
    }
    if (description.kind === 'internal') {
      // A protocol-internal resolver from the previous process; its
      // function is restored by resolver obligations and promise
      // re-subscription. This tombstone only keeps the position space
      // aligned.
      return Far('SessionInternalTombstone', {});
    }
    throw Fail`siesta worker sessions: unknown description kind ${q(
      description.kind,
    )}`;
  };

  const sessionHooks = harden({
    /**
     * @param {object} connection
     * @param {string} slot
     * @param {object} value
     */
    onExport: (connection, slot, value) => {
      const workerId = workerIdForConnection.get(connection);
      if (workerId === undefined || restoring) {
        return;
      }
      try {
        // Position 0 is the bootstrap object, recreated by every
        // session; later positions must be re-seatable.
        if (slot.endsWith('+0')) {
          return;
        }
        const resource = resourceOrigins.get(value);
        const description =
          resource === undefined
            ? harden({ kind: 'internal' })
            : harden({ kind: 'resource', ...resource });
        const workerStore = store.provideWorkerStore(workerId);
        const record = /** @type {any} */ (workerStore.getTablesRecord()) ?? {};
        workerStore.setTablesRecord({
          ...record,
          exports: { ...record.exports, [slot]: description },
        });
      } catch (error) {
        reportError(error);
      }
    },
    /**
     * @param {object} connection
     * @param {string} resolverSlot
     * @param {{ kind: 'promise' | 'answer', position: bigint }} target
     */
    onPendingResolver: (connection, resolverSlot, target) => {
      const workerId = workerIdForConnection.get(connection);
      if (workerId === undefined || restoring) {
        return;
      }
      try {
        const workerStore = store.provideWorkerStore(workerId);
        const record = /** @type {any} */ (workerStore.getTablesRecord()) ?? {};
        workerStore.setTablesRecord({
          ...record,
          pendingResolvers: {
            ...record.pendingResolvers,
            [resolverSlot]: {
              kind: target.kind,
              position: target.position.toString(),
            },
          },
        });
      } catch (error) {
        reportError(error);
      }
    },
    /**
     * @param {object} connection
     * @param {string} resolverSlot
     */
    onResolverSettled: (connection, resolverSlot) => {
      const workerId = workerIdForConnection.get(connection);
      if (workerId === undefined) {
        return;
      }
      try {
        const workerStore = store.provideWorkerStore(workerId);
        const record = /** @type {any} */ (workerStore.getTablesRecord()) ?? {};
        if (record.pendingResolvers && resolverSlot in record.pendingResolvers) {
          const pendingResolvers = { ...record.pendingResolvers };
          delete pendingResolvers[resolverSlot];
          workerStore.setTablesRecord({ ...record, pendingResolvers });
        }
      } catch (error) {
        reportError(error);
      }
    },
  });

  return harden({
    sessionHooks,
    provideResource,
    /**
     * Bind a connection to its session's record id so the hooks can
     * attribute session traffic. Call before restoring the session.
     *
     * @param {object} connection
     * @param {string} workerId
     */
    registerWorkerConnection: (connection, workerId) => {
      workerIdForConnection.set(connection, workerId);
    },
    /**
     * Note a session's restore controls (fresh or restored daemon
     * alike), so `restoreWorker` can re-seat into it.
     *
     * @param {string} workerId
     * @param {any} resumed the client's `resumeSession` result
     */
    registerResumedSession: (workerId, resumed) => {
      resumedByWorkerId.set(workerId, resumed);
    },
    /**
     * Re-seat every recorded export and resolver obligation for the
     * session in a restarted daemon.
     *
     * @param {string} workerId
     */
    restoreWorker: workerId => {
      const resumed = resumedByWorkerId.get(workerId);
      resumed !== undefined ||
        Fail`siesta worker sessions: worker ${q(workerId)} is not established`;
      const workerStore = store.provideWorkerStore(workerId);
      const record = /** @type {any} */ (workerStore.getTablesRecord()) ?? {};
      // The hub's tables still hold answer registrations from every
      // previous daemon process (only op:gc-answers releases them, and
      // a dead process sends none). Partition the answer-position
      // space by daemon epoch so this process's fresh question counter
      // can never collide with a predecessor's.
      const answerEpoch = (record.answerEpoch ?? 0) + 1;
      workerStore.setTablesRecord({ ...record, answerEpoch });
      resumed.advanceAnswerPosition(BigInt(answerEpoch) * 2n ** 32n);
      restoring = true;
      try {
        for (const [slot, description] of Object.entries(
          record.exports ?? {},
        )) {
          const position = BigInt(slot.slice(2));
          if (description === null) {
            resumed.restoreExport(position, Far('UnrestorableExport', {}));
          } else {
            resumed.restoreExport(position, provideCapability(description));
          }
        }
        for (const [resolverSlot, target] of Object.entries(
          record.pendingResolvers ?? {},
        )) {
          resumed.restorePendingResolver({
            resolverPosition: BigInt(resolverSlot.slice(2)),
            target: {
              kind: target.kind,
              position: BigInt(target.position),
            },
          });
        }
      } finally {
        restoring = false;
      }
    },
  });
};
harden(makeWorkerSessionRecords);
