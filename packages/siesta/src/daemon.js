// @ts-check
/* global crypto */
import harden from '@endo/harden';
import { decodeBase64, encodeBase64 } from '@endo/base64';
import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { Fail, q } from '@endo/errors';
import { E, Far } from '@endo/far';
import { makeOcapn } from '@endo/ocapn';
import { makeOcapnHub } from '@endo/ocapn/hub';
import { makeCryptography, makeSessionId } from '@endo/ocapn/cryptography';
import {
  readOcapnHandshakeMessage,
  writeOcapnHandshakeMessage,
} from '@endo/ocapn/operations';

import { makeDurableWorkerTransport } from './durable-worker-transport.js';
import { derivePipeResumption } from './pipe-network.js';
import { isSessionToken } from './store-fs.js';
import { makeWorkerSessionRecords } from './worker-session-records.js';

/**
 * @import {WorkerEngine} from './worker-engine.js'
 * @import {SiestaStore} from './store-fs.js'
 */

/**
 * The siesta daemon, hub edition: mostly a forwarding and
 * slot-rewriting hub, per design. The daemon is NOT an OCapN client —
 * the OCapN hub (`@endo/ocapn/hub`) routes every message between
 * sessions by structural transcoding over persisted c-list tables, so
 * the daemon reifies nothing that flows between workers and peers:
 * no presences, no promises, no subscriptions, no obligation rows.
 *
 * Sessions on the hub:
 * - each worker, over a durable worker transport (frames journaled
 *   against heap snapshots; the worker runs the full OCapN peer);
 * - each remote peer, over the injected netlayer (with the durable
 *   netlayer, frames and identity persist per resume token and the
 *   session reattaches to the hub on resume — the hub's tables carry
 *   the rest);
 * - ONE reifying endpoint: an in-process OCapN client that hosts the
 *   daemon's genuine objects (system resources, the worker
 *   controller) and gives the embedder its admin route (evaluate,
 *   publish). It is the only place values live, it is restored across
 *   restarts by the worker-session-records machinery (resources
 *   re-instantiated by name at their recorded positions, pending
 *   answers rejected at-most-once), and nothing routed between other
 *   sessions ever touches it.
 *
 * A daemon restart is: reload hub tables, reattach worker transports
 * (asleep), restore the endpoint's session, and let remote peers
 * resume. Positions are rows; nothing is re-seated because nothing
 * was reified.
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
 * @property {any} location this daemon's OCapN location; combine with a
 *   publication's swissnum to mint a sturdy ref on any peer
 * @property {(secret: string) => { location: any, secret: string }} makeSturdyRefDetails
 * @property {(options?: { debugLabel?: string }) => Promise<SiestaWorkerFacade>} createWorker
 * @property {(workerId: string) => SiestaWorkerFacade} getWorker
 * @property {() => Array<string>} listWorkerIds
 * @property {(name: string, description?: unknown) => object} makeResource
 * @property {(value: object, secret?: string) => string} publish
 * @property {(secret: string) => void} unpublish
 * @property {(secret: string) => Promise<any>} lookup the embedder's
 *   in-process route to a publication, through the endpoint
 * @property {(options?: { keep?: Array<string> }) => Promise<Array<string>>} collectVats
 * @property {() => Promise<void>} shutdown
 * @property {() => Promise<void>} crash abandon live state the way a
 *   power failure would; the store remains recoverable
 */

// 128 random bits as lowercase hex: worker ids and default swissnums.
const randomHex128 = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

const textEncoder = new TextEncoder();
const SHELL_SWISSNUM = bytesToImmutable(textEncoder.encode('shell'));
// The endpoint's pseudo-worker id: its session records (resource
// descriptions, pending answers) live in this worker store.
const ENDPOINT_ID = 'e'.repeat(32);
const ENDPOINT_SESSION = 'endpoint';

/**
 * @param {object} options
 * @param {SiestaStore} options.store
 * @param {WorkerEngine} options.engine
 * @param {any} options.codec an OCapN codec, e.g. `syrupCodec`
 * @param {(powers: { handlers: any, logger: any, resumption: any }) => Promise<any> | any} options.makeNetlayer
 * @param {Record<string, (description?: unknown) => object>} [options.resources]
 * @param {number} [options.idleSleepMs] park a worker after this long
 *   with no deliveries (see the durable worker transport's idle-sleep
 *   policy); omitted means workers sleep only on request
 * @param {boolean} [options.verbose]
 * @returns {Promise<SiestaDaemon>}
 */
