// @ts-check
// DataView does not default to host byte order like TypedArrays, so we must
// pass an explicit endianness argument.

import { Fail, q } from '@endo/errors';
import { hostIsLittleEndian } from './src/host-endian.js';

/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} reader
 * @param {object} options
 * @param {string=} [options.name]
 * @param {number} [options.maxMessageLength] - defaults to 1MB
 * @param {number=} [options.initialCapacity]
 * @returns {import('@endo/stream').Reader<Uint8Array, void>}
 */
async function* makeLp32Iterator(
  reader,
  {
    name = '<unknown>',
    initialCapacity = 1024,
    maxMessageLength = 1024 * 1024, // 1MB
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
      const messageLength = data.getUint32(0, hostIsLittleEndian);
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
 * @param {object} [options]
 * @param {string=} [options.name]
 * @param {number=} [options.capacity]
 * @returns {import('@endo/stream').Reader<Uint8Array, void>} reader
 */
export const makeLp32Reader = (reader, options) => {
  return harden(makeLp32Iterator(reader, options));
};
harden(makeLp32Reader);
