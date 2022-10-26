// @ts-check
/// <reference types="ses"/>

import { hostIsLittleEndian } from './src/host-endian.js';

const { details: X, quote: q } = assert;

/**
 * @param {import('@endo/stream').Writer<Uint8Array, undefined>} output
 * @param {Object} opts
 * @param {number} [opts.maxMessageLength] - defaults to 1MB
 * @param {string} [opts.name]
 * @param {boolean} [opts.littleEndian] - defaults to host byte order
 * @returns {import('@endo/stream').Writer<Uint8Array, undefined>}
 */
export const makeLp32Writer = (
  output,
  {
    name = '<unknown-lp32-writer>',
    maxMessageLength = 1024 * 1024, // 1MB
    littleEndian = hostIsLittleEndian,
  } = {},
) => {
  const writer = harden({
    /** @param {Uint8Array} message */
    async next(message) {
      assert(
        message.byteLength <= maxMessageLength,
        X`Messages on ${q(
          name,
        )} must not exceed ${maxMessageLength} bytes in length`,
      );
      const array8 = new Uint8Array(4 + message.byteLength);
      const data = new DataView(array8.buffer);
      data.setUint32(0, message.byteLength, littleEndian);
      array8.set(message, 4);
      return output.next(array8);
    },
    async return() {
      return output.return(undefined);
    },
    /** @param {Error} error */
    async throw(error) {
      return output.throw(error);
    },
    [Symbol.asyncIterator]() {
      return writer;
    },
  });
  return writer;
};
harden(makeLp32Writer);