export const makeSiestaDaemon = async ({
  store,
  engine,
  codec,
  makeNetlayer,
  resources = {},
  idleSleepMs = undefined,
  verbose = false,
}) => {
  const logError = verbose
    ? // eslint-disable-next-line no-console
      (...args) => console.error('siesta daemon:', ...args)
    : () => {};

  const hub = makeOcapnHub({
    codec,
    store: harden({
      getState: () => store.getHubState(),
      setState: (/** @type {any} */ state) => store.setHubState(state),
    }),
  });

  /** @type {Map<string, { transport: any, sink: any, shellP?: Promise<any> }>} */
  const workers = new Map();

  /** @param {string} workerId */
  const provideWorkerSession = workerId => {
    let entry = workers.get(workerId);
    if (entry === undefined) {
      const workerStore = store.provideWorkerStore(workerId);
      /** @type {any} */
      const holder = {};
      const transport = makeDurableWorkerTransport({
        workerId,
        store: workerStore,
        engine,
        idleSleepMs,
        debugLabel: workerStore.getMeta().debugLabel,
        onFrame: (/** @type {Uint8Array} */ bytes) =>
          holder.sink.deliver(bytes),
      });
      holder.sink = hub.attachSession(workerId, {
        send: (/** @type {Uint8Array} */ bytes) => transport.write(bytes),
        // The worker transport journals frames against heap snapshots;
        // hub frames toward a momentarily-detached worker session must
        // queue, never break.
        durable: true,
      });
      entry = { transport, sink: holder.sink };
      workers.set(workerId, entry);
    }
    return entry;
  };

  // --- the endpoint: the daemon's one reifying session ---

  // Records scoped to the endpoint: resource descriptions per export
  // slot, and at-most-once answer obligations. Links and forwarders
  // no longer arise — the hub carries all cross-session references.
  const resourceMakers = /** @type {Record<string, any>} */ ({});
  const records = makeWorkerSessionRecords({
    store,
    resources: resourceMakers,
  });

  /**
   * Endpoint import presence -> hub-facing position, for `publish`.
   * Weak, so the map does not itself pin every import the endpoint
   * ever saw.
   *
   * @type {WeakMap<object, bigint>}
   */
  const importPositions = new WeakMap();

  /** @type {any} */
  let endpointSink;
  /** @type {any} */
  let endpointHandlers;
  const endpointResumption = derivePipeResumption({
    codec,
    workerId: ENDPOINT_ID,
    role: 'worker',
  });
  const endpointClient = await makeOcapn({
    codec,
    debugLabel: 'siesta-endpoint',
    sessionHooks: {
      ...records.sessionHooks,
      onImport: (
        /** @type {any} */ connection,
        /** @type {string} */ slot,
        /** @type {object} */ value,
      ) => {
        if (slot[0] === 'o' && slot[1] === '-') {
          importPositions.set(value, BigInt(slot.slice(2)));
        }
      },
    },
    network: (/** @type {any} */ h) => {
      endpointHandlers = h;
      return harden({
        networkId: 'siesta-endpoint',
        codec,
        location: harden({
          type: /** @type {const} */ ('ocapn-peer'),
          network: 'siesta-endpoint',
          transport: 'siesta-endpoint',
          designator: 'endpoint',
          hints: /** @type {const} */ (false),
        }),
        shutdown: () => {},
      });
    },
  });
  // The endpoint's session with the hub: established through the
  // resumeSession seam (handshake-free, restorable exports), frames
  // flowing directly between the hub duct and the client's message
  // handler.
  const endpointConnection = harden({
    netlayer: harden({ location: endpointResumption.peerLocation }),
    isOutgoing: true,
    get isDestroyed() {
      return false;
    },
    write: (/** @type {Uint8Array} */ bytes) => endpointSink.deliver(bytes),
    end: () => {},
  });
  endpointSink = hub.attachSession(ENDPOINT_SESSION, {
    send: (/** @type {Uint8Array} */ bytes) =>
      endpointHandlers.handleMessageData(endpointConnection, bytes),
  });
  records.registerWorkerConnection(endpointConnection, ENDPOINT_ID);
  const endpointResumed = endpointHandlers.resumeSession(
    endpointConnection,
    endpointResumption,
  );
  records.registerResumedSession(ENDPOINT_ID, endpointResumed);

  // --- remote peers: netlayer sessions on the hub ---

  /** @type {Map<object, { deliver: any, detach: any, key: string } | undefined>} */
  const connectionSessions = new Map();
  const cryptography = makeCryptography(codec);

  /** @type {any} */
  const netlayerRef = {};

  /**
   * @param {any} connection
   * @param {string} sessionKey
   */
  const bindConnectionToHub = (connection, sessionKey) => {
    const sink = hub.attachSession(sessionKey, {
      send: (/** @type {Uint8Array} */ bytes) => connection.write(bytes),
      // Only resumable peers are durable: frames toward them queue
      // across a disconnect. An ephemeral peer that is gone is gone.
      durable: sessionKey.startsWith('peer:'),
      // A bad frame from beyond the process boundary aborts the
      // session and drops the connection.
      remote: true,
      onAbort: () => connection.end(),
    });
    connectionSessions.set(connection, {
      deliver: sink.deliver,
      detach: sink.detach,
      key: sessionKey,
    });
    return sink;
  };

  /** @param {any} connection */
  const sessionKeyForConnection = connection => {
    const { netlayer } = netlayerRef;
    const token =
      netlayer !== undefined && netlayer.getResumeToken !== undefined
        ? netlayer.getResumeToken(connection)
        : undefined;
    if (token !== undefined && isSessionToken(token)) {
      return `peer:${token}`;
    }
    // Ephemeral keys must be globally unique forever: a counter would
    // reset in a successor process and inherit the persisted hub
    // tables of a previous process's connection.
    return `conn:${randomHex128()}`;
  };

  const captpVersion = '1.0';

  /** @type {any} */
  const hubHandlers = harden({
    makeConnection: (
      /** @type {any} */ netlayer,
      /** @type {boolean} */ isOutgoing,
      /** @type {any} */ socket,
    ) => {
      let destroyed = false;
      /** @type {any} */
      const connection = harden({
        netlayer,
        isOutgoing,
        get isDestroyed() {
          return destroyed;
        },
        write: (/** @type {Uint8Array} */ bytes) => socket.write(bytes),
        end: () => {
          if (!destroyed) {
            destroyed = true;
            socket.end();
          }
        },
      });
      connectionSessions.set(connection, undefined);
      return connection;
    },
    handleMessageData: (
      /** @type {any} */ connection,
      /** @type {Uint8Array} */ data,
    ) => {
      const bound = connectionSessions.get(connection);
      if (bound !== undefined) {
        bound.deliver(data);
        return;
      }
      // Handshake: answer op:start-session with a per-connection
      // identity, then bind the connection to a hub session.
      try {
        const reader = codec.makeReader(data);
        const message = readOcapnHandshakeMessage(reader);
        message.type === 'op:start-session' ||
          Fail`expected op:start-session, got ${q(message.type)}`;
        message.captpVersion === captpVersion ||
          Fail`invalid captp version ${q(message.captpVersion)}`;
        const peerPublicKey = cryptography.makeOcapnPublicKey(
          message.sessionPublicKey.q,
        );
        cryptography.assertLocationSignatureValid(
          message.location,
          message.locationSignature,
          peerPublicKey,
          new ArrayBuffer(0),
        );
        const keyPair = cryptography.makeOcapnKeyPair();
        const { location } = netlayerRef.netlayer;
        const locationSignature = cryptography.signLocation(
          location,
          keyPair,
          new ArrayBuffer(0),
        );
        // Computed for protocol fidelity; the hub itself keys sessions
        // by resume token or connection, not by session id.
        makeSessionId(keyPair.publicKey.id, peerPublicKey.id);
        connection.write(
          writeOcapnHandshakeMessage(
            {
              type: 'op:start-session',
              captpVersion,
              sessionPublicKey: keyPair.publicKey.descriptor,
              location,
              locationSignature,
            },
            codec,
          ),
        );
        bindConnectionToHub(connection, sessionKeyForConnection(connection));
      } catch (error) {
        logError('handshake failed:', error);
        connection.write(
          writeOcapnHandshakeMessage(
            { type: 'op:abort', reason: 'invalid handshake' },
            codec,
          ),
        );
        connection.end();
      }
    },
    handleConnectionClose: (/** @type {any} */ connection) => {
      const bound = connectionSessions.get(connection);
      connectionSessions.delete(connection);
      if (bound === undefined) {
        return;
      }
      if (bound.key.startsWith('conn:')) {
        // An ephemeral peer never comes back: retire its rows (holders
        // break loudly) and drop its table entry — the key is never
        // reused.
        hub.forgetSession(bound.key);
      } else {
        // A resumable peer may return: detach so hub frames queue.
        bound.detach();
      }
    },
    resumeSession: () => {
      throw Error('siesta hub daemon: client resumeSession seam unused');
    },
  });

  /**
   * The netlayer's session-resumption power: frame-level durability in
   * the session stores (as before), but restoration just rebinds the
   * duct to the hub session — the tables are already there.
   */
  const resumption = harden({
    isDurableToken: (/** @type {string} */ token) => isSessionToken(token),
    onHello: (/** @type {string} */ token) => {
      store.deleteSession(token);
      store.provideSessionStore(token).setMeta({});
      // A fresh logical connection under a reused token supersedes any
      // prior hub session rows for it.
      hub.retireSession(`peer:${token}`);
    },
    loadForResume: (/** @type {string} */ token) => {
      if (!store.listSessionTokens().includes(token)) {
        return undefined;
      }
      const sessionStore = store.provideSessionStore(token);
      const meta = sessionStore.getMeta();
      if (meta.established === undefined) {
        return undefined;
      }
      const frames = sessionStore
        .readFrames()
        .map(({ n, b64 }) => ({ n, bytes: decodeBase64(b64) }));
      // A crash can land between the frame append and the sendSeq
      // meta write; the frames file is the authority on how far the
      // sequence actually advanced.
      const sendSeq = frames.reduce(
        (max, frame) => Math.max(max, Number(frame.n)),
        Number(meta.sendSeq ?? 0),
      );
      return {
        recvSeq: meta.recvSeq ?? 0,
        sendSeq,
        frames,
      };
    },
    restoreSession: (
      /** @type {any} */ _handlers,
      /** @type {any} */ connection,
      /** @type {string} */ token,
    ) => {
      // The peer resumed: its hub session rows are the session state.
      // No handshake, no re-seating; just rebind the duct.
      bindConnectionToHub(connection, `peer:${token}`);
    },
    recordOutbound: (
      /** @type {string} */ token,
      /** @type {number} */ n,
      /** @type {Uint8Array} */ bytes,
    ) => {
      const sessionStore = store.provideSessionStore(token);
      sessionStore.appendFrame({ n, b64: encodeBase64(bytes) });
      sessionStore.setMeta({
        ...sessionStore.getMeta(),
        sendSeq: n,
        established: true,
      });
    },
    recordAck: (/** @type {string} */ token, /** @type {number} */ n) => {
      store.provideSessionStore(token).truncateFramesUpTo(n);
    },
    recordInbound: (/** @type {string} */ token, /** @type {number} */ n) => {
      const sessionStore = store.provideSessionStore(token);
      sessionStore.setMeta({
        ...sessionStore.getMeta(),
        recvSeq: n,
        established: true,
      });
    },
    onEnd: (/** @type {string} */ token) => {
      store.deleteSession(token);
      hub.retireSession(`peer:${token}`);
    },
  });

  // --- the embedder API, through the endpoint ---

  const endpointSessionP = endpointClient.provideSession(
    endpointResumption.peerLocation,
  );

  /** @param {string | Uint8Array} secret */
  const lookup = async secret => {
    const session = await endpointSessionP;
    const bytes =
      typeof secret === 'string'
        ? bytesToImmutable(textEncoder.encode(secret))
        : bytesToImmutable(secret);
    return E(session.getBootstrap()).fetch(bytes);
  };

  /**
   * The worker's shell, reached by introducing the worker's bootstrap
   * into the endpoint session out of band — never via the publications
   * table, which roots vat GC.
   *
   * @param {string} workerId
   */
  const provideShell = workerId => {
    // Look up, never create: a retired worker must not come back as a
    // zombie session with no store behind it.
    const entry = workers.get(workerId);
    if (entry === undefined) {
      throw Fail`worker ${q(workerId)} has been retired`;
    }
    if (entry.shellP === undefined) {
      const facing = hub.introduce(ENDPOINT_SESSION, {
        session: workerId,
        position: 0n,
      });
      const bootstrap = endpointResumed.provideImport({
        type: 'o',
        position: facing,
      });
      entry.shellP = Promise.resolve(E(bootstrap).fetch(SHELL_SWISSNUM));
    }
    return entry.shellP;
  };

  /** @param {string} workerId */
  const retireWorkerNow = async workerId => {
    const entry = workers.get(workerId);
    if (entry !== undefined) {
      workers.delete(workerId);
      await entry.transport.retire();
      entry.sink.detach();
    }
    // Worker ids are random and never reused: drop the session's
    // table entry along with its rows.
    hub.forgetSession(workerId);
    store.deleteWorker(workerId);
  };

  /**
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

  // Built-in resources: live in the endpoint like any resource.
  const makeWorkerFacadeResource = (/** @type {any} */ description) => {
    const { workerId } = /** @type {{ workerId: string }} */ (description);
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
        return records.provideResource('worker-facade', { workerId });
      },
    });
  Object.assign(resourceMakers, resources, {
    'worker-facade': makeWorkerFacadeResource,
    'worker-controller': makeWorkerControllerResource,
  });

  // Restore: reattach every worker transport (asleep) and re-seat the
  // endpoint's recorded exports (resources by name; pending answers
  // reject at-most-once). Hub tables restored themselves.
  for (const workerId of store.listWorkerIds()) {
    if (workerId !== ENDPOINT_ID) {
      provideWorkerSession(workerId);
    }
  }
  records.restoreWorker(ENDPOINT_ID);

  // Only after every session is seated does the daemon accept
  // connections: an early resume must never race the restore.
  netlayerRef.netlayer = await makeNetlayer({
    handlers: hubHandlers,
    logger: harden({
      log: logError,
      error: logError,
      info: logError,
    }),
    resumption,
  });
  const { location } = netlayerRef.netlayer;

  /** @type {SiestaDaemon} */
  const daemon = {
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
      const position = importPositions.get(value);
      if (position === undefined) {
        throw Fail`publish: value is not an import held by the daemon endpoint`;
      }
      hub.publishHeld(secret, { session: ENDPOINT_SESSION, position });
      return secret;
    },
    unpublish: secret => hub.unpublish(secret),
    lookup,
    collectVats: async ({ keep = [] } = {}) => {
      const { publishedOrigins, holdings } = hub.inspect();
      const marked = new Set(keep);
      for (const origin of publishedOrigins) {
        if (workers.has(/** @type {string} */ (origin))) {
          marked.add(origin);
        }
      }
      for (const [workerId, entry] of workers.entries()) {
        if (entry.transport.isAwake()) {
          marked.add(workerId);
        }
      }
      // Holder keeps target: a worker stays if a remote peer, a
      // marked worker, or the keep list holds a reference into it.
      // The endpoint is deliberately not a root (its cached shells
      // must not pin every worker). Propagate to a fixpoint.
      const isRootHolder = (/** @type {string} */ holder) =>
        holder !== ENDPOINT_SESSION && !workers.has(holder);
      let changed = true;
      while (changed) {
        changed = false;
        for (const { origin, holders } of holdings) {
          if (workers.has(origin) && !marked.has(origin)) {
            if (
              holders.some(
                (/** @type {string} */ holder) =>
                  isRootHolder(holder) || marked.has(holder),
              )
            ) {
              marked.add(origin);
              changed = true;
            }
          }
        }
      }
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
      for (const entry of workers.values()) {
        // eslint-disable-next-line no-await-in-loop
        await entry.transport.sleep();
      }
      for (const entry of workers.values()) {
        entry.transport.end();
      }
      endpointClient.shutdown();
      netlayerRef.netlayer.shutdown();
    },
    crash: async () => {
      for (const entry of workers.values()) {
        entry.transport.end();
      }
      for (const entry of workers.values()) {
        // eslint-disable-next-line no-await-in-loop
        await entry.transport.crash();
      }
      endpointClient.shutdown();
      netlayerRef.netlayer.shutdown();
    },
  };
  return harden(daemon);
};
harden(makeSiestaDaemon);
