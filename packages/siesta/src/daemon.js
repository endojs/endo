// @ts-check
/* global crypto */
import harden from '@endo/harden';
import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { Fail, q } from '@endo/errors';
import { E, Far } from '@endo/far';
import { makeOcapn } from '@endo/ocapn';

import { makeDurableSessions } from './durable-sessions.js';
import { makeDurableWorkerTransport } from './durable-worker-transport.js';
import { assertWorkerId } from './store-fs.js';
import { makeWorkerSessionRecords } from './worker-session-records.js';

/**
 * @import {WorkerEngine} from './worker-engine.js'
 * @import {SiestaStore} from './store-fs.js'
 */

// 128 random bits as lowercase hex: the shape of both worker ids and
// default publication swissnums.
const randomHex128 = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

// The well-known swissnum of every worker's shell in its own locator.
const SHELL_SWISSNUM_TEXT = 'shell';

/**
 * Compose per-connection session hooks: each observer sees every event
 * and attributes only the connections it registered.
 *
 * @param {Array<Record<string, ((...args: Array<any>) => void) | undefined>>} hooksList
 */
const combineSessionHooks = hooksList => {
  /** @type {Record<string, (...args: Array<any>) => void>} */
  const combined = {};
  const names = new Set(hooksList.flatMap(hooks => Object.keys(hooks)));
  for (const name of names) {
    combined[name] = (...args) => {
      for (const hooks of hooksList) {
        const hook = hooks[name];
        if (hook !== undefined) {
          hook(...args);
        }
      }
    };
  }
  return harden(combined);
};

/**
 * The protocol-unified siesta daemon: ONE OCapN client for everything.
 *
 * Workers are OCapN peers over durable worker transports — each worker
 * session is established through the handshake-free `resumeSession`
 * seam with identity derived from the worker id, its frames journaled
 * against heap snapshots, its daemon-side exports described in
 * worker-session records. Remote peers connect through the injected
 * netlayer; with the durable netlayer, their sessions survive daemon
 * restarts through the same record-and-re-seat machinery. The daemon
 * itself is a relay: pipe-origin grants re-export as its own objects
 * (worker locations are unreachable by design), and settlements route
 * between sessions because both edges terminate in the same client.
 *
 * A restarted daemon re-establishes every worker session from the
 * store, re-seats recorded exports and publications without waking any
 * worker, and partitions each session's answer-position space by a
 * persisted epoch.
 *
 * @typedef {object} SiestaWorkerFacade
 * @property {string} workerId
 * @property {string | undefined} debugLabel
 * @property {(source: string, names?: Array<string>, values?: Array<unknown>) => Promise<any>} evaluate
 * @property {() => boolean} isAwake
 * @property {() => Promise<void>} wake
 * @property {() => Promise<void>} sleep
 * @property {() => Promise<void>} retire
 *
 * @typedef {object} SiestaDaemon
 * @property {Awaited<ReturnType<typeof makeOcapn>>} ocapn
 * @property {Map<string, any>} locator
 * @property {any} location this daemon's OCapN location; combine with a
 *   publication's swissnum to mint a sturdy ref on any peer
 * @property {(secret: string) => { location: any, secret: string }} makeSturdyRefDetails
 * @property {(options?: { debugLabel?: string }) => Promise<SiestaWorkerFacade>} createWorker
 * @property {(workerId: string) => SiestaWorkerFacade} getWorker
 * @property {() => Array<string>} listWorkerIds
 * @property {(name: string, description?: unknown) => object} makeResource
 * @property {(value: object, secret?: string) => string} publish
 * @property {(secret: string) => void} unpublish
 * @property {(options?: { keep?: Array<string> }) => Promise<Array<string>>} collectVats
 * @property {() => Promise<void>} shutdown park every worker (snapshot
 *   + terminate), sever the ducts, close the client
 * @property {() => Promise<void>} crash abandon this process's live
 *   state the way a real crash would: sever worker ducts (no frames,
 *   no snapshots), kill incarnations, close the network — the store is
 *   left exactly as a power failure would leave it, for a successor to
 *   recover from
 */

