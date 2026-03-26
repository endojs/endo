// @ts-check
/* global process */
/* eslint-disable no-void */

/**
 * Daemonic powers for the Go (engo) platform.
 *
 * This module is a derivative of daemon-node-powers.js. It shares all powers
 * except for control powers (makeWorker), which requests worker spawns from
 * the engo supervisor via the envelope protocol instead of using
 * child_process.fork().
 *
 * The envelope protocol runs on fd 3 (child→parent) and fd 4 (parent→child),
 * using CBOR-framed envelopes.
 */

import { makePromiseKit } from '@endo/promise-kit';
import { makeNetstringCapTP } from './connection.js';
import { makePetStoreMaker } from './pet-store.js';
import { decodeEnvelope, readFrameFromStream } from './envelope.js';
import {
  makeFilePowers,
  makeCryptoPowers,
  makeDaemonicPersistencePowers,
} from './daemon-node-powers.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { CapTpConnectionRegistrar, Config, CryptoPowers, DaemonWorkerFacet, DaemonicPowers, FilePowers, WorkerDaemonFacet } from './types.js' */

// Re-export shared powers from daemon-node-powers.
export { makeFilePowers, makeCryptoPowers, makeDaemonicPersistencePowers };

/**
 * @typedef {object} EnvelopeChannel
 * @property {(handle: number, verb: string, payload?: Uint8Array, nonce?: number) => Promise<void>} sendEnvelope
 * @property {import('stream').Readable} envelopeReadStream
 */

/**
 * Create control powers that spawn workers through the engo supervisor.
 *
 * Instead of calling child_process.fork(), this sends a "spawn" envelope
 * to engo (handle 0). Engo spawns the worker as a peer subprocess and
 * routes messages between daemon and worker via handle rewriting.
 *
 * CapTP traffic between daemon and worker is encapsulated in envelopes
 * with verb "captp". The daemon demultiplexes incoming envelopes by
 * handle to dispatch to the correct per-worker CapTP session.
 *
 * @param {Config} config
 * @param {import('url').fileURLToPath} fileURLToPath
 * @param {FilePowers} filePowers
 * @param {EnvelopeChannel} envelopeChannel
 */
