// @ts-check
/// <reference types="ses"/>

// This module provided for sake of fewer head scratches.
// Node.js readable streams satisfy the signature of an async iterable iterator.
// They however iterate Node.js Buffer values and are not hardened, so this
// implementation compensates for both.

const { details: X, quote: q } = assert;

/**
 * @param {import('stream').Readable} input the source Node.js reader
 * @returns {import('@endo/stream').Reader<Uint8Array>}
 */
export const makeNodeReader = input => {
  assert(
    !input.readableObjectMode,
    X`Cannot convert Node.js object mode Reader to AsyncIterator<Uint8Array>`,
  );
  assert(
    input.readableEncoding === null,
    X`Cannot convert Node.js Reader with readableEncoding ${q(
      input.readableEncoding,
    )} to a AsyncIterator<Uint8Array>`,
  );

  const finalIteration = new Promise((resolve, reject) => {
    input.on('error', reject);
    input.on('close', () => {
      resolve({ done: true, value: undefined });
    });
  });

  const iterator = input[Symbol.asyncIterator]();
  /** @type {import('@endo/stream').Reader<Uint8Array>} */
  const reader = harden({
    async next() {
      const result = await iterator.next();
      if (result.done) {
        return result;
      }
      assert(typeof result.value !== 'string');
      const { buffer, byteOffset, length } = result.value;
      return {
        done: false,
        value: new Uint8Array(buffer, byteOffset, length),
      };
    },
    async return() {
      input.destroy();
      return finalIteration;
    },
    /**
     * @param {Error} error
     */
    async throw(error) {
      input.destroy(error);
      return finalIteration;
    },
    [Symbol.asyncIterator]() {
      return reader;
    },
  });
  return reader;
};
harden(makeNodeReader);
