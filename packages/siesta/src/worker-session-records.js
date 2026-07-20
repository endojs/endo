// @ts-check
import harden from '@endo/harden';
import { Fail, q } from '@endo/errors';
import { Far } from '@endo/far';

/**
 * @import {SiestaStore} from './store-fs.js'
 */

/**
 * Worker-session records (protocol unification phase 3b): the durable
 * description of the daemon's side of every worker session, so a
 * daemon restart re-seats each daemon export into a worker session —
 * and each publication — without waking any worker.
 *
 * The worker's half of the session lives in its heap snapshot; the
 * session identity derives from the worker id; frames are covered by
 * the durable worker transport. What remains contingent is the
 * daemon's export table (the capabilities it has passed *into* each
 * worker) and its publications, and the machine invariant makes both
 * describable — every daemon export originates from a durable worker
 * or a host resource:
 *
 * - a host resource: described as `{ kind: 'resource', name }`,
 *   re-instantiated by the resource factory on restore;
 * - an import from another worker session (a cross-worker link the
 *   daemon relays): described as `{ kind: 'link', workerId, slot }`,
 *   re-materialized on restore through the linked session's
 *   `provideImport` — no worker wakes.
 *
 * Everything else the daemon exports into a worker session is, by
 * that same invariant, protocol-internal — the resolver objects the
 * OCapN layer mints for op:listen subscriptions and op:deliver
 * replies. Their *function* is restored separately (resolver
 * obligations re-attach, promise imports re-subscribe), so they are
 * recorded as `{ kind: 'internal' }` and re-seat as tombstones that
 * only keep the position space aligned; calls to one fail loudly.
 *
 * Descriptions are keyed by export slot in each worker store's tables
 * record; resolver obligations ride along exactly as in the durable
 * TCP sessions (promise targets re-subscribe, answer targets reject
 * at-most-once).
 *
 * @param {object} options
 * @param {SiestaStore} options.store
 * @param {Record<string, () => object>} [options.resources] named
 *   resource factories; instances are per-process singletons
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
  /** @type {WeakMap<object, { workerId: string, slot: string }>} */
  const valueOrigins = new WeakMap();
  /** @type {WeakMap<object, string>} resource instance -> name */
  const resourceOrigins = new WeakMap();
  /** @type {Map<string, object>} name -> per-process singleton */
  const resourceInstances = new Map();
  /** @type {Map<string, any>} workerId -> ResumedSession controls */
  const resumedByWorkerId = new Map();
  /** True while re-seating exports, whose re-fired hooks are echoes. */
  let restoring = false;

  /** @param {string} name */
  const provideResource = name => {
    let instance = resourceInstances.get(name);
    if (instance === undefined) {
      const makeResource = resources[name];
      typeof makeResource === 'function' ||
        Fail`siesta worker sessions: unknown resource ${q(name)}`;
      instance = makeResource();
      resourceInstances.set(name, instance);
      resourceOrigins.set(instance, name);
    }
    return instance;
  };

  /**
   * @param {object} value
   * @returns {Record<string, unknown> | undefined}
   */
  const describeValue = value => {
    const resourceName = resourceOrigins.get(value);
    if (resourceName !== undefined) {
      return harden({ kind: 'resource', name: resourceName });
    }
    const origin = valueOrigins.get(value);
    if (origin !== undefined) {
      return harden({ kind: 'link', ...origin });
    }
    return undefined;
  };

  /**
   * @param {any} description
   * @returns {object}
   */
  const provideCapability = description => {
    if (description.kind === 'resource') {
      return provideResource(description.name);
    }
    if (description.kind === 'link') {
      const resumed = resumedByWorkerId.get(description.workerId);
      resumed !== undefined ||
        Fail`siesta worker sessions: link to unrestored worker ${q(
          description.workerId,
        )}`;
      const slot = String(description.slot);
      return resumed.provideImport({
        type: slot[0],
        position: BigInt(slot.slice(2)),
      });
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
    onImport: (connection, slot, value) => {
      const workerId = workerIdForConnection.get(connection);
      if (workerId === undefined) {
        return;
      }
      valueOrigins.set(value, { workerId, slot });
    },
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
        const description =
          describeValue(value) ?? harden({ kind: 'internal' });
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
        if (
          record.pendingResolvers &&
          resolverSlot in record.pendingResolvers
        ) {
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
     * Bind a transport's connection to its worker id so the hooks can
     * attribute session traffic. Call before `transport.establish()`.
     *
     * @param {object} connection
     * @param {string} workerId
     */
    registerWorkerConnection: (connection, workerId) => {
      workerIdForConnection.set(connection, workerId);
    },
    /**
     * Note a worker session's restore controls (fresh or restored
     * daemon alike), so links into this worker can re-materialize.
     *
     * @param {string} workerId
     * @param {any} resumed the transport's `establish()` result
     */
    registerResumedSession: (workerId, resumed) => {
      resumedByWorkerId.set(workerId, resumed);
    },
    /**
     * Re-seat every recorded export and resolver obligation for a
     * worker session in a restarted daemon. Call after every worker's
     * session has been established and registered (links may point
     * both ways). No worker wakes.
     *
     * @param {string} workerId
     */
    restoreWorker: workerId => {
      const resumed = resumedByWorkerId.get(workerId);
      resumed !== undefined ||
        Fail`siesta worker sessions: worker ${q(workerId)} is not established`;
      const workerStore = store.provideWorkerStore(workerId);
      const record = /** @type {any} */ (workerStore.getTablesRecord()) ?? {};
      // The worker's heap still holds answer registrations from every
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
    /**
     * Publish a value under a swissnum, durably: the publication
     * record is the value's durable description, so a restarted
     * daemon re-materializes it without waking anything.
     *
     * @param {Map<string, object>} locator the daemon client's locator
     * @param {string} secret
     * @param {object} value
     */
    publish: (locator, secret, value) => {
      const description = describeValue(value);
      description !== undefined ||
        Fail`siesta worker sessions: published value has no durable description`;
      store.setPublication(secret, /** @type {any} */ (description));
      locator.set(secret, value);
    },
    /**
     * Re-seat every publication into the locator of a restarted
     * daemon. Call after `restoreWorker` for all workers.
     *
     * @param {Map<string, object>} locator
     */
    restorePublications: locator => {
      for (const [secret, description] of Object.entries(
        store.getPublications(),
      )) {
        try {
          locator.set(secret, provideCapability(description));
        } catch (error) {
          reportError(error);
        }
      }
    },
  });
};
harden(makeWorkerSessionRecords);
