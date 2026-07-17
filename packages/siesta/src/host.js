// @ts-check
/* global setTimeout, clearTimeout, crypto */
import harden from '@endo/harden';
import { makeCapTP } from '@endo/captp';
import { Fail, q } from '@endo/errors';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';
import { getInterfaceOf } from '@endo/pass-style';

import { assertWorkerName } from './store-fs.js';
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
 *   workerName: string,
 *   snapshot: unknown,
 *   onOutbound: (message: Record<string, unknown>) => void,
 * }) => Promise<WorkerIncarnation>} start
 * @property {(ref: unknown) => Promise<void>} [releaseSnapshot] release a
 *   superseded snapshot ref (e.g. drop its content-addressed store root);
 *   called after a newer snapshot is durably recorded
 */

/**
 * A worker as seen by the host embedder.
 *
 * @typedef {object} SiestaWorker
 * @property {string} name
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
 */

/**
 * @typedef {object} SiestaHost
 * @property {Map<string, any>} locator swissnum-to-presence table, in the
 *   shape OCapN's `makeOcapn({ locator })` consumes
 * @property {(name: string) => Promise<SiestaWorker>} provideWorker
 * @property {(type: string, description?: unknown) => object} makeResource
 *   makes a host resource capability from a registered maker; when the
 *   object is later exported into a worker session, its `(type,
 *   description)` is durably recorded against the export slot and the
 *   export is re-instantiated at resume
 * @property {() => Array<string>} listWorkerNames
 * @property {() => Promise<void>} shutdown puts every worker to sleep
 */

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

const QUIESCENCE_TICKS = 1000;

