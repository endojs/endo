// @ts-check
/// <reference types="ses"/>

// We use a DataView to give users choice over endianness.
// But DataView does not default to host-byte-order like other typed arrays.

import { hostIsLittleEndian } from './src/host-endian.js';

const { Fail, quote: q } = assert;

/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} reader
 * @param {object} opts
 * @param {string=} [opts.name]
 * @param {number} [opts.maxMessageLength] - defaults to 1MB
 * @param {boolean=} [opts.littleEndian]
 * @param {number=} [opts.initialCapacity]
 * @returns {import('@endo/stream').Reader<Uint8Array, void>}
 */
async function* makeLp32Iterator(
  reader,
  {
    name = '<unknown>',
    initialCapacity = 1024,
    maxMessageLength = 1024 * 1024, // 1MB
    littleEndian = hostIsLittleEndian,
  } = {},
) {
  let capacity = Math.max(4, initialCapacity);
  let length = 0;
  let array8 = new Uint8Array(capacity);
  let data = new DataView(array8.buffer);
  let offset = 0;

  for await (const chunk of reader) {
    if (length + chunk.byteLength >= capacity) {
      while (length + chunk.byteLength >= capacity) {
        capacity *= 2;
      }
      const replacement = new Uint8Array(capacity);
      replacement.set(array8, 0);
      array8 = replacement;
      data = new DataView(array8.buffer);
    }
    array8.set(chunk, length);
    length += chunk.byteLength;

    let drained = false;
    while (!drained && length >= 4) {
      const messageLength = data.getUint32(0, littleEndian);
      messageLength <= maxMessageLength ||
        Fail`Messages on ${q(name)} must not exceed ${q(
          maxMessageLength,
        )} bytes in length`;
      const envelopeLength = 4 + messageLength;
      drained = envelopeLength > length;
      if (!drained) {
        // Must allocate to support concurrent reads.
        yield array8.slice(4, envelopeLength);
        // Shift
        array8.copyWithin(0, envelopeLength);
        length -= envelopeLength;
        offset += envelopeLength;
      }
    }
  }

  if (length > 0) {
    throw Error(
      `Unexpected dangling message of length ${length} at offset ${offset} of ${name}`,
    );
  }
}
harden(makeLp32Iterator);

/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} reader
 * @param {object} [opts]
 * @param {string=} [opts.name]
 * @param {number=} [opts.capacity]
 * @returns {import('@endo/stream').Reader<Uint8Array, void>} reader
 */
export const makeLp32Reader = (reader, opts) => {
  return harden(makeLp32Iterator(reader, opts));
};
harden(makeLp32Reader);
