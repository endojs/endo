// @ts-check
import harden from '@endo/harden';
import { Fail, q } from '@endo/errors';
import { E, Far } from '@endo/far';

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
 * - a host resource: described as `{ kind: 'resource', name,
 *   description }`, re-instantiated by the registered factory on
 *   restore (instances are per-process singletons per name and
 *   description);
 * - an import from another worker session (a cross-worker link the
 *   daemon relays): described as `{ kind: 'link', workerId, slot }`,
 *   re-materialized on restore through the linked session's
 *   `provideImport` — no worker wakes;
 * - a listen forwarder minted by the non-reifying promise relay
 *   (`relayPromises`): described as
 *   `{ kind: 'listen-forwarder', holder, slot }` where `holder` names
 *   the subscriber's session (`{ workerId }` or a durable-netlayer
 *   `{ token }`) and `slot` its resolver import there. Restored as a
 *   fresh forwarder to the re-materialized resolver — deferred, when
 *   the subscriber is a remote session that has not yet resumed. The
 *   daemon never subscribes to a promise itself; subscription state
 *   lives only in the (durable) endpoints.
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
  /** @type {WeakMap<object, { workerId: string, slot: string }>} */
  const valueOrigins = new WeakMap();
  /** @type {WeakMap<object, { name: string, description: unknown }>} */
  const resourceOrigins = new WeakMap();
  /** @type {Map<string, object>} (name, description) -> singleton */
  const resourceInstances = new Map();
  /** @type {Map<string, any>} workerId -> ResumedSession controls */
  const resumedByWorkerId = new Map();
  /**
   * Late-bound by the daemon once the client and netlayer exist:
   * introspection for listen forwarders and remote-session resolution.
   *
   * @type {{
   *   getForwarderInfo: (value: object) => { connection: object, resolverSlot: string } | undefined,
   *   tokenForConnection: (connection: object) => string | undefined,
   *   whenTokenResumed: (token: string) => Promise<any>,
   * } | undefined}
   */
  let forwarderPowers;
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
   * @param {object} value
   * @returns {Record<string, unknown> | undefined}
   */
  const describeValue = value => {
    const resource = resourceOrigins.get(value);
    if (resource !== undefined) {
      return harden({ kind: 'resource', ...resource });
    }
    const origin = valueOrigins.get(value);
    if (origin !== undefined) {
      return harden({ kind: 'link', ...origin });
    }
    if (forwarderPowers !== undefined) {
      const info = forwarderPowers.getForwarderInfo(value);
      if (info !== undefined) {
        const workerId = workerIdForConnection.get(info.connection);
        if (workerId !== undefined) {
          return harden({
            kind: 'listen-forwarder',
            holder: { workerId },
            slot: info.resolverSlot,
          });
        }
        const token = forwarderPowers.tokenForConnection(info.connection);
        if (token !== undefined) {
          return harden({
            kind: 'listen-forwarder',
            holder: { token },
            slot: info.resolverSlot,
          });
        }
      }
    }
    return undefined;
  };

  /**
   * @param {any} description
   * @returns {object}
   */
  const provideCapability = description => {
    if (description.kind === 'resource') {
      return provideResource(description.name, description.description ?? null);
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
    if (description.kind === 'listen-forwarder') {
      const slot = String(description.slot);
      const slotInfo = harden({
        type: slot[0],
        position: BigInt(slot.slice(2)),
      });
      const { holder } = description;
      // Materialize the subscriber's resolver lazily: for a worker
      // holder it is immediate (and wakes nobody); for a remote
      // holder it waits until that session resumes in this process.
      const provideResolver = () => {
        if (holder.workerId !== undefined) {
          const resumed = resumedByWorkerId.get(holder.workerId);
          resumed !== undefined ||
            Fail`siesta worker sessions: forwarder to unrestored worker ${q(
              holder.workerId,
            )}`;
          return Promise.resolve(resumed.provideImport(slotInfo));
        }
        holder.token !== undefined ||
          Fail`siesta worker sessions: forwarder holder names no session`;
        const powers = forwarderPowers;
        if (powers === undefined) {
          throw Fail`siesta worker sessions: forwarder powers are not bound`;
        }
        return powers
          .whenTokenResumed(holder.token)
          .then(resumed => resumed.provideImport(slotInfo));
      };
      return Far('ListenForwarder', {
        /** @param {unknown} value */
        fulfill: value => {
          provideResolver()
            .then(resolver => E.sendOnly(resolver).fulfill(value))
            .catch(reportError);
        },
        /** @param {unknown} reason */
        break: reason => {
          provideResolver()
            .then(resolver => E.sendOnly(resolver).break(reason))
            .catch(reportError);
        },
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
     * Bind the listen-forwarder introspection and remote-session
     * powers, once the daemon's client and netlayer exist.
     *
     * @param {NonNullable<typeof forwarderPowers>} powers
     */
    setForwarderPowers: powers => {
      forwarderPowers = powers;
    },
    /**
     * The linkage seam shared with durable TCP sessions: the durable
     * description of a host-side capability (a made resource, or an
     * import from a worker session), or undefined.
     *
     * @param {object} value
     */
    describeCapability: value => describeValue(value),
    /**
     * Rebuild a capability from its durable description, minting
     * worker links at their recorded slots without waking anyone.
     *
     * @param {unknown} description
     */
    provideCapability: description => provideCapability(description),
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