const defaultMakeSwissnum = () => {
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
  makeSwissnum = defaultMakeSwissnum,
  // eslint-disable-next-line no-console
  reportError = error => console.error('siesta host:', error),
}) => {
  /**
   * @typedef {object} WorkerRuntime
   * @property {SiestaWorker} facade
   * @property {(slot: string, iface?: string) => any} provideImport
   * @property {() => void} seatRestoredExports
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
   * @type {WeakMap<object, { workerName: string, slot: string, iface: string | null }>}
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
      const runtime = provideWorkerRuntime(record.workerName);
      return runtime.provideImport(record.slot, record.iface ?? undefined);
    }
    if (record && record.kind === 'worker-promise') {
      // A cross-worker promise link: re-mint the origin worker's promise
      // import — whose settler will receive the origin's eventual
      // CTP_RESOLVE — and hand it back for re-export, where
      // captp.provideExport re-attaches the resolution subscription
      // toward the importing worker. Neither worker wakes.
      // eslint-disable-next-line no-use-before-define
      const runtime = provideWorkerRuntime(record.workerName);
      return runtime.provideImport(record.slot);
    }
    throw Fail`Unknown export description for ${q(forWhom)}`;
  };

  /** @param {string} name */
  const makeWorkerRuntime = name => {
    assertWorkerName(name);
    const workerStore = store.provideWorkerStore(name);
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
        if (origin !== undefined && origin.workerName !== name) {
          const kind =
            origin.slot[0] === 'p' ? 'worker-promise' : 'worker-import';
          return { kind, ...origin };
        }
        return undefined;
      },
      instantiateExport: (description, slot) =>
        instantiateDescribedExport(description, `worker ${name} ${slot}`),
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
        workerName: name,
        snapshot: snapshotInfo ? snapshotInfo.ref : null,
        onOutbound,
      });
      incarnation = newIncarnation;
      try {
        const from = snapshotInfo ? snapshotInfo.journalLength : 0;
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
          Fail`worker ${q(name)} did not reach quiescence before sleep`;
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
        // the same ref, and releasing "the previous" would delete the
        // snapshot just recorded.
        if (
          previousSnapshot &&
          engine.releaseSnapshot &&
          previousSnapshot.ref !== ref
        ) {
          await engine.releaseSnapshot(previousSnapshot.ref);
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
    const rawSend = message => {
      if (message.type === 'CTP_DISCONNECT') {
        // Orthogonal persistence's rule: workers never observe
        // disconnects. Journaling one would poison every future
        // incarnation with a replayed death.
        reportError(
          Error(`siesta host: suppressed CTP_DISCONNECT toward worker ${name}`),
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

    const captp = makeCapTP(`siesta-host:${name}`, rawSend, undefined, {
      gcImports: false,
      makeCapTPImportExportTables: tablesKit.makeCapTPImportExportTables,
      importHook: (val, slot) => {
        valToSlot.set(/** @type {object} */ (val), slot);
        if (slot[0] === 'o' || slot[0] === 'p') {
          // Record where this presence or promise came from, so its
          // export into another worker's session can be described
          // durably as a cross-worker link.
          presenceOrigins.set(/** @type {object} */ (val), {
            workerName: name,
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
            Fail`Worker ${q(name)} bootstrap facet has no recorded slot`;
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
      name,
      evaluate: async (source, names = [], values = []) =>
        E(provideBootFacet()).evaluate(source, names, values),
      publish: async (presenceP, secret = makeSwissnum()) => {
        const presence = await presenceP;
        const slot = valToSlot.get(presence);
        slot !== undefined ||
          Fail`Can only publish presences imported from worker ${q(name)}`;
        slot[0] === 'o' ||
          Fail`Can only publish object presences, not ${q(slot)}`;
        store.setPublication(secret, {
          workerName: name,
          slot,
          iface: getInterfaceOf(presence) || null,
        });
        locator.set(secret, presence);
        return secret;
      },
      isAwake: () => incarnation !== undefined,
      wake: () => enqueue(ensureAwakeNow),
      sleep: () => enqueue(sleepNow),
    };
    harden(facade);

    /** @type {WorkerRuntime} */
    const runtime = harden({
      facade,
      provideImport: (slot, iface) => captp.provideImport(slot, iface),
      seatRestoredExports,
    });
    workers.set(name, runtime);
    return runtime;
  };

  // During host construction, export seating is deferred to the
  // second startup phase; afterwards, new runtimes seat immediately
  // (a genuinely new worker has nothing to seat).
  let restoring = true;

  /** @param {string} name */
  const provideWorkerRuntime = name => {
    const existing = workers.get(name);
    if (existing) {
      return existing;
    }
    const runtime = makeWorkerRuntime(name);
    if (!restoring) {
      runtime.seatRestoredExports();
    }
    return runtime;
  };

  // Built-in resource types. The worker controller is how one worker
  // gains the authority to create and drive other workers; a worker
  // facade scopes that authority to a single named worker. Both are
  // durable like any resource: a controller re-instantiates as itself,
  // a facade from its worker name.
  const makeWorkerFacadeResource = description => {
    const { workerName } = /** @type {{ workerName: string }} */ (description);
    assertWorkerName(workerName);
    return Far('SiestaWorkerFacade', {
      help: () =>
        'SiestaWorkerFacade: evaluate(source, names, values) evaluates in this worker with the given endowments; getName() names the worker.',
      getName: () => workerName,
      /**
       * @param {string} source
       * @param {Array<string>} [names]
       * @param {Array<unknown>} [values]
       */
      evaluate: async (source, names = [], values = []) =>
        provideWorkerRuntime(workerName).facade.evaluate(source, names, values),
    });
  };
  const makeWorkerControllerResource = _description =>
    Far('SiestaWorkerController', {
      help: () =>
        'SiestaWorkerController: provideWorker(name) makes or finds a worker and returns its facade.',
      /** @param {string} workerName */
      provideWorker: async workerName => {
        assertWorkerName(workerName);
        // Instantiate through the resource system so the facade is
        // described durably when exported into a worker session.
        return instantiateResource(
          { type: 'worker-facade', description: { workerName } },
          `controller provideWorker(${workerName})`,
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
  for (const name of store.listWorkerNames()) {
    provideWorkerRuntime(name);
  }
  for (const runtime of workers.values()) {
    runtime.seatRestoredExports();
  }
  restoring = false;
  for (const [secret, record] of Object.entries(store.getPublications())) {
    const runtime = workers.get(record.workerName);
    if (runtime === undefined) {
      throw Fail`Publication ${q(secret)} names unknown worker ${q(
        record.workerName,
      )}`;
    }
    const presence = runtime.provideImport(
      record.slot,
      record.iface ?? undefined,
    );
    locator.set(secret, presence);
  }

  /** @type {SiestaHost} */
  const host = {
    locator,
    provideWorker: async name => provideWorkerRuntime(name).facade,
    makeResource: (type, description = null) =>
      instantiateResource({ type, description }),
    listWorkerNames: () => [...workers.keys()].sort(),
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