export const makeDaemonicGoControlPowers = (
  config,
  fileURLToPath,
  filePowers,
  envelopeChannel,
) => {
  const { sendEnvelope, envelopeReadStream } = envelopeChannel;

  const endoWorkerPath =
    process.env.ENDO_WORKER_SUBPROCESS_PATH ||
    fileURLToPath(new URL('worker-go.js', import.meta.url));

  /** @type {Map<number, { resolve: (env: import('./envelope.js').Envelope) => void }>} */
  const pendingSpawns = new Map();

  /** @type {Map<number, { writer: import('@endo/stream').Writer<Uint8Array> }>} */
  const workerWriters = new Map();

  /** @type {Map<number, (value: undefined) => void>} */
  const workerExitResolvers = new Map();

  let nextNonce = 1;

  // Start the envelope reader loop. This demultiplexes incoming envelopes:
  // - Envelopes with verb "spawned" are responses to spawn requests.
  // - Envelopes with verb "captp" are CapTP frames from workers,
  //   dispatched to the per-worker CapTP session.
  const startEnvelopeReader = () => {
    const readLoop = async () => {
      for (;;) {
        const frameData = await readFrameFromStream(envelopeReadStream);
        if (frameData === null) {
          // EOF — supervisor has closed the pipe.
          break;
        }
        const env = decodeEnvelope(frameData);

        if (env.verb === 'spawned' && env.nonce > 0) {
          // Response to a spawn request.
          const pending = pendingSpawns.get(env.nonce);
          if (pending) {
            pendingSpawns.delete(env.nonce);
            pending.resolve(env);
          }
          continue;
        }

        if (env.verb === 'error' && env.nonce > 0) {
          // Error response to a spawn request.
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
          continue;
        }

        if (env.verb === 'captp') {
          // CapTP frame from a worker. The handle field has been
          // rewritten by engo to the worker's handle.
          const workerHandle = env.handle;
          const entry = workerWriters.get(workerHandle);
          if (entry) {
            // Deliver the CapTP frame to the per-worker reader.
            // The payload is the raw netstring-framed CapTP bytes.
            void entry.writer.next(env.payload);
          }
          continue;
        }

        if (env.verb === 'exited') {
          // Worker exit notification from engo.
          const workerHandle = env.handle;
          const resolve = workerExitResolvers.get(workerHandle);
          if (resolve) {
            workerExitResolvers.delete(workerHandle);
            resolve(undefined);
          }
          // Close the CapTP writer so the session tears down.
          const entry = workerWriters.get(workerHandle);
          if (entry) {
            void entry.writer.return(undefined);
          }
          continue;
        }

        // Unhandled envelope verb — log and continue.
        console.error(
          `daemon-go: unhandled envelope verb=${env.verb} handle=${env.handle}`,
        );
      }
    };
    void readLoop().catch(error => {
      console.error('daemon-go: envelope reader error:', error);
    });
  };

  /**
   * Spawn a worker through engo.
   *
   * @param {string} workerId
   * @param {DaemonWorkerFacet} daemonWorkerFacet
   * @param {Promise<never>} cancelled
   * @param {Promise<never>} _forceCancelled
   * @param {CapTpConnectionRegistrar} [capTpConnectionRegistrar]
   * @param {string[]} [_trustedShims]
   */
  const makeWorker = async (
    workerId,
    daemonWorkerFacet,
    cancelled,
    _forceCancelled,
    capTpConnectionRegistrar = undefined,
    _trustedShims = undefined,
  ) => {
    const { statePath, ephemeralStatePath } = config;

    const workerStatePath = filePowers.joinPath(statePath, 'worker', workerId);
    const workerEphemeralStatePath = filePowers.joinPath(
      ephemeralStatePath,
      'worker',
      workerId,
    );

    await Promise.all([
      filePowers.makePath(workerStatePath),
      filePowers.makePath(workerEphemeralStatePath),
    ]);

    // Find the node executable.
    const nodePath = process.execPath;

    // Build spawn request: engo will spawn `node worker-go.js`
    const command = nodePath;
    const args = [endoWorkerPath];

    // Allocate a nonce for the spawn request.
    const nonce = nextNonce;
    nextNonce += 1;

    // Create a promise for the spawn response.
    const { promise: spawnResponse, resolve: resolveSpawn } =
      /** @type {import('@endo/promise-kit').PromiseKit<import('./envelope.js').Envelope>} */ (
        makePromiseKit()
      );
    pendingSpawns.set(nonce, { resolve: resolveSpawn });

    // Encode the spawn request payload as CBOR map {command, args}.
    const payloadBuf = encodeSpawnPayload(command, args);

    // Send spawn request to engo (handle 0).
    await sendEnvelope(0, 'spawn', payloadBuf, nonce);

    console.log(`Endo worker spawn requested for ${workerId} (nonce=${nonce})`);

    // Wait for engo to respond with the worker's handle.
    const response = await spawnResponse;

    if (response.verb === 'error') {
      const errorText = new TextDecoder().decode(response.payload);
      throw new Error(`Worker spawn failed: ${errorText}`);
    }

    // Decode the handle from the response payload.
    const workerHandle = decodeCborInt(response.payload);

    console.log(`Endo worker spawned for ${workerId} handle=${workerHandle}`);

    // Set up CapTP session over the envelope protocol.
    // Create a pipe pair for the CapTP layer. The daemon side writes
    // CapTP frames that get wrapped in envelopes and sent to the worker
    // via engo. Incoming CapTP frames from the worker arrive via the
    // envelope reader and are pushed into the reader side of the pipe.
    const { makePipe } = await import('@endo/stream');
    const [captpReadFrom, captpWriteTo] = makePipe();

    // Register this worker's writer so the envelope reader can deliver
    // CapTP frames.
    workerWriters.set(workerHandle, { writer: captpWriteTo });

    // Create a writer that wraps CapTP frames in envelopes addressed
    // to the worker's handle.
    /** @type {import('@endo/stream').Writer<Uint8Array>} */
    const envelopeCapTPWriter = harden({
      async next(/** @type {Uint8Array} */ chunk) {
        await sendEnvelope(workerHandle, 'captp', chunk);
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

    const workerClosed = new Promise(resolve => {
      workerExitResolvers.set(workerHandle, resolve);
      // Also resolve on cancellation so shutdown isn't blocked.
      cancelled.catch(() => resolve(undefined));
    });

    const { getBootstrap, closed: capTpClosed } = makeNetstringCapTP(
      `Worker ${workerId}`,
      envelopeCapTPWriter,
      captpReadFrom,
      cancelled,
      daemonWorkerFacet,
      undefined,
      capTpConnectionRegistrar,
    );

    capTpClosed.finally(() => {
      workerWriters.delete(workerHandle);
      console.log(
        `Endo worker connection closed for handle=${workerHandle} with unique identifier ${workerId}`,
      );
    });

    const workerTerminated = Promise.race([workerClosed, capTpClosed]);

    /** @type {ERef<WorkerDaemonFacet>} */
    const workerDaemonFacet = getBootstrap();

    return { workerTerminated, workerDaemonFacet };
  };

  return harden({
    makeWorker,
    startEnvelopeReader,
  });
};

/**
 * @param {object} opts
 * @param {Config} opts.config
 * @param {typeof import('url')} opts.url
 * @param {FilePowers} opts.filePowers
 * @param {CryptoPowers} opts.cryptoPowers
 * @param {(handle: number, verb: string, payload?: Uint8Array, nonce?: number) => Promise<void>} opts.sendEnvelope
 * @param {import('stream').Readable} opts.envelopeReadStream
 * @returns {DaemonicPowers}
 */
export const makeDaemonicGoPowers = ({
  config,
  url,
  filePowers,
  cryptoPowers,
  sendEnvelope,
  envelopeReadStream,
}) => {
  const { fileURLToPath } = url;

  const petStorePowers = makePetStoreMaker(filePowers, config);
  const daemonicPersistencePowers = makeDaemonicPersistencePowers(
    filePowers,
    cryptoPowers,
    config,
  );
  const daemonicControlPowers = makeDaemonicGoControlPowers(
    config,
    fileURLToPath,
    filePowers,
    { sendEnvelope, envelopeReadStream },
  );

  return harden({
    crypto: cryptoPowers,
    petStore: petStorePowers,
    persistence: daemonicPersistencePowers,
    control: daemonicControlPowers,
    filePowers,
  });
};

// ---------------------------------------------------------------------------
// Minimal CBOR helpers for spawn payloads
// ---------------------------------------------------------------------------

const CBOR_UINT = 0;
const CBOR_TEXT = 3;
const CBOR_ARRAY = 4;
const CBOR_MAP = 5;

const textEncoder = new TextEncoder();

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
 * Encode a spawn request payload as CBOR: {command: text, args: [text...]}.
 * This matches the Go DecodeSpawnRequest format.
 * @param {string} command
 * @param {string[]} args
 * @returns {Uint8Array}
 */
const encodeSpawnPayload = (command, args) => {
  /** @type {number[]} */
  const buf = [];
  cborHead(buf, CBOR_MAP, 2);
  // "command": text
  const commandKey = textEncoder.encode('command');
  cborHead(buf, CBOR_TEXT, commandKey.length);
  for (let i = 0; i < commandKey.length; i += 1) buf.push(commandKey[i]);
  const commandVal = textEncoder.encode(command);
  cborHead(buf, CBOR_TEXT, commandVal.length);
  for (let i = 0; i < commandVal.length; i += 1) buf.push(commandVal[i]);
  // "args": [text...]
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
 * Decode a single CBOR integer from bytes.
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