/**
 * @param {object} options
 * @param {SiestaStore} options.store
 * @param {WorkerEngine} options.engine
 * @param {any} options.codec an OCapN codec, e.g. `syrupCodec`
 * @param {(powers: { handlers: any, logger: any, resumption: any }) => Promise<any> | any} options.makeNetlayer
 * @param {Record<string, (description?: unknown) => object>} [options.resources]
 * @param {boolean} [options.verbose]
 * @returns {Promise<SiestaDaemon>}
 */
export const makeSiestaDaemon = async ({
  store,
  engine,
  codec,
  makeNetlayer,
  resources = {},
  verbose = false,
}) => {
  /** @type {Map<string, any>} */
  const locator = new Map();
  /** @type {Map<string, { transport: any, resumed: any, shellP?: Promise<any> }>} */
  const workers = new Map();

  // Built-ins are assigned below, after the daemon internals they
  // close over exist; records holds the live reference.
  /** @type {Record<string, (description?: unknown) => object>} */
  const resourceMakers = {};
  const records = makeWorkerSessionRecords({
    store,
    resources: resourceMakers,
  });
  const durableSessions = makeDurableSessions({
    store,
    linkage: harden({
      describeCapability: records.describeCapability,
      provideCapability: records.provideCapability,
    }),
  });

  /** @type {any} */
  let handlers;
  /** @type {{ netlayer?: any }} */
  const netlayerRef = {};
  const ocapn = await makeOcapn({
    codec,
    locator,
    verbose,
    debugLabel: 'siesta-daemon',
    sessionHooks: combineSessionHooks([
      records.sessionHooks,
      durableSessions.sessionHooks,
    ]),
    // Relay policy: pipe-origin grants re-export as the daemon's own
    // objects and the daemon proxies deliveries — worker locations are
    // unreachable by design. Handoffs between reachable peers are
    // unchanged.
    shouldHandoff: (/** @type {any} */ grantDetails) =>
      (grantDetails.location.network ?? grantDetails.location.transport) !==
      'siesta-pipe',
    network: (/** @type {any} */ h, /** @type {any} */ logger) => {
      handlers = h;
      return Promise.resolve(
        makeNetlayer({
          handlers: h,
          logger,
          resumption: durableSessions.resumption,
        }),
      ).then(netlayer => {
        netlayerRef.netlayer = netlayer;
        durableSessions.setNetlayer(netlayer);
        return netlayer;
      });
    },
  });
  netlayerRef.netlayer !== undefined ||
    Fail`makeNetlayer did not produce a netlayer`;
  const { location } = netlayerRef.netlayer;

  /** @param {string} workerId */
  const provideWorkerSession = workerId => {
    let entry = workers.get(workerId);
    if (entry === undefined) {
      const workerStore = store.provideWorkerStore(workerId);
      const transport = makeDurableWorkerTransport({
        workerId,
        store: workerStore,
        engine,
        handlers,
        codec,
        debugLabel: workerStore.getMeta().debugLabel,
      });
      records.registerWorkerConnection(transport.connection, workerId);
      const resumed = transport.establish();
      records.registerResumedSession(workerId, resumed);
      entry = { transport, resumed };
      workers.set(workerId, entry);
    }
    return entry;
  };

  /**
   * The worker's shell presence (its evaluate facet), fetched through
   * the session bootstrap on first use. Fetching wakes the worker.
   *
   * @param {string} workerId
   */
  const provideShell = workerId => {
    const entry = provideWorkerSession(workerId);
    if (entry.shellP === undefined) {
      entry.shellP = ocapn
        .provideSession(entry.transport.peerLocation)
        .then((/** @type {any} */ session) =>
          E(session.getBootstrap()).fetch(
            bytesToImmutable(new TextEncoder().encode(SHELL_SWISSNUM_TEXT)),
          ),
        );
    }
    return entry.shellP;
  };

  /** @param {string} workerId */
  const retireWorkerNow = async workerId => {
    const entry = workers.get(workerId);
    if (entry !== undefined) {
      workers.delete(workerId);
      await entry.transport.retire();
    }
    // Publications rooted in the retired worker go with it.
    for (const [secret, description] of Object.entries(
      store.getPublications(),
    )) {
      const desc = /** @type {any} */ (description);
      if (
        (desc.kind === 'link' && desc.workerId === workerId) ||
        (desc.kind === 'resource' &&
          desc.name === 'worker-facade' &&
          desc.description?.workerId === workerId)
      ) {
        store.deletePublication(secret);
        locator.delete(secret);
      }
    }
    store.deleteWorker(workerId);
  };

  /**
   * The embedder's admin route to a worker. Guests and peers reach
   * workers only through capabilities (shells, facades, publications).
   *
   * @param {string} workerId
   * @returns {SiestaWorkerFacade}
   */
  const makeAdminFacade = workerId => {
    const entryOf = () => {
      const entry = workers.get(workerId);
      if (entry === undefined) {
        throw Fail`worker ${q(workerId)} has been retired`;
      }
      return entry;
    };
    return harden({
      workerId,
      debugLabel: store.provideWorkerStore(workerId).getMeta().debugLabel,
      evaluate: async (source, names = [], values = []) => {
        const shell = await provideShell(workerId);
        return E(shell).evaluate(source, names, values);
      },
      isAwake: () => entryOf().transport.isAwake(),
      wake: async () => entryOf().transport.wake(),
      sleep: async () => entryOf().transport.sleep(),
      retire: async () => retireWorkerNow(workerId),
    });
  };

  // Built-in resource types. The worker controller is how one worker
  // gains the authority to create and drive other workers; a worker
  // facade scopes that authority to a single worker. Both are durable
  // like any resource: a controller re-instantiates as itself, a
  // facade from its worker id.
  const makeWorkerFacadeResource = (/** @type {any} */ description) => {
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
      evaluate: async (source, names = [], values = []) => {
        const shell = await provideShell(workerId);
        return E(shell).evaluate(source, names, values);
      },
      retire: async () => retireWorkerNow(workerId),
    });
  };
  const makeWorkerControllerResource = () =>
    Far('SiestaWorkerController', {
      help: () =>
        'SiestaWorkerController: createWorker(debugLabel?) creates a new worker and returns its facade.',
      /** @param {string} [debugLabel] */
      createWorker: async debugLabel => {
        debugLabel === undefined ||
          typeof debugLabel === 'string' ||
          Fail`debugLabel must be a string`;
        const workerId = randomHex128();
        if (debugLabel !== undefined) {
          const workerStore = store.provideWorkerStore(workerId);
          workerStore.setMeta({ ...workerStore.getMeta(), debugLabel });
        }
        provideWorkerSession(workerId);
        // Instantiate through the resource system so the facade is
        // described durably when exported into a worker session.
        return records.provideResource('worker-facade', { workerId });
      },
    });
  Object.assign(resourceMakers, resources, {
    'worker-facade': makeWorkerFacadeResource,
    'worker-controller': makeWorkerControllerResource,
  });

  /**
   * The worker ids a session record keeps alive: link exports and
   * worker-facade resource exports.
   *
   * @param {Record<string, any>} descriptions slot/secret -> description
   */
  const linkTargetsOf = descriptions => {
    /** @type {Array<string>} */
    const targets = [];
    for (const description of Object.values(descriptions)) {
      if (description === null || description === undefined) {
        // eslint-disable-next-line no-continue
        continue;
      }
      if (description.kind === 'link') {
        targets.push(description.workerId);
      } else if (
        description.kind === 'resource' &&
        description.name === 'worker-facade'
      ) {
        targets.push(description.description?.workerId);
      }
    }
    return targets.filter(target => typeof target === 'string');
  };

  // Restore every persisted worker session (asleep), then re-seat
  // recorded exports and publications. Two phases, because links can
  // point both ways.
  for (const workerId of store.listWorkerIds()) {
    provideWorkerSession(workerId);
  }
  for (const workerId of workers.keys()) {
    records.restoreWorker(workerId);
  }
  records.restorePublications(locator);

  /** @type {SiestaDaemon} */
  const daemon = {
    ocapn,
    locator,
    location,
    makeSturdyRefDetails: secret => harden({ location, secret }),
    createWorker: async ({ debugLabel } = {}) => {
      debugLabel === undefined ||
        typeof debugLabel === 'string' ||
        Fail`debugLabel must be a string`;
      const workerId = randomHex128();
      if (debugLabel !== undefined) {
        const workerStore = store.provideWorkerStore(workerId);
        workerStore.setMeta({ ...workerStore.getMeta(), debugLabel });
      }
      provideWorkerSession(workerId);
      return makeAdminFacade(workerId);
    },
    getWorker: workerId => {
      workers.has(workerId) || Fail`unknown worker ${q(workerId)}`;
      return makeAdminFacade(workerId);
    },
    listWorkerIds: () => [...workers.keys()].sort(),
    makeResource: (name, description = null) =>
      records.provideResource(name, description),
    publish: (value, secret = randomHex128()) => {
      records.publish(locator, secret, value);
      return secret;
    },
    unpublish: secret => {
      locator.delete(secret);
      store.deletePublication(secret);
    },
    collectVats: async ({ keep = [] } = {}) => {
      // Mark: publications root the graph; awake workers and the keep
      // list are conservatively pinned. Propagate along durable
      // cross-worker links (holder keeps target alive). Reads only
      // record data — no worker wakes.
      const marked = new Set(keep);
      for (const target of linkTargetsOf(store.getPublications())) {
        marked.add(target);
      }
      for (const [workerId, entry] of workers.entries()) {
        if (entry.transport.isAwake()) {
          marked.add(workerId);
        }
      }
      const frontier = [...marked];
      while (frontier.length > 0) {
        const workerId = /** @type {string} */ (frontier.shift());
        if (!workers.has(workerId)) {
          // eslint-disable-next-line no-continue
          continue;
        }
        const record = /** @type {any} */ (
          store.provideWorkerStore(workerId).getTablesRecord() ?? {}
        );
        for (const target of linkTargetsOf(record.exports ?? {})) {
          if (!marked.has(target)) {
            marked.add(target);
            frontier.push(target);
          }
        }
      }
      // Sweep. Unmarked-to-unmarked links (including cycles) go down
      // together.
      const swept = [...workers.keys()].filter(
        workerId => !marked.has(workerId),
      );
      for (const workerId of swept) {
        // eslint-disable-next-line no-await-in-loop
        await retireWorkerNow(workerId);
      }
      return harden(swept.sort());
    },
    shutdown: async () => {
      // Snapshot and park every worker, then sever the ducts so the
      // dying client's session aborts never reach the journals, then
      // close the client (durable netlayers park their sessions).
      for (const entry of workers.values()) {
        // eslint-disable-next-line no-await-in-loop
        await entry.transport.sleep();
      }
      for (const entry of workers.values()) {
        entry.transport.connection.end();
      }
      ocapn.shutdown();
    },
    crash: async () => {
      // Sever first so nothing — including finalization-driven GC
      // frames from this dying process — reaches the journals a
      // successor may already be appending to.
      for (const entry of workers.values()) {
        entry.transport.connection.end();
      }
      for (const entry of workers.values()) {
        // eslint-disable-next-line no-await-in-loop
        await entry.transport.crash();
      }
      ocapn.shutdown();
    },
  };
  return harden(daemon);
};
harden(makeSiestaDaemon);
