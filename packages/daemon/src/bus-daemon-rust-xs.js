// @ts-check
/* global issueCommand, hostSendRawFrame, hostTrace, hostGetPid, hostGetEnv, harden, Compartment */

/**
 * XS daemon bootstrap — entry point for the Endo daemon running in the
 * XS JavaScript engine under the Rust supervisor.
 *
 * This is the XS equivalent of bus-daemon-node.js. Instead of Node.js
 * APIs, it uses Rust host functions for filesystem, crypto, and process
 * operations, and the envelope protocol for worker spawning and client
 * connections.
 *
 * Globals expected (from polyfills.js + ses_boot.js):
 * - globalThis.assert, globalThis.harden, globalThis.HandledPromise
 * - TextEncoder, TextDecoder
 *
 * Host functions expected (from Rust):
 * - issueCommand, hostTrace (worker_io)
 * - hostReadFile, hostWriteFile, hostReadDir, hostMkdir, hostRemove,
 *   hostRename, hostExists, hostIsDir (powers/fs)
 * - hostSha256, hostSha256Init, hostSha256Update, hostSha256Finish,
 *   hostRandomHex256, hostEd25519Keygen, hostEd25519Sign (powers/crypto)
 * - hostGetPid, hostGetEnv, hostJoinPath, hostRealPath (powers/process)
 */

import { makeCapTP } from '@endo/captp';
import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { mapWriter, mapReader, makePipe } from '@endo/stream';

import { makeDaemon } from './daemon.js';
import {
  makeDaemonicPersistencePowers,
} from './daemon-persistence-powers.js';
import { makePetStoreMaker } from './pet-store.js';
import {
  makeMessageCapTP,
  messageToBytes,
  bytesToMessage,
} from './connection.js';
import {
  encodeEnvelope,
  decodeEnvelope,
} from './envelope.js';
import { makeXsFilePowers, makeXsCryptoPowers } from './bus-daemon-rust-xs-powers.js';

/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { ERef } from '@endo/eventual-send' */
/** @import { CapTpConnectionRegistrar, Config, DaemonWorkerFacet, WorkerDaemonFacet } from './types.js' */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// ---------------------------------------------------------------------------
// Console polyfill for XS (daemon.js uses console.log/error extensively)
// ---------------------------------------------------------------------------

if (typeof globalThis.console === 'undefined') {
  const makeLogFn =
    prefix =>
    (...args) => {
      const parts = args.map(a => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      });
      hostTrace(`${prefix}${parts.join(' ')}`);
    };
  globalThis.console = {
    log: makeLogFn(''),
    warn: makeLogFn('[warn] '),
    error: makeLogFn('[error] '),
    info: makeLogFn('[info] '),
    debug: makeLogFn('[debug] '),
    trace: makeLogFn('[trace] '),
  };
}

// ---------------------------------------------------------------------------
// setTimeout/clearTimeout polyfill for XS
// ---------------------------------------------------------------------------
// daemon.js uses setTimeout in delay() for grace period.
// In XS there is no timer API.  We provide a minimal shim that
// fires the callback synchronously (zero delay) since the XS
// daemon has no real event loop to defer to.

if (typeof globalThis.setTimeout === 'undefined') {
  let nextTimerId = 1;
  /** @type {Set<number>} */
  const activeTimers = new Set();

  globalThis.setTimeout = (/** @type {Function} */ fn, /** @type {number} */ _ms) => {
    const id = nextTimerId;
    nextTimerId += 1;
    activeTimers.add(id);
    // Execute immediately — XS has no event loop.
    // Use Promise.resolve to defer to microtask queue.
    void Promise.resolve().then(() => {
      if (activeTimers.has(id)) {
        activeTimers.delete(id);
        fn();
      }
    });
    return id;
  };

  globalThis.clearTimeout = (/** @type {number} */ id) => {
    activeTimers.delete(id);
  };
}

// ---------------------------------------------------------------------------
// URL polyfill for XS (daemon uses URL for endo:// locators)
// ---------------------------------------------------------------------------

