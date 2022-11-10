// @ts-check
/// <reference types="ses"/>

// This module provided for sake of fewer head scratches.
// Node.js readable streams satisfy the signature of an async iterable iterator.
// They however iterate Node.js Buffer values and are not hardened, so this
// implementation compensates for both.

import { mapReader } from '@endo/stream';

const { Fail, quote: q } = assert;

/**
 * @param {import('stream').Readable} input the source Node.js reader
 * @returns {import('@endo/stream').Reader<Uint8Array>}
 */
export const makeNodeReader = input => {
  !input.readableObjectMode ||
    Fail`Cannot convert Node.js object mode Reader to AsyncIterator<Uint8Array>`;
  input.readableEncoding === null ||
    Fail`Cannot convert Node.js Reader with readableEncoding ${q(
      input.readableEncoding,
    )} to a AsyncIterator<Uint8Array>`;

  const iterator = input[Symbol.asyncIterator]();
  assert(iterator.return);

  // Adapt the AsyncIterator to the more strict interface of a Stream: must
  // have return and throw methods.
  /** @type {import('@endo/stream').Reader<Buffer>} */
  const reader = {
    async next() {
      return iterator.next();
    },
    async return() {
      assert(iterator.return);
      return iterator.return();
    },
    async throw(error) {
      input.destroy(error);
      assert(iterator.return);
      return iterator.return();
    },
    [Symbol.asyncIterator]() {
      return reader;
    },
  };

  /** @type {import('@endo/stream').Reader<Uint8Array>} */
  return mapReader(reader, buffer => {
    assert(typeof buffer !== 'string');
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
  });
};
harden(makeNodeReader);
