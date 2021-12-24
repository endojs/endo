// @ts-check
/// <reference types="ses"/>

const COLON = ':'.charCodeAt(0);
const COMMA = ','.charCodeAt(0);

// The initial buffer length should be small enough to not be an imposition in
// the common case but large enough to avoid reallocation in the common case.
// It also must be long enough to fit an ASCII decimal representation of the
// length of the longest possible message.
// This is a guess:
const initialBufferLength = 128;

const encoder = new TextEncoder();

/**
 * @param {import('@endo/stream').Writer<Uint8Array, undefined>} output
 * @returns {import('@endo/stream').Writer<Uint8Array, undefined>}
 */
export const makeNetstringWriter = output => {
  return harden({
    async next(message) {
      // Must allocate to support concurrent writes.
      let buffer = new Uint8Array(initialBufferLength);
      const { written: colonAt = 0 } = encoder.encodeInto(
        `${message.byteLength}`,
        buffer,
      );
      const messageAt = colonAt + 1;
      const commaAt = messageAt + message.byteLength;
      const messageLength = commaAt + 1;

      // Grow buffer if necessary.
      if (messageLength > buffer.byteLength) {
        let newCapacity = buffer.byteLength;
        while (newCapacity < messageLength) {
          newCapacity *= 2;
        }
        const newBuffer = new Uint8Array(newCapacity);
        newBuffer.set(buffer, 0);
        buffer = newBuffer;
      }

      buffer[colonAt] = COLON;
      buffer.set(message, messageAt);
      buffer[commaAt] = COMMA;

      return output.next(buffer.subarray(0, messageLength));
    },
    async return() {
      return output.return();
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
