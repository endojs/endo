// @ts-check
/* global setTimeout, clearTimeout, crypto */
import harden from '@endo/harden';
import { makeCapTP } from '@endo/captp';
import { Fail, q } from '@endo/errors';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';
import { getInterfaceOf } from '@endo/pass-style';

import { assertWorkerId } from './store-fs.js';
import {
  makeFreshTablesRecord,
  makePersistentTablesKit,
} from './persistent-tables.js';

/**
 * @import {SiestaStore} from './store-fs.js'
 */

/**
 * One running instance of a worker: a message endpoint over a live guest
 * heap, either freshly created or restored from the engine's snapshot.
 *
 * @typedef {object} WorkerIncarnation
 * @property {(message: Record<string, unknown>) => Promise<void>} deliver
 *   delivers one inbound CapTP message and settles when the worker has
 *   processed it (including emitting any replies)
 * @property {() => Promise<unknown>} snapshot captures the guest heap at
 *   quiescence and returns an opaque durable snapshot ref
 * @property {() => Promise<void>} terminate ends the incarnation without
 *   notifying the guest; orthogonal persistence means the guest never
 *   observes its own suspension
 */

/**
 * The power to run worker incarnations. The journal replay engine is the
 * reference implementation; a production engine runs XS machines under a
 * snapshotting supervisor.
 *
 * @typedef {object} WorkerEngine
 * @property {boolean} canSnapshot whether `snapshot` returns a real
 *   engine-level snapshot ref; if false the host must retain the full
 *   journal and the engine must reconstruct state by replay
 * @property {(options: {
 *   debugName: string,
 *   snapshot: unknown,
 *   onOutbound: (message: Record<string, unknown>) => void,
 * }) => Promise<WorkerIncarnation>} start `debugName` is for diagnostics
 *   only — it must not influence engine behavior
 * @property {(ref: unknown) => Promise<void>} [releaseSnapshot] release a
 *   superseded snapshot ref (e.g. drop its content-addressed store root);
 *   called after a newer snapshot is durably recorded
 */

/**
 * A worker as seen by the host embedder.
 *
 * @typedef {object} SiestaWorker
 * @property {string} workerId host-generated unguessable identifier
 * @property {string | undefined} debugLabel diagnostic label; appears
 *   only in logs and error messages, never used as an identifier
 * @property {(source: string, names?: Array<string>, values?: Array<any>) => Promise<any>} evaluate
 *   evaluates a hardened JavaScript expression in the worker's persistent
 *   compartment, with optional endowments bound as named values (the way
 *   resource capabilities reach guests)
 * @property {(presence: any, secret?: string) => Promise<string>} publish
 *   registers a presence imported from this worker in the host's locator
 *   under a swissnum, durably, and returns the swissnum
 * @property {() => boolean} isAwake
 * @property {() => Promise<void>} wake
 * @property {() => Promise<void>} sleep snapshots (if the engine can) and
 *   terminates the incarnation once the session is quiescent
 * @property {() => Promise<void>} retire permanently deletes this
 *   worker: live presences reject, inbound durable links tombstone
 *   (deliveries reject after restarts too), publications drop, and the
 *   worker's state and snapshot are removed. Retirement is a
 *   capability held by whoever holds the facade — the host has no
 *   retire-by-id operation; unreferenced workers die through
 *   `collectVats`
 */

/**
 * @typedef {object} SiestaHost
 * @property {Map<string, any>} locator swissnum-to-presence table, in the
 *   shape OCapN's `makeOcapn({ locator })` consumes
 * @property {(options?: { debugLabel?: string }) => Promise<SiestaWorker>} createWorker
 *   makes a fresh worker under a generated unguessable id; the optional
 *   `debugLabel` appears only in diagnostics
 * @property {(workerId: string) => SiestaWorker} getWorker returns the
 *   facade of an existing worker; throws for unknown ids. This is the
 *   embedder's admin/debug route — guests and peers reach workers only
 *   through capabilities (publications, links, facades)
 * @property {(type: string, description?: unknown) => object} makeResource
 *   makes a host resource capability from a registered maker; when the
 *   object is later exported into a worker session, its `(type,
 *   description)` is durably recorded against the export slot and the
 *   export is re-instantiated at resume
 * @property {(secret: string) => void} unpublish removes a publication
 *   from the locator and the store; without this a published vat could
 *   never become garbage
 * @property {(options?: { keep?: Array<string> }) => Promise<Array<string>>} collectVats
 *   vat-level mark-and-sweep: marks workers reachable from publications
 *   (plus awake workers and the `keep` list of worker ids) along durable
 *   cross-worker links, retires the rest, and returns the swept ids
 * @property {(value: object) => unknown} describeCapability the linkage
 *   seam for durable sessions: returns the kind-tagged durable
 *   description of a host-side capability (a made resource, or a
 *   presence/promise imported from a worker session), or undefined for
 *   values with no durable description
 * @property {(description: unknown) => object} provideCapability
 *   rebuilds a capability from its durable description, minting worker
 *   links at their recorded slots without waking anyone
 * @property {() => Array<string>} listWorkerIds
 * @property {() => Promise<void>} shutdown puts every worker to sleep
 */

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

