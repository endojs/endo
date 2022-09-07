// @ts-check
/// <reference types="ses"/>

const COMMA_BUFFER = new Uint8Array([','.charCodeAt(0)]);

/** @param {number} length */
const getLengthPrefixCharCodes = length =>
  // eslint-disable-next-line no-bitwise
  [...`${length | 0}:`].map(char => char.charCodeAt(0));

/**
 * Create a writer stream which wraps messages into a netstring encoding and
 * writes them to an output writer stream.
 *
 * This transform can be zero-copy, if the output stream supports consecutive
 * writes without waiting, aka if it can gracefully handle writes if full or
 * closed. In that case the by default off `chunked` mode can be enabled.
 *
 * Accepts the message as an array of buffers in case the producer would like
 * to avoid pre-concatenating them.
 *
 * @param {import('@endo/stream').Writer<Uint8Array, undefined>} output
 * @param {object} [opts]
 * @param {boolean} [opts.chunked]
 * @returns {import('@endo/stream').Writer<Uint8Array | Uint8Array[], undefined>}
 */
export const makeNetstringWriter = (output, { chunked = false } = {}) => {
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
        return Promise.all([
          output.next(new Uint8Array(prefix)),
          ...messageChunks.map(async chunk => output.next(chunk)),
          output.next(COMMA_BUFFER),
        ]).then(([r1, r2, r3]) => ({
          done: !!(r1.done || r2.done || r3.done),
          value: undefined,
        }));
      } else {
        const buffer = new Uint8Array(prefix.length + messageLength + 1);
        buffer.set(prefix, 0);
        let i = prefix.length;
        for (const chunk of messageChunks) {
          buffer.set(chunk, i);
          i += chunk.length;
        }
        buffer.set(COMMA_BUFFER, i);

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
harden(makeNetstringWriter);

// Legacy
export const netstringWriter = makeNetstringWriter;