if (typeof globalThis.URL === 'undefined') {
  /**
   * Minimal URL implementation sufficient for endo:// locators.
   * Only supports protocols of the form "scheme://host/path?query".
   *
   * @param {string} input
   */
  const URLPolyfill = function URL(input) {
    const protocolEnd = input.indexOf('://');
    if (protocolEnd === -1) throw new Error(`Invalid URL: ${input}`);
    this.protocol = `${input.slice(0, protocolEnd)}:`;
    const rest = input.slice(protocolEnd + 3);
    const pathStart = rest.indexOf('/');
    const queryStart = rest.indexOf('?');

    if (pathStart === -1 && queryStart === -1) {
      this.host = rest;
      this.hostname = rest;
      this.pathname = '/';
    } else if (queryStart !== -1 && (pathStart === -1 || queryStart < pathStart)) {
      this.host = rest.slice(0, queryStart);
      this.hostname = this.host;
      this.pathname = '/';
    } else {
      this.host = rest.slice(0, pathStart);
      this.hostname = this.host;
      const pathEnd = queryStart !== -1 ? queryStart : rest.length;
      this.pathname = rest.slice(pathStart, pathEnd);
    }

    /** @type {Array<[string, string]>} */
    const params = [];
    const qIdx = input.indexOf('?');
    if (qIdx !== -1) {
      const qs = input.slice(qIdx + 1);
      for (const pair of qs.split('&')) {
        if (!pair) continue;
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) {
          params.push([decodeURIComponent(pair), '']);
        } else {
          params.push([
            decodeURIComponent(pair.slice(0, eqIdx)),
            decodeURIComponent(pair.slice(eqIdx + 1)),
          ]);
        }
      }
    }

    this.searchParams = {
      /** @param {string} key @param {string} value */
      set(key, value) {
        // Remove existing entries for this key, then add.
        let i = params.length;
        while (i--) {
          if (params[i][0] === key) params.splice(i, 1);
        }
        params.push([key, value]);
      },
      /** @param {string} key @param {string} value */
      append(key, value) {
        params.push([key, value]);
      },
      /** @param {string} key @returns {string | null} */
      get(key) {
        for (const [k, v] of params) {
          if (k === key) return v;
        }
        return null;
      },
      /** @param {string} key @returns {string[]} */
      getAll(key) {
        return params.filter(([k]) => k === key).map(([, v]) => v);
      },
      /** @param {string} key @returns {boolean} */
      has(key) {
        return params.some(([k]) => k === key);
      },
      *keys() {
        for (const [k] of params) yield k;
      },
      /** @returns {string} */
      toString() {
        return params
          .map(
            ([k, v]) =>
              `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
          )
          .join('&');
      },
    };

    this.toString = () => {
      const qs = this.searchParams.toString();
      const base = `${this.protocol}//${this.hostname}${this.pathname}`;
      return qs ? `${base}?${qs}` : base;
    };

    Object.defineProperty(this, 'href', {
      get: () => this.toString(),
      enumerable: true,
      configurable: true,
    });
  };

  URLPolyfill.canParse = (/** @type {string} */ input) => {
    try {
      new URLPolyfill(input);
      return true;
    } catch {
      return false;
    }
  };

  globalThis.URL = /** @type {any} */ (URLPolyfill);
}

// ---------------------------------------------------------------------------
// Configuration from environment / command args
// ---------------------------------------------------------------------------

const pid = hostGetPid();
const sockPath = hostGetEnv('ENDO_SOCK_PATH') || '';
const statePath = hostGetEnv('ENDO_STATE_PATH') || '';
const ephemeralStatePath = hostGetEnv('ENDO_EPHEMERAL_STATE_PATH') || '';
const cachePath = hostGetEnv('ENDO_CACHE_PATH') || '';

/** @type {Config} */
const config = harden({
  sockPath,
  statePath,
  ephemeralStatePath,
  cachePath,
});

// ---------------------------------------------------------------------------
// Powers
// ---------------------------------------------------------------------------

const filePowers = makeXsFilePowers();
const cryptoPowers = makeXsCryptoPowers();

const petStorePowers = makePetStoreMaker(filePowers, config);
const daemonicPersistencePowers = makeDaemonicPersistencePowers(
  filePowers,
  cryptoPowers,
  config,
);

// ---------------------------------------------------------------------------
// Envelope I/O via issueCommand
// ---------------------------------------------------------------------------

/**
 * Send an envelope to the supervisor.
 *
 * Uses hostSendRawFrame which writes raw bytes as a CBOR frame,
 * without wrapping in a "deliver" envelope (unlike issueCommand
 * which is designed for workers that only send deliver messages).
 *
 * @param {number} handle
 * @param {string} verb
 * @param {Uint8Array} [payload]
 * @param {number} [nonce]
 */
const sendEnvelope = (handle, verb, payload, nonce) => {
  const data = encodeEnvelope({
    handle,
    verb,
    payload: payload || new Uint8Array(0),
    nonce: nonce || 0,
  });
  hostSendRawFrame(data);
};

// ---------------------------------------------------------------------------
// Worker spawn support (bus control powers)
// ---------------------------------------------------------------------------

const endoWorkerBin = hostGetEnv('ENDO_WORKER_BIN') || '';
const endoNodeWorkerBin = hostGetEnv('ENDO_NODE_WORKER_BIN') || '';

/** @type {Map<number, { resolve: (env: import('./envelope.js').Envelope) => void }>} */
const pendingSpawns = new Map();

/** @type {Map<number, { writer: import('@endo/stream').Writer<Uint8Array> }>} */
const workerWriters = new Map();

/** @type {Map<number, (value: undefined) => void>} */
const workerExitResolvers = new Map();

// Client CapTP sessions (connections bridged by supervisor).
/** @type {Map<number, { dispatch: (msg: Record<string, unknown>) => void, abort: () => void }>} */
const clientSessions = new Map();

let nextNonce = 1;

// Minimal CBOR helpers for spawn payloads (same as bus-daemon-node-powers.js)
const CBOR_UINT = 0;
const CBOR_TEXT = 3;
const CBOR_ARRAY = 4;
const CBOR_MAP = 5;

/**
 * @param {number[]} buf
 * @param {number} major
 * @param {number} n
 */
const cborHead = (buf, major, n) => {
  const m = major << 5;
  if (n < 24) {
    buf.push(m | n);
  } else if (n <= 0xff) {
    buf.push(m | 24, n);
  } else if (n <= 0xffff) {
    buf.push(m | 25, (n >> 8) & 0xff, n & 0xff);
  } else {
    buf.push(
      m | 26,
      (n >> 24) & 0xff,
      (n >> 16) & 0xff,
      (n >> 8) & 0xff,
      n & 0xff,
    );
  }
};

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {Uint8Array}
 */
const encodeSpawnPayload = (command, args) => {
  /** @type {number[]} */
  const buf = [];
  cborHead(buf, CBOR_MAP, 2);
  const commandKey = textEncoder.encode('command');
  cborHead(buf, CBOR_TEXT, commandKey.length);
  for (let i = 0; i < commandKey.length; i += 1) buf.push(commandKey[i]);
  const commandVal = textEncoder.encode(command);
  cborHead(buf, CBOR_TEXT, commandVal.length);
  for (let i = 0; i < commandVal.length; i += 1) buf.push(commandVal[i]);
  const argsKey = textEncoder.encode('args');
  cborHead(buf, CBOR_TEXT, argsKey.length);
  for (let i = 0; i < argsKey.length; i += 1) buf.push(argsKey[i]);
  cborHead(buf, CBOR_ARRAY, args.length);
  for (const arg of args) {
    const argVal = textEncoder.encode(arg);
    cborHead(buf, CBOR_TEXT, argVal.length);
    for (let i = 0; i < argVal.length; i += 1) buf.push(argVal[i]);
  }
  return new Uint8Array(buf);
};

/**
 * @param {Uint8Array} data
 * @returns {number}
 */
const decodeCborInt = data => {
  if (data.length === 0) throw new Error('CBOR: empty data for int');
  const initial = data[0];
  const major = initial >> 5;
  if (major !== CBOR_UINT) {
    throw new Error(`CBOR: expected uint (major 0), got major ${major}`);
  }
  const info = initial & 0x1f;
  if (info < 24) return info;
  if (info === 24 && data.length >= 2) return data[1];
  if (info === 25 && data.length >= 3) return (data[1] << 8) | data[2];
  if (info === 26 && data.length >= 5) {
    return (data[1] << 24) | (data[2] << 16) | (data[3] << 8) | data[4];
  }
  throw new Error(`CBOR: unsupported int encoding info=${info}`);
};

/**
 * @param {string} workerId
 * @param {DaemonWorkerFacet} daemonWorkerFacet
 * @param {Promise<never>} cancelled
 * @param {Promise<never>} _forceCancelled
 * @param {CapTpConnectionRegistrar} [capTpConnectionRegistrar]
 * @param {string[]} [_trustedShims]
 * @param {string} [_label]
 * @param {'locked' | 'node'} [kind]
 */
const makeWorker = async (
  workerId,
  daemonWorkerFacet,
  cancelled,
  _forceCancelled,
  capTpConnectionRegistrar = undefined,
  _trustedShims = undefined,
  _label = undefined,
  kind = undefined,
) => {
  await Promise.all([
    filePowers.makePath(filePowers.joinPath(statePath, 'worker', workerId)),
    filePowers.makePath(
      filePowers.joinPath(ephemeralStatePath, 'worker', workerId),
    ),
  ]);

  // For kind === 'node', use ENDO_NODE_WORKER_BIN so that unconfined
  // and bundle caplets run in a Node.js process. Otherwise use
  // ENDO_WORKER_BIN (the XS worker binary).
  hostTrace(`makeWorker: kind=${kind} nodeWorkerBin=${endoNodeWorkerBin} workerBin=${endoWorkerBin}`);
  let workerParts;
  if (kind === 'node' && endoNodeWorkerBin) {
    workerParts = endoNodeWorkerBin.split(/\s+/).filter(Boolean);
  } else {
    workerParts = (endoWorkerBin || 'node').split(/\s+/);
  }
  const command = workerParts[0];
  const args = workerParts.slice(1);

  const nonce = nextNonce;
  nextNonce += 1;

  const { promise: spawnResponse, resolve: resolveSpawn } =
    /** @type {import('@endo/promise-kit').PromiseKit<import('./envelope.js').Envelope>} */ (
      makePromiseKit()
    );
  pendingSpawns.set(nonce, { resolve: resolveSpawn });

  const payloadBuf = encodeSpawnPayload(command, args);
  sendEnvelope(0, 'spawn', payloadBuf, nonce);

  hostTrace(`Endo worker spawn requested for ${workerId} (nonce=${nonce})`);

  const response = await spawnResponse;

  if (response.verb === 'error') {
    const errorText = textDecoder.decode(response.payload);
    throw new Error(`Worker spawn failed: ${errorText}`);
  }

  const workerHandle = decodeCborInt(response.payload);
  hostTrace(`Endo worker spawned for ${workerId} handle=${workerHandle}`);

  // Set up CapTP session over envelope protocol.
  const [captpReadFrom, captpWriteTo] = makePipe();

  workerWriters.set(workerHandle, { writer: captpWriteTo });

  /** @type {import('@endo/stream').Writer<Uint8Array>} */
  const envelopeBytesWriter = harden({
    async next(/** @type {Uint8Array} */ chunk) {
      hostTrace(`daemon-xs: SEND to worker handle=${workerHandle} bytes=${chunk.length}`);
      sendEnvelope(workerHandle, 'deliver', chunk);
      return harden({ done: false, value: undefined });
    },
    async return(/** @type {undefined} */ _value) {
      return harden({ done: true, value: undefined });
    },
    async throw(/** @type {Error} */ _error) {
      return harden({ done: true, value: undefined });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  const messageWriter = mapWriter(envelopeBytesWriter, messageToBytes);
  const messageReader = mapReader(captpReadFrom, bytesToMessage);

  const workerClosed = new Promise(resolve => {
    workerExitResolvers.set(workerHandle, resolve);
    cancelled.catch(() => resolve(undefined));
  });

  const { getBootstrap, closed: capTpClosed } = makeMessageCapTP(
    `Worker ${workerId}`,
    messageWriter,
    messageReader,
    cancelled,
    daemonWorkerFacet,
    undefined,
    capTpConnectionRegistrar,
  );

  capTpClosed.finally(() => {
    workerWriters.delete(workerHandle);
    hostTrace(
      `Endo worker connection closed for handle=${workerHandle} id=${workerId}`,
    );
  });

  const workerTerminated = Promise.race([workerClosed, capTpClosed]);

  /** @type {ERef<WorkerDaemonFacet>} */
  const workerDaemonFacet = getBootstrap();

  return { workerTerminated, workerDaemonFacet };
};

const controlPowers = harden({ makeWorker });

// ---------------------------------------------------------------------------
// Assemble DaemonicPowers
// ---------------------------------------------------------------------------

const powers = harden({
  crypto: cryptoPowers,
  petStore: petStorePowers,
  persistence: daemonicPersistencePowers,
  control: controlPowers,
  filePowers,
});

// ---------------------------------------------------------------------------
// Daemon lifecycle
// ---------------------------------------------------------------------------

const { promise: cancelled, reject: cancel } =
  /** @type {PromiseKit<never>} */ (makePromiseKit());

let shouldTerminate = false;

/** @type {import('./daemon.js').DaemonResult | null} */
let daemonResult = null;

const main = async () => {
  const daemonLabel = `daemon[xs] on PID ${pid}`;
  hostTrace(`Endo daemon (xs) starting on PID ${pid}`);
  cancelled.catch(() => {
    hostTrace(`Endo daemon (xs) stopping on PID ${pid}`);
  });

  await daemonicPersistencePowers.initializePersistence();

  const gcEnabled = hostGetEnv('ENDO_GC') === '1';
  const result = await makeDaemon(powers, daemonLabel, cancel, cancelled, {}, {
    defaultWorkerKind: 'locked',
    gcEnabled,
  });
  daemonResult = result;
  const { endoBootstrap, cancelGracePeriod, capTpConnectionRegistrar } =
    result;

  // Persist root formula identifier.
  const host = await E(endoBootstrap).host();
  const agentId = /** @type {string} */ (await E(host).identify('@agent'));
  const agentIdPath = filePowers.joinPath(statePath, 'root');
  await filePowers.writeFileText(agentIdPath, `${agentId}\n`);

  // Store registrar for client connection setup.
  globalThis.__capTpRegistrar = capTpConnectionRegistrar;
  globalThis.__endoBootstrap = endoBootstrap;
  globalThis.__cancelGracePeriod = cancelGracePeriod;

  // Request supervisor to listen on Unix socket.
  const listenPayload = textEncoder.encode(JSON.stringify({ path: sockPath }));
  sendEnvelope(0, 'listen', listenPayload, 0);

  // Update endo.pid with our PID.
  const pidPath = filePowers.joinPath(ephemeralStatePath, 'endo.pid');
  await filePowers.writeFileText(pidPath, `${pid}\n`);

  // Signal readiness to supervisor.
  sendEnvelope(0, 'ready');
  hostTrace('Endo daemon (xs) ready, signaled supervisor');

  // Set flag for Rust main loop to detect init completion.
  globalThis.__daemonReady = true;
};

// ---------------------------------------------------------------------------
// Inbound envelope handler — called by Rust main loop
// ---------------------------------------------------------------------------

/**
 * Silent error handler for CapTP.
 *
 * @param {unknown} _err
 */
const silentReject = _err => {};

/**
 * Set up a CapTP session for a new client connection.
 *
 * @param {number} connectionHandle
 */
const setupClientSession = connectionHandle => {
  const bootstrap = globalThis.__endoBootstrap;
  const registrar = globalThis.__capTpRegistrar;
  if (!bootstrap) {
    hostTrace(`daemon-xs: client connect before daemon ready (handle=${connectionHandle})`);
    return;
  }

  /**
   * @param {Record<string, unknown>} message
   */
  const send = message => {
    const json = JSON.stringify(message);
    const bytes = textEncoder.encode(json);
    hostTrace(`daemon-xs: client SEND handle=${connectionHandle} type=${message.type || '?'}`);
    sendEnvelope(connectionHandle, 'deliver', bytes);
  };

  const { dispatch, abort } = makeCapTP(
    `Client ${connectionHandle}`,
    send,
    bootstrap,
    { onReject: silentReject },
  );

  clientSessions.set(connectionHandle, { dispatch, abort });
  hostTrace(`daemon-xs: client session created handle=${connectionHandle}`);
};

/**
 * Handle inbound envelopes from the supervisor.
 * Called by the Rust main loop for each envelope received on fd 4.
 *
 * @param {Uint8Array} bytes - raw envelope bytes (CBOR)
 */
globalThis.handleCommand = harden(bytes => {
  const data = bytes;
  const env = decodeEnvelope(data);

  // Worker spawn responses.
  if (env.verb === 'spawned' && env.nonce > 0) {
    const pending = pendingSpawns.get(env.nonce);
    if (pending) {
      pendingSpawns.delete(env.nonce);
      pending.resolve(env);
    }
    return;
  }

  if (env.verb === 'error' && env.nonce > 0) {
    const pending = pendingSpawns.get(env.nonce);
    if (pending) {
      pendingSpawns.delete(env.nonce);
      pending.resolve(
        /** @type {import('./envelope.js').Envelope} */ ({
          handle: env.handle,
          verb: 'error',
          payload: env.payload,
          nonce: env.nonce,
        }),
      );
    }
    return;
  }

  // Worker CapTP messages.
  if (env.verb === 'deliver') {
    const handle = env.handle;

    // Check if this is from a worker.
    const workerEntry = workerWriters.get(handle);
    if (workerEntry) {
      hostTrace(`daemon-xs: RECV from worker handle=${handle} bytes=${env.payload.length}`);
      void workerEntry.writer.next(env.payload);
      return;
    }

    // Check if this is from a client connection.
    const clientEntry = clientSessions.get(handle);
    if (clientEntry) {
      // Use hostDecodeUtf8 for large payloads — XS's TextDecoder is
      // extremely slow for buffers over ~100KB, causing the daemon to
      // hang on large CapTP round-trips (e.g. storeBlob with bundled
      // source code).
      const json = env.payload.length > 8192
        ? hostDecodeUtf8(env.payload)
        : textDecoder.decode(env.payload);
      const message = JSON.parse(json);
      hostTrace(`daemon-xs: client deliver handle=${handle} type=${message.type || '?'} method=${message.method || '?'}`);
      try {
        clientEntry.dispatch(message);
      } catch (_e) {
        // Swallow — handled by onReject.
      }
      return;
    }

    hostTrace(`daemon-xs: deliver from unknown handle=${handle}`);
    return;
  }

  // Worker exit notification.
  if (env.verb === 'exited') {
    const handle = env.handle;
    const resolve = workerExitResolvers.get(handle);
    if (resolve) {
      workerExitResolvers.delete(handle);
      resolve(undefined);
    }
    const entry = workerWriters.get(handle);
    if (entry) {
      void entry.writer.return(undefined);
    }
    return;
  }

  // Client connection (bridged by supervisor socket listener).
  if (env.verb === 'connect') {
    setupClientSession(env.handle);
    return;
  }

  // Client disconnection.
  if (env.verb === 'disconnect') {
    const session = clientSessions.get(env.handle);
    if (session) {
      session.abort();
      clientSessions.delete(env.handle);
    }
    return;
  }

  // Socket listener acknowledgement.
  if (env.verb === 'listening') {
    hostTrace('daemon-xs: supervisor reports socket listening');
    return;
  }

  hostTrace(`daemon-xs: unhandled envelope verb=${env.verb} handle=${env.handle}`);
});

/** Expose terminate flag for Rust to check. */
globalThis.__shouldTerminate = harden(() => shouldTerminate);

// Kick off initialization.
void main().catch(error => {
  hostTrace(`daemon-xs: startup error: ${error.message}\n${error.stack || 'no stack'}`);
  shouldTerminate = true;
});