const QUIESCENCE_TICKS = 1000;

// 128 random bits as lowercase hex: the shape of both worker ids and
// default publication swissnums.
const randomHex128 = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Makes a siesta host: the local half of a distributed ocap machine with
 * orthogonally persistent workers.
 *
 * The host holds one CapTP session per worker. The worker's half of each
 * session lives inside the worker's guest heap, where the engine's
 * snapshot (or journal replay) preserves it; the host's half is persisted
 * in the store as a tables record, an inbound-message journal, and slot
 * descriptors, and is resumed — not re-established — on restart via
 * `captp.provideImport`.
 *
 * Workers are sleepy: after `idleTimeoutMs` without traffic (and with no
 * questions in flight) a worker is snapshotted and terminated, and any
 * later message to one of its presences transparently wakes it.
 *
 * @param {object} options
 * @param {SiestaStore} options.store
 * @param {WorkerEngine} options.engine
 * @param {Map<string, any>} [options.locator]
 * @param {number} [options.idleTimeoutMs]
 * @param {Record<string, (description: unknown) => object>} [options.resources]
 *   resource makers by type: each maps a durable description to a fresh
 *   capability object, deterministically enough that a re-instantiated
 *   export honors the same contract as the original. The registry must be
 *   stable across host restarts.
 * @param {() => string} [options.makeSwissnum]
 * @param {(error: unknown) => void} [options.reportError]
 * @returns {Promise<SiestaHost>}
 */
