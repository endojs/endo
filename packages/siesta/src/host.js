// @ts-check
/* global setTimeout, clearTimeout, crypto */
import harden from '@endo/harden';
import { makeCapTP } from '@endo/captp';
import { Fail, q } from '@endo/errors';
import { E } from '@endo/eventual-send';
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
 */

/**
 * A worker as seen by the host embedder.
 *
 * @typedef {object} SiestaWorker
 * @property {string} name
 * @property {(source: string) => Promise<any>} evaluate evaluates a
 *   hardened JavaScript expression in the worker's persistent compartment
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
 * @param {() => string} [options.makeSwissnum]
 * @param {(error: unknown) => void} [options.reportError]
 * @returns {Promise<SiestaHost>}
 */
export const makeSiestaHost = async ({
  store,
  engine,
  locator = new Map(),
  idleTimeoutMs = Infinity,
  makeSwissnum = defaultMakeSwissnum,
  // eslint-disable-next-line no-console
  reportError = error => console.error('siesta host:', error),
}) => {
  /**
   * @typedef {object} WorkerRuntime
   * @property {SiestaWorker} facade
   * @property {(slot: string, iface?: string) => any} provideImport
   */

  /** @type {Map<string, WorkerRuntime>} */
  const workers = new Map();

  /** @param {string} name */
  const makeWorkerRuntime = name => {
    assertWorkerName(name);
    const workerStore = store.provideWorkerStore(name);
    const tablesRecord =
      workerStore.getTablesRecord() ?? makeFreshTablesRecord();
    const tablesKit = makePersistentTablesKit({
      record: tablesRecord,
      onChange: () => workerStore.setTablesRecord(tablesRecord),
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

    /** @param {Record<string, unknown>} message */
    const onOutbound = message => {
      if (replaying) {
        // The host already processed this message in a previous
        // incarnation; its effects are in the persisted tables.
        return;
      }
      if (message.type === 'CTP_RETURN') {
        pendingQuestions -= 1;
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
      replaying = true;
      try {
        const from = snapshotInfo ? snapshotInfo.journalLength : 0;
        for (const entry of workerStore.readJournal(from)) {
          // eslint-disable-next-line no-await-in-loop
          await newIncarnation.deliver(entry);
        }
      } finally {
        replaying = false;
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
        const ref = await incarnation.snapshot();
        workerStore.setMeta({
          ...workerStore.getMeta(),
          snapshot: { ref, journalLength: workerStore.journalLength() },
        });
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
    const rawSend = message =>
      enqueue(async () => {
        // Wake before journaling so the replayed journal cannot include
        // this not-yet-delivered message.
        await ensureAwakeNow();
        workerStore.appendJournal(message);
        if (message.type === 'CTP_CALL' || message.type === 'CTP_BOOTSTRAP') {
          pendingQuestions += 1;
        }
        bumpIdle();
        await /** @type {WorkerIncarnation} */ (incarnation).deliver(message);
      });

    const captp = makeCapTP(`siesta-host:${name}`, rawSend, undefined, {
      gcImports: false,
      makeCapTPImportExportTables: tablesKit.makeCapTPImportExportTables,
      importHook: (val, slot) =>
        valToSlot.set(/** @type {object} */ (val), slot),
      onReject: reportError,
    });

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
      evaluate: async source => E(provideBootFacet()).evaluate(source),
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
    });
    workers.set(name, runtime);
    return runtime;
  };

  /** @param {string} name */
  const provideWorkerRuntime = name => {
    return workers.get(name) ?? makeWorkerRuntime(name);
  };

  // Restore all persisted workers (asleep) and rebind publications.
  for (const name of store.listWorkerNames()) {
    provideWorkerRuntime(name);
  }
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
