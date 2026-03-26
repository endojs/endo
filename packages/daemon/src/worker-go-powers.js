// @ts-check
/* global process */

/**
 * Worker powers for workers spawned by the engo supervisor.
 *
 * These workers communicate with the daemon via envelope-framed CapTP
 * messages routed through engo. The pipe layout follows the Go
 * subprocess convention:
 *
 *   fd 3: worker writes to engo (child → parent)
 *   fd 4: worker reads from engo (parent → child)
 *
 * The worker reads an init envelope on startup to learn its handle,
 * then wraps/unwraps CapTP traffic in envelopes with verb "captp".
 * Engo routes these envelopes to/from the daemon using handle rewriting.
 */

import {
  encodeEnvelope,
  decodeEnvelope,
  readFrameFromStream,
  writeFrameToStream,
} from './envelope.js';

/** @import { MignonicPowers } from './types.js' */
/** @import { Reader, Writer } from '@endo/stream' */

/**
 * @param {object} modules
 * @param {typeof import('fs')} modules.fs
 * @param {typeof import('url')} modules.url
 * @returns {MignonicPowers}
 */
export const makePowers = ({ fs, url }) => {
  // Open the envelope protocol pipes.
  // fd 3: worker writes envelopes to engo.
  // @ts-ignore This is in fact how you open a file descriptor.
  const writeStream = fs.createWriteStream(null, { fd: 3 });
  // fd 4: worker reads envelopes from engo.
  // @ts-ignore This is in fact how you open a file descriptor.
  const readStream = fs.createReadStream(null, { fd: 4 });

  // The daemon handle is discovered from incoming envelopes (the handle
  // field is rewritten by engo to the sender's handle, which is the
  // daemon's handle).
  let daemonHandle = 1; // Default; updated on first received message.

  // Create the CapTP connection reader/writer.
  // The reader yields CapTP frame bytes extracted from incoming envelopes.
  // The writer wraps CapTP frame bytes in envelopes and sends them.

  /** @type {((value: IteratorResult<Uint8Array>) => void) | null} */
  let readerResolve = null;
  /** @type {boolean} */
  let readerDone = false;

  // Buffer for received CapTP frames that arrive before next() is called.
  /** @type {Uint8Array[]} */
  const frameBuffer = [];

  // Restart the reading loop with proper buffering.
  const startBufferedReading = () => {
    const loop = async () => {
      // First, consume the init envelope.
      const initFrame = await readFrameFromStream(readStream);
      if (initFrame === null) {
        throw new Error('worker-go: EOF before init envelope');
      }
      const initEnv = decodeEnvelope(initFrame);
      if (initEnv.verb !== 'init') {
        throw new Error(`worker-go: expected init, got ${initEnv.verb}`);
      }
      console.error(`Endo worker (go) received init, handle=${initEnv.handle}`);

      for (;;) {
        const frameData = await readFrameFromStream(readStream);
        if (frameData === null) {
          readerDone = true;
          if (readerResolve) {
            readerResolve({ done: true, value: undefined });
            readerResolve = null;
          }
          return;
        }
        const env = decodeEnvelope(frameData);

        // Update daemon handle from incoming messages.
        daemonHandle = env.handle;

        if (env.verb === 'captp') {
          if (readerResolve) {
            const resolve = readerResolve;
            readerResolve = null;
            resolve({ done: false, value: env.payload });
          } else {
            frameBuffer.push(env.payload);
          }
        }
      }
    };
    void loop().catch(err => {
      console.error('worker-go: envelope reader error:', err);
      readerDone = true;
      if (readerResolve) {
        readerResolve({ done: true, value: undefined });
        readerResolve = null;
      }
    });
  };

  startBufferedReading();

  /** @type {Reader<Uint8Array>} */
  const reader = harden({
    /** @returns {Promise<IteratorResult<Uint8Array>>} */
    next() {
      // Check buffer first.
      if (frameBuffer.length > 0) {
        const frame = /** @type {Uint8Array} */ (frameBuffer.shift());
        return Promise.resolve(harden({ done: false, value: frame }));
      }
      if (readerDone) {
        return Promise.resolve(harden({ done: true, value: undefined }));
      }
      return new Promise(resolve => {
        readerResolve = resolve;
      });
    },
    /** @returns {Promise<IteratorResult<Uint8Array>>} */
    return() {
      readerDone = true;
      return Promise.resolve(harden({ done: true, value: undefined }));
    },
    /** @returns {Promise<IteratorResult<Uint8Array>>} */
    throw() {
      readerDone = true;
      return Promise.resolve(harden({ done: true, value: undefined }));
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  /** @type {Writer<Uint8Array>} */
  const writer = harden({
    /** @param {Uint8Array} chunk */
    async next(chunk) {
      // Wrap the CapTP frame in an envelope addressed to the daemon.
      const envData = encodeEnvelope({
        handle: daemonHandle,
        verb: 'captp',
        payload: chunk,
        nonce: 0,
      });
      await writeFrameToStream(writeStream, envData);
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

  const connection = { reader, writer };

  const { pathToFileURL } = url;

  return harden({
    connection,
    pathToFileURL: (/** @type {string} */ path) =>
      pathToFileURL(path).toString(),
  });
};