export const makeSiestaHost = async ({
  store,
  engine,
  locator = new Map(),
  idleTimeoutMs = Infinity,
  resources = {},
  makeSwissnum = randomHex128,
  // eslint-disable-next-line no-console
  reportError = error => console.error('siesta host:', error),
}) => {
  /**
   * @typedef {object} WorkerRuntime
   * @property {SiestaWorker} facade
   * @property {(slot: string, iface?: string) => any} provideImport
   * @property {() => void} seatRestoredExports
   * @property {() => Promise<void>} retire
   * @property {(targetId: string) => void} tombstoneLinksTo
   * @property {() => Set<string>} getLinkTargets
   * @property {() => unknown} getSnapshotRef
   */

  /** @type {Map<string, WorkerRuntime>} */
  const workers = new Map();

  /**
   * Descriptions of resource objects made by this host, so that when one
   * is exported into a worker session its durable description can be
   * recorded against the export slot.
   *
   * @type {WeakMap<object, { type: string, description: unknown }>}
   */
  const resourceDescriptions = new WeakMap();

  /**
   * Which worker session each host-side presence was imported from, and
   * at which slot. Lets a presence exported into a *different* worker's
   * session be described durably as "import slot S of worker W" and
   * re-seated at resume without waking either worker.
   *
   * @type {WeakMap<object, { workerId: string, slot: string, iface: string | null }>}
   */
  const presenceOrigins = new WeakMap();

  /**
   * Resource makers by type: the embedder-provided registry plus the
   * built-in worker-controller and worker-facade makers (assembled after
   * the worker runtimes' functions are defined, before any runtime is
   * constructed).
   *
   * @type {Record<string, (description: unknown) => object>}
   */
  const resourceMakers = {};

  /**
   * Interned resource instances by (type, description), so the same
   * described resource seated in multiple worker sessions — or restored
   * after a restart — is one object with one identity, not a family of
   * lookalikes.
   *
   * @type {Map<string, object>}
   */
  const internedResources = new Map();

  /**
   * @param {{ type: string, description: unknown }} resourceRecord
   * @param {string} [forWhom] diagnostic context
   */
  const instantiateResource = (resourceRecord, forWhom = 'a new grant') => {
    const { type, description } = resourceRecord;
    const maker = resourceMakers[type];
    if (maker === undefined) {
      throw Fail`No resource maker registered for type ${q(
        type,
      )}, needed by ${q(forWhom)}`;
    }
    const internKey = `${type}:${JSON.stringify(description ?? null)}`;
    const interned = internedResources.get(internKey);
    if (interned !== undefined) {
      return interned;
    }
    const val = maker(description);
    resourceDescriptions.set(val, { type, description });
    internedResources.set(internKey, val);
    return val;
  };

  /**
   * Rebuilds an export from its recorded kind-tagged description.
   *
   * @param {unknown} description
   * @param {string} forWhom diagnostic context
   * @returns {object}
   */
  const instantiateDescribedExport = (description, forWhom) => {
    const record = /** @type {any} */ (description);
    if (record && record.kind === 'resource') {
      return instantiateResource(
        { type: record.type, description: record.description },
        forWhom,
      );
    }
    if (record && record.kind === 'worker-import') {
      // eslint-disable-next-line no-use-before-define
      const runtime = provideWorkerRuntime(record.workerId);
      return runtime.provideImport(record.slot, record.iface ?? undefined);
    }
    if (record && record.kind === 'retired') {
      // Tombstone for a link into a retired worker: deliveries reject.
      // (Promise-slot tombstones are produced by the per-session
      // instantiateExport wiring, which knows the slot type.)
      return Far('RetiredWorkerLink', {});
    }
    if (record && record.kind === 'worker-promise') {
      // A cross-worker promise link: re-mint the origin worker's promise
      // import — whose settler will receive the origin's eventual
      // CTP_RESOLVE — and hand it back for re-export, where
      // captp.provideExport re-attaches the resolution subscription
      // toward the importing worker. Neither worker wakes.
      // eslint-disable-next-line no-use-before-define
      const runtime = provideWorkerRuntime(record.workerId);
      return runtime.provideImport(record.slot);
    }
    throw Fail`Unknown export description for ${q(forWhom)}`;
  };

  /**
   * Releases a snapshot ref to the engine only if no worker's current
   * snapshot still uses it. Content-addressed refs are shared whenever
   * two workers have identical heaps, so unconditional release could
   * delete a sibling's live snapshot. (Non-primitive refs never compare
   * equal across workers, so at worst this keeps them — safe.)
   *
   * @param {unknown} ref
   */
  const releaseSnapshotIfUnshared = async ref => {
    if (ref === null || ref === undefined || !engine.releaseSnapshot) {
      return;
    }
    for (const otherId of store.listWorkerIds()) {
      const otherRef = store.provideWorkerStore(otherId).getMeta()
        .snapshot?.ref;
      if (otherRef === ref) {
        return;
      }
    }
    await engine.releaseSnapshot(ref);
  };

  /** @param {string} workerId */
  const makeWorkerRuntime = workerId => {
    assertWorkerId(workerId);
    const workerStore = store.provideWorkerStore(workerId);
    const { debugLabel } = workerStore.getMeta();
    // Diagnostics only: the label plus enough of the id to correlate
    // with the store on disk. Never an identifier.
    const debugName =
      debugLabel === undefined
        ? workerId.slice(0, 8)
        : `${debugLabel}(${workerId.slice(0, 8)})`;
    const tablesRecord =
      workerStore.getTablesRecord() ?? makeFreshTablesRecord();
    const tablesKit = makePersistentTablesKit({
      record: tablesRecord,
      onChange: () => workerStore.setTablesRecord(tablesRecord),
      // Export durability lives at the export-table layer: exporting a
      // value records its durable description in the tables record, and
      // seatRestoredExports below rebuilds it at resume. Host exports
      // live outside every snapshot, which is why they need this. Two
      // descriptions exist: made resources, and presences imported from
      // another worker's session (the cross-worker links the worker
      // controller creates).
      describeExport: val => {
        const resource = resourceDescriptions.get(val);
        if (resource !== undefined) {
          return { kind: 'resource', ...resource };
        }
        const origin = presenceOrigins.get(val);
        if (origin !== undefined && origin.workerId !== workerId) {
          const kind =
            origin.slot[0] === 'p' ? 'worker-promise' : 'worker-import';
          return { kind, ...origin };
        }
        return undefined;
      },
      instantiateExport: (description, slot) => {
        const record = /** @type {any} */ (description);
        if (record && record.kind === 'retired' && slot[0] === 'p') {
          // A promise link into a retired worker seats as a rejection,
          // which provideExport forwards to the importer's settler.
          const rejection = Promise.reject(
            Error(`worker ${record.workerId} has been retired`),
          );
          rejection.catch(() => {});
          return rejection;
        }
        return instantiateDescribedExport(
          description,
          `worker ${debugName} ${slot}`,
        );
      },
    });

    /** @type {WorkerIncarnation | undefined} */
    let incarnation;
    let replaying = false;
    let pendingQuestions = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let idleTimer;
    /** @type {Promise<void>} */
    let queue = Promise.resolve();

    /**
     * Serializes worker lifecycle transitions and deliveries so a wake
     * never races a sleep and messages stay ordered.
     *
     * @template T
     * @param {() => Promise<T>} thunk
     * @returns {Promise<T>}
     */
    const enqueue = thunk => {
      const turn = queue.then(thunk);
      queue = turn.then(
        () => {},
        () => {},
      );
      return turn;
    };

    /** Maps host-side values to their ours-perspective CapTP slots. */
    const valToSlot = new WeakMap();

    // eslint-disable-next-line no-use-before-define
    const bumpIdle = () => rearmIdleTimer();

    /**
     * Question IDs the worker has asked the host that the host has not
     * yet answered, mirrored durably in the worker's meta. The answering
     * computation lives only in host memory, so a host restart makes
     * these unanswerable; abortStaleGuestQuestions rejects them.
     *
     * @type {Set<string>}
     */
    const pendingGuestQuestions = new Set(
      workerStore.getMeta().pendingGuestQuestions ?? [],
    );
    const recordPendingGuestQuestions = () =>
      workerStore.setMeta({
        ...workerStore.getMeta(),
        pendingGuestQuestions: [...pendingGuestQuestions],
      });

    /**
     * Promise slots (ours-perspective) the host has exported into this
     * worker's session and not yet resolved, mirrored durably in the
     * worker's meta. The resolution subscription lives only in host
     * memory, so a host restart makes these unresolvable; the restart
     * path rejects them so a sleeping importer is not left waiting on a
     * resolution that can never arrive.
     *
     * @type {Set<string>}
     */
    const pendingPromiseExports = new Set(
      workerStore.getMeta().pendingPromiseExports ?? [],
    );
    const recordPendingPromiseExports = () =>
      workerStore.setMeta({
        ...workerStore.getMeta(),
        pendingPromiseExports: [...pendingPromiseExports],
      });

    /** @param {string} slot */
    const reverseSlot = slot =>
      `${slot[0]}${slot[1] === '+' ? '-' : '+'}${slot.slice(2)}`;

    /**
     * Absolute journal index of the live-delivered prefix. Entries below
     * it had their outbound effects processed by some host incarnation,
     * so wake replay suppresses the worker's re-emitted replies; entries
     * at or above it (synthetic aborts appended while asleep, messages
     * whose delivery failed) were never live-delivered, so the next wake
     * delivers them as fresh traffic whose effects the host must see.
     */
    let deliveredLength =
      workerStore.getMeta().deliveredLength ?? workerStore.journalLength();
    const recordDeliveredLength = () =>
      workerStore.setMeta({
        ...workerStore.getMeta(),
        deliveredLength,
      });
    if (workerStore.getMeta().deliveredLength === undefined) {
      // Pin the watermark durably before anything (synthetic aborts,
      // new sends) grows the journal past it.
      recordDeliveredLength();
    }

    /** @param {Record<string, unknown>} message */
    const onOutbound = message => {
      if (replaying) {
        // The host already processed this message in a previous
        // incarnation; its effects are in the persisted tables.
        return;
      }
      if (message.type === 'CTP_RETURN') {
        // Clamped: an answer to a question counted by a previous host
        // process (delivered late from the journal tail) must not drive
        // the counter negative.
        pendingQuestions = Math.max(0, pendingQuestions - 1);
      }
      if (
        message.type === 'CTP_CALL' &&
        typeof message.questionID === 'string'
      ) {
        pendingGuestQuestions.add(message.questionID);
        recordPendingGuestQuestions();
      }
      bumpIdle();
      // eslint-disable-next-line no-use-before-define
      captp.dispatch(message);
    };

    /** Must only run inside an enqueued turn. */
    const ensureAwakeNow = async () => {
      if (incarnation) {
        return;
      }
      const meta = workerStore.getMeta();
      const snapshotInfo = engine.canSnapshot ? meta.snapshot : undefined;
      const newIncarnation = await engine.start({
        debugName,
        snapshot: snapshotInfo ? snapshotInfo.ref : null,
        onOutbound,
      });
      incarnation = newIncarnation;
      try {
        const from = snapshotInfo ? (snapshotInfo.journalLength ?? 0) : 0;
        // The live-delivered prefix replays with the worker's re-emitted
        // replies suppressed: the host already processed them.
        replaying = true;
        try {
          for (const entry of workerStore
            .readJournal(from)
            .slice(0, Math.max(0, deliveredLength - from))) {
            // eslint-disable-next-line no-await-in-loop
            await newIncarnation.deliver(entry);
          }
        } finally {
          replaying = false;
        }
        // The tail — journaled but never live-delivered (synthetic
        // aborts, deliveries that failed) — is fresh traffic: the
        // worker's reactions must reach the host.
        for (const entry of workerStore.readJournal(deliveredLength)) {
          // eslint-disable-next-line no-await-in-loop
          await newIncarnation.deliver(entry);
          deliveredLength += 1;
          recordDeliveredLength();
        }
      } catch (error) {
        // A failed wake must not leave a half-replayed incarnation
        // looking awake: unwind so the next message retries from the
        // snapshot.
        incarnation = undefined;
        await newIncarnation.terminate().catch(() => {});
        throw error;
      }
      bumpIdle();
    };

    /**
     * Must only run inside an enqueued turn. Waits for quiescence (no
     * questions in flight), snapshots if the engine can, and terminates
     * the incarnation. The guest never observes any of this.
     */
    const sleepNow = async () => {
      if (!incarnation) {
        return;
      }
      for (let i = 0; pendingQuestions > 0; i += 1) {
        i < QUIESCENCE_TICKS ||
          Fail`worker ${q(debugName)} did not reach quiescence before sleep`;
        // eslint-disable-next-line no-await-in-loop
        await tick();
      }
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer);
        idleTimer = undefined;
      }
      if (engine.canSnapshot) {
        const journalLength = workerStore.journalLength();
        const ref = await incarnation.snapshot();
        const previousSnapshot = workerStore.getMeta().snapshot;
        // Record the new snapshot durably before dropping the journal
        // prefix it subsumes; a crash in between only costs disk space.
        workerStore.setMeta({
          ...workerStore.getMeta(),
          snapshot: { ref, journalLength },
        });
        workerStore.truncateJournal(journalLength);
        // Content-addressed refs alias: an unchanged heap re-suspends to
        // the same ref (and identical sibling heaps share entries), so
        // release only refs no current snapshot uses.
        if (previousSnapshot && previousSnapshot.ref !== ref) {
          await releaseSnapshotIfUnshared(previousSnapshot.ref);
        }
      }
      await incarnation.terminate();
      incarnation = undefined;
    };

    const rearmIdleTimer = () => {
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer);
        idleTimer = undefined;
      }
      if (idleTimeoutMs === Infinity || !incarnation) {
        return;
      }
      idleTimer = setTimeout(() => {
        idleTimer = undefined;
        enqueue(async () => {
          if (!incarnation || pendingQuestions > 0) {
            // Not idle after all; activity will re-arm the timer.
            return;
          }
          await sleepNow();
        }).catch(reportError);
      }, idleTimeoutMs);
      if (typeof idleTimer === 'object' && idleTimer !== null) {
        idleTimer.unref();
      }
    };

    /**
     * The host's half of the CapTP session sends by journaling first,
     * waking the worker if needed, then delivering.
     *
     * @param {Record<string, unknown>} message
     */
    let retired = false;

    const rawSend = message => {
      if (retired) {
        // The worker is being deleted; its journal is going with it.
        return Promise.resolve();
      }
      if (message.type === 'CTP_DISCONNECT') {
        // Orthogonal persistence's rule: workers never observe
        // disconnects. Journaling one would poison every future
        // incarnation with a replayed death.
        reportError(
          Error(
            `siesta host: suppressed CTP_DISCONNECT toward worker ${debugName}`,
          ),
        );
        return Promise.resolve();
      }
      return enqueue(async () => {
        // Wake before journaling so the replayed journal cannot include
        // this not-yet-delivered message.
        await ensureAwakeNow();
        workerStore.appendJournal(message);
        if (message.type === 'CTP_CALL' || message.type === 'CTP_BOOTSTRAP') {
          pendingQuestions += 1;
        }
        if (
          message.type === 'CTP_RETURN' &&
          typeof message.answerID === 'string' &&
          pendingGuestQuestions.has(message.answerID)
        ) {
          // The answer is durably journaled; the worker's question is no
          // longer at risk from a host restart.
          pendingGuestQuestions.delete(message.answerID);
          recordPendingGuestQuestions();
        }
        if (
          message.type === 'CTP_RESOLVE' &&
          typeof message.promiseID === 'string'
        ) {
          // The resolution is durably journaled; the promise export is
          // no longer at risk from a host restart. The wire carries the
          // worker's perspective; the record keeps ours.
          const ourSlot = reverseSlot(
            /** @type {string} */ (message.promiseID),
          );
          if (pendingPromiseExports.has(ourSlot)) {
            pendingPromiseExports.delete(ourSlot);
            recordPendingPromiseExports();
          }
          // A fulfilled cross-worker promise link must not be re-seated
          // by future restarts.
          tablesKit.clearExportDescription(ourSlot);
        }
        bumpIdle();
        try {
          await /** @type {WorkerIncarnation} */ (incarnation).deliver(message);
          deliveredLength = workerStore.journalLength();
          recordDeliveredLength();
        } catch (error) {
          // The message is journaled above the delivered watermark, so
          // the next wake delivers it as fresh traffic; swallowing here
          // keeps the CapTP session alive (rejecting would abort it and
          // orphan every presence for the rest of this host's life).
          reportError(error);
          const broken = incarnation;
          incarnation = undefined;
          if (broken) {
            await broken.terminate().catch(() => {});
          }
        }
      });
    };

    const captp = makeCapTP(`siesta-host:${debugName}`, rawSend, undefined, {
      gcImports: false,
      makeCapTPImportExportTables: tablesKit.makeCapTPImportExportTables,
      importHook: (val, slot) => {
        valToSlot.set(/** @type {object} */ (val), slot);
        if (slot[0] === 'o' || slot[0] === 'p') {
          // Record where this presence or promise came from, so its
          // export into another worker's session can be described
          // durably as a cross-worker link.
          presenceOrigins.set(/** @type {object} */ (val), {
            workerId,
            slot,
            iface: getInterfaceOf(val) || null,
          });
        }
      },
      exportHook: (_val, slot) => {
        if (slot[0] === 'p') {
          // A promise export is a resolution obligation held only in
          // host memory; record it so a restart can reject it.
          pendingPromiseExports.add(slot);
          recordPendingPromiseExports();
        }
      },
      onReject: reportError,
    });

    // Resume: seat every durably described export at its original slot,
    // so presences held inside the worker's snapshot keep working after
    // a host restart. Deferred out of runtime construction because a
    // worker-import description may name another worker whose runtime is
    // still being constructed; the host seats all runtimes' exports in a
    // second phase. Idempotent.
    let exportsSeated = false;
    const seatRestoredExports = () => {
      if (exportsSeated) {
        return;
      }
      exportsSeated = true;
      for (const { slot, val } of tablesKit.restoreExports()) {
        captp.provideExport(slot, val);
      }
    };

    // At-most-once for worker-to-host requests: questions outstanding
    // when a previous host process died are unanswerable, since the
    // answering computation lived only in host memory. Reject each with
    // a journaled synthetic answer, appended WITHOUT waking the worker —
    // the next wake's suffix replay delivers it to the settler preserved
    // in the worker's snapshot, so the guest sees an ordinary broken
    // promise instead of a hang. The host stays a pure forwarder: it
    // never re-executes a guest's request.
    {
      const staleQuestions = [...pendingGuestQuestions];
      if (staleQuestions.length > 0) {
        for (const questionID of staleQuestions) {
          const reason = harden(
            Error('siesta host restarted; pending request aborted'),
          );
          workerStore.appendJournal({
            type: 'CTP_RETURN',
            epoch: 0,
            answerID: questionID,
            exception: captp.serialize(reason),
          });
          pendingGuestQuestions.delete(questionID);
        }
        recordPendingGuestQuestions();
      }
      // Likewise for promises the previous host process exported but
      // never resolved — except cross-worker promise links, whose
      // durable descriptions let restoreExports re-seat them with a
      // fresh resolution subscription: those survive the restart and
      // must not be aborted. Only host-memory-only promises (no durable
      // description) reject, so a sleeping importer is not left waiting
      // on a resolution that can never arrive.
      const stalePromises = [...pendingPromiseExports].filter(
        slot => !tablesKit.hasExportDescription(slot),
      );
      if (stalePromises.length > 0) {
        for (const slot of stalePromises) {
          const reason = harden(
            Error('siesta host restarted; pending promise aborted'),
          );
          workerStore.appendJournal({
            type: 'CTP_RESOLVE',
            promiseID: reverseSlot(slot),
            rej: captp.serialize(reason),
          });
          pendingPromiseExports.delete(slot);
        }
        recordPendingPromiseExports();
      }
    }

    /** @type {Promise<any> | undefined} */
    let bootFacetP;
    const provideBootFacet = () => {
      if (bootFacetP) {
        return bootFacetP;
      }
      const meta = workerStore.getMeta();
      if (meta.bootSlot !== undefined) {
        // Resume: reconstruct the presence without waking the worker.
        bootFacetP = Promise.resolve(
          captp.provideImport(meta.bootSlot, meta.bootIface ?? undefined),
        );
      } else {
        // First boot: fetch the worker's bootstrap facet and record its
        // slot so later incarnations of the host can resume it.
        bootFacetP = (async () => {
          const facet = await captp.getBootstrap();
          const slot = valToSlot.get(facet);
          slot !== undefined ||
            Fail`Worker ${q(debugName)} bootstrap facet has no recorded slot`;
          workerStore.setMeta({
            ...workerStore.getMeta(),
            bootSlot: slot,
            bootIface: getInterfaceOf(facet) || null,
          });
          return facet;
        })();
      }
      return bootFacetP;
    };

    /** @type {SiestaWorker} */
    const facade = {
      workerId,
      debugLabel,
      evaluate: async (source, names = [], values = []) =>
        E(provideBootFacet()).evaluate(source, names, values),
      publish: async (presenceP, secret = makeSwissnum()) => {
        const presence = await presenceP;
        const slot = valToSlot.get(presence);
        slot !== undefined ||
          Fail`Can only publish presences imported from worker ${q(debugName)}`;
        slot[0] === 'o' ||
          Fail`Can only publish object presences, not ${q(slot)}`;
        store.setPublication(secret, {
          workerId,
          slot,
          iface: getInterfaceOf(presence) || null,
        });
        locator.set(secret, presence);
        return secret;
      },
      isAwake: () => incarnation !== undefined,
      wake: () => enqueue(ensureAwakeNow),
      sleep: () => enqueue(sleepNow),
      retire: async () => {
        const current = workers.get(workerId);
        if (current === undefined) {
          throw Fail`worker ${q(debugName)} is already retired`;
        }
        // eslint-disable-next-line no-use-before-define
        await deleteWorkerNow(workerId, current);
      },
    };
    harden(facade);

    /**
     * Permanently ends this worker: live presences reject via captp
     * abort (whose CTP_DISCONNECT rawSend suppresses), the incarnation
     * terminates without a snapshot, and no further traffic is
     * journaled. The caller (the facade's retire / collectVats)
     * removes the durable state.
     */
    const retireNow = async () => {
      retired = true;
      if (idleTimer !== undefined) {
        clearTimeout(idleTimer);
        idleTimer = undefined;
      }
      const broken = incarnation;
      incarnation = undefined;
      if (broken) {
        await broken.terminate().catch(() => {});
      }
      captp.abort(Error(`worker ${debugName} has been retired`));
    };

    /**
     * Rewrites this worker's durable links into the worker `targetId` as
     * retired tombstones, so restarts seat rejecting stand-ins instead
     * of resurrecting the link.
     *
     * @param {string} targetId
     */
    const tombstoneLinksTo = targetId => {
      let changed = false;
      for (const descriptor of Object.values(tablesRecord.exports)) {
        const description = /** @type {any} */ (descriptor.description);
        if (
          description &&
          (description.kind === 'worker-import' ||
            description.kind === 'worker-promise') &&
          description.workerId === targetId
        ) {
          descriptor.description = { kind: 'retired', workerId: targetId };
          changed = true;
        }
      }
      if (changed) {
        workerStore.setTablesRecord(tablesRecord);
      }
    };

    /** Worker ids this worker's durable links point into. */
    const getLinkTargets = () => {
      /** @type {Set<string>} */
      const targets = new Set();
      for (const descriptor of Object.values(tablesRecord.exports)) {
        const description = /** @type {any} */ (descriptor.description);
        if (
          description &&
          (description.kind === 'worker-import' ||
            description.kind === 'worker-promise')
        ) {
          targets.add(description.workerId);
        }
      }
      return targets;
    };

    /** @type {WorkerRuntime} */
    const runtime = harden({
      facade,
      provideImport: (slot, iface) => captp.provideImport(slot, iface),
      seatRestoredExports,
      retire: () => enqueue(retireNow),
      tombstoneLinksTo,
      getLinkTargets,
      getSnapshotRef: () => workerStore.getMeta().snapshot?.ref,
    });
    workers.set(workerId, runtime);
    return runtime;
  };

  // During host construction, export seating is deferred to the
  // second startup phase; afterwards, new runtimes seat immediately
  // (a genuinely new worker has nothing to seat).
  let restoring = true;

  /**
   * Returns the runtime of an existing worker, constructing it from the
   * store on demand during restore. Never creates a worker: an unknown
   * id is an error, so a retired worker's stale references fail loudly
   * instead of resurrecting an empty heap under its id.
   *
   * @param {string} workerId
   */
  const provideWorkerRuntime = workerId => {
    const existing = workers.get(workerId);
    if (existing) {
      return existing;
    }
    store.listWorkerIds().includes(workerId) ||
      Fail`No worker with id ${q(workerId)}`;
    const runtime = makeWorkerRuntime(workerId);
    if (!restoring) {
      runtime.seatRestoredExports();
    }
    return runtime;
  };

  /**
   * Makes a fresh worker under a generated unguessable id. The optional
   * debug label lands in the worker's meta before the runtime reads it,
   * and is used only in diagnostics.
   *
   * @param {string} [debugLabel]
   */
  const createWorkerRuntime = debugLabel => {
    debugLabel === undefined ||
      typeof debugLabel === 'string' ||
      Fail`debugLabel must be a string`;
    const workerId = randomHex128();
    const workerStore = store.provideWorkerStore(workerId);
    if (debugLabel !== undefined) {
      workerStore.setMeta({ ...workerStore.getMeta(), debugLabel });
    }
    const runtime = makeWorkerRuntime(workerId);
    runtime.seatRestoredExports();
    return runtime;
  };

  // Built-in resource types. The worker controller is how one worker
  // gains the authority to create and drive other workers; a worker
  // facade scopes that authority to a single worker. Both are durable
  // like any resource: a controller re-instantiates as itself, a facade
  // from its worker id.
  const makeWorkerFacadeResource = description => {
    const { workerId } = /** @type {{ workerId: string }} */ (description);
    assertWorkerId(workerId);
    return Far('SiestaWorkerFacade', {
      help: () =>
        'SiestaWorkerFacade: evaluate(source, names, values) evaluates in this worker with the given endowments; getId() returns the worker id; retire() permanently deletes the worker.',
      getId: () => workerId,
      /**
       * @param {string} source
       * @param {Array<string>} [names]
       * @param {Array<unknown>} [values]
       */
      evaluate: async (source, names = [], values = []) =>
        provideWorkerRuntime(workerId).facade.evaluate(source, names, values),
      retire: async () => provideWorkerRuntime(workerId).facade.retire(),
    });
  };
  const makeWorkerControllerResource = _description =>
    Far('SiestaWorkerController', {
      help: () =>
        'SiestaWorkerController: createWorker(debugLabel?) creates a new worker and returns its facade.',
      /** @param {string} [debugLabel] */
      createWorker: async debugLabel => {
        const runtime = createWorkerRuntime(debugLabel);
        // Instantiate through the resource system so the facade is
        // described durably when exported into a worker session.
        return instantiateResource(
          {
            type: 'worker-facade',
            description: { workerId: runtime.facade.workerId },
          },
          `controller createWorker(${debugLabel ?? ''})`,
        );
      },
    });
  Object.assign(resourceMakers, resources, {
    'worker-facade': makeWorkerFacadeResource,
    'worker-controller': makeWorkerControllerResource,
  });

  // Restore all persisted workers (asleep) and rebind publications.
  // Export seating is a second phase so cross-worker descriptions can
  // name runtimes constructed later in the loop.
  for (const workerId of store.listWorkerIds()) {
    provideWorkerRuntime(workerId);
  }
  for (const runtime of workers.values()) {
    runtime.seatRestoredExports();
  }
  restoring = false;
  for (const [secret, record] of Object.entries(store.getPublications())) {
    const runtime = workers.get(record.workerId);
    if (runtime === undefined) {
      throw Fail`Publication ${q(secret)} names unknown worker ${q(
        record.workerId,
      )}`;
    }
    const presence = runtime.provideImport(
      record.slot,
      record.iface ?? undefined,
    );
    locator.set(secret, presence);
  }

  /**
   * Deletes one worker completely: tombstones every other worker's
   * durable links into it, drops its publications, ends its runtime,
   * removes its durable state, and releases its snapshot if unshared.
   *
   * @param {string} workerId
   * @param {WorkerRuntime} runtime
   */
  const deleteWorkerNow = async (workerId, runtime) => {
    for (const [otherId, other] of workers.entries()) {
      if (otherId !== workerId) {
        other.tombstoneLinksTo(workerId);
      }
    }
    for (const [secret, record] of Object.entries(store.getPublications())) {
      if (record.workerId === workerId) {
        store.deletePublication(secret);
        locator.delete(secret);
      }
    }
    const snapshotRef = runtime.getSnapshotRef();
    await runtime.retire();
    workers.delete(workerId);
    store.deleteWorker(workerId);
    await releaseSnapshotIfUnshared(snapshotRef);
  };

  /** @type {SiestaHost} */
  const host = {
    locator,
    createWorker: async ({ debugLabel } = {}) =>
      createWorkerRuntime(debugLabel).facade,
    getWorker: workerId => {
      const runtime = workers.get(workerId);
      if (runtime === undefined) {
        throw Fail`No worker with id ${q(workerId)}`;
      }
      return runtime.facade;
    },
    makeResource: (type, description = null) =>
      instantiateResource({ type, description }),
    unpublish: secret => {
      store.deletePublication(secret);
      locator.delete(secret);
    },
    collectVats: async ({ keep = [] } = {}) => {
      // Mark: publications root the graph; awake workers and the keep
      // list are conservatively pinned. Propagate along durable
      // cross-worker links (holder keeps target alive). Reads only
      // table data — no worker wakes.
      const marked = new Set(keep);
      for (const record of Object.values(store.getPublications())) {
        marked.add(record.workerId);
      }
      for (const [workerId, runtime] of workers.entries()) {
        if (runtime.facade.isAwake()) {
          marked.add(workerId);
        }
      }
      const frontier = [...marked];
      while (frontier.length > 0) {
        const workerId = frontier.shift();
        const runtime = workers.get(/** @type {string} */ (workerId));
        if (runtime !== undefined) {
          for (const target of runtime.getLinkTargets()) {
            if (!marked.has(target)) {
              marked.add(target);
              frontier.push(target);
            }
          }
        }
      }
      // Sweep. Unmarked-to-unmarked links (including cycles) go down
      // together, so tombstoning between them is wasted but harmless.
      const swept = [...workers.keys()].filter(
        workerId => !marked.has(workerId),
      );
      for (const workerId of swept) {
        const runtime = /** @type {WorkerRuntime} */ (workers.get(workerId));
        // eslint-disable-next-line no-await-in-loop
        await deleteWorkerNow(workerId, runtime);
      }
      return harden(swept.sort());
    },
    describeCapability: value => {
      const resource = resourceDescriptions.get(value);
      if (resource !== undefined) {
        return harden({ kind: 'resource', ...resource });
      }
      const origin = presenceOrigins.get(value);
      if (origin !== undefined) {
        const kind =
          origin.slot[0] === 'p' ? 'worker-promise' : 'worker-import';
        return harden({ kind, ...origin });
      }
      return undefined;
    },
    provideCapability: description =>
      instantiateDescribedExport(description, 'a durable session export'),
    listWorkerIds: () => [...workers.keys()].sort(),
    shutdown: async () => {
      for (const runtime of workers.values()) {
        // eslint-disable-next-line no-await-in-loop
        await runtime.facade.sleep();
      }
    },
  };
  return harden(host);
};
harden(makeSiestaHost);
