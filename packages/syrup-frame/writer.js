// @ts-check

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';

// Syrup grammar: <length> ":" <payload> (no trailing separator).
// Derived from @endo/netstring; the only behavioral difference is that
// the writer emits no trailing comma after the payload.  See
// designs/ocapn-tcp-syrup-framing.md.

/** @param {number} length */
const getLengthPrefixCharCodes = length =>
  // eslint-disable-next-line no-bitwise
  [...`${length | 0}:`].map(char => char.charCodeAt(0));

/**
 * Create a writer stream which wraps messages into the syrup
 * encoding and writes them to an output writer stream.
 *
 * This transform can be zero-copy, if the output stream supports
 * consecutive writes without waiting.  In that case the by-default-off
 * `chunked` mode can be enabled.
 *
 * Accepts the message as an array of buffers in case the producer would
 * like to avoid pre-concatenating them.
 *
 * @param {import('@endo/stream').Writer<Uint8Array, undefined>} output
 * @param {object} opts
 * @param {boolean} [opts.chunked]
 * @returns {import('@endo/stream').Writer<Uint8Array | Uint8Array[], undefined>}
 */
export const makeSyrupWriter = (output, { chunked = false } = {}) => {
  return harden({
    async next(messageChunks) {
      if (!Array.isArray(messageChunks)) {
        messageChunks = [messageChunks];
      }

      const messageLength = messageChunks.reduce(
        (acc, { length }) => acc + length,
        0,
      );

      const prefix = getLengthPrefixCharCodes(messageLength);

      if (chunked) {
        const ack = makePromiseKit();

        const partsWritten = [
          output.next(new Uint8Array(prefix)),
          ...messageChunks.map(chunk => output.next(chunk)),
        ];

        // Resolve early if the output writer closes early.  Each
        // per-chunk promise also gets a swallowing catch so that a
        // rejection from one chunk (e.g. socket FIN'd mid-stream)
        // does not surface as an unhandled rejection.  The aggregate
        // is already observed by the Promise.all chain below, which
        // routes failures into ack.reject.
        for (const promise of partsWritten) {
          promise.then(
            partWritten => {
              if (partWritten.done) {
                ack.resolve(partWritten);
              }
            },
            () => {},
          );
        }

        Promise.all(partsWritten).then(results => {
          // Redundant resolution is safe and clean.
          ack.resolve({
            done: results.some(({ done }) => done),
            value: undefined,
          });
        }, ack.reject);

        return ack.promise;
      } else {
        const buffer = new Uint8Array(prefix.length + messageLength);
        buffer.set(prefix, 0);
        let i = prefix.length;
        for (const chunk of messageChunks) {
          buffer.set(chunk, i);
          i += chunk.length;
        }

        return output.next(buffer);
      }
    },
    async return() {
      return output.return(undefined);
    },
    async throw(error) {
      return output.throw(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });
};
harden(makeSyrupWriter);
