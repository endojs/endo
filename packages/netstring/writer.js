// @ts-check
/// <reference types="ses"/>

const COMMA_BUFFER = new Uint8Array([','.charCodeAt(0)]);

/** @param {number} length */
const getLengthPrefixCharCodes = length =>
  // eslint-disable-next-line no-bitwise
  [...`${length | 0}:`].map(char => char.charCodeAt(0));

/**
 * @param {import('@endo/stream').Writer<Uint8Array, undefined>} output
 * @param {object} [opts]
 * @param {boolean} [opts.chunked]
 * @returns {import('@endo/stream').Writer<Uint8Array, undefined>}
 */
export const makeNetstringWriter = (output, { chunked = false } = {}) => {
  return harden({
    async next(message) {
      const prefix = getLengthPrefixCharCodes(message.length);

      if (chunked) {
        return Promise.all([
          output.next(new Uint8Array(prefix)),
          output.next(message),
          output.next(COMMA_BUFFER),
        ]).then(([r1, r2, r3]) => ({
          done: !!(r1.done || r2.done || r3.done),
          value: undefined,
        }));
      } else {
        const buffer = new Uint8Array(prefix.length + message.length + 1);
        buffer.set(prefix, 0);
        buffer.set(message, prefix.length);
        buffer.set(COMMA_BUFFER, buffer.length - 1);

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
