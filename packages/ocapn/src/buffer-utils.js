// @ts-check

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Convert a Uint8Array to an immutable ArrayBuffer.
 * The resulting buffer will have passStyle 'byteArray'.
 * The buffer is hardened to make it passable.
 *
 * @param {Uint8Array} uint8Array
 * @returns {ArrayBuffer} A hardened immutable ArrayBuffer
 */
export const uint8ArrayToImmutableArrayBuffer = uint8Array => {
  // Use the shimmed ArrayBuffer.prototype.sliceToImmutable method
  // @ts-expect-error uint8Array.buffer is ArrayBufferLike but has sliceToImmutable from shim
  const immutableBuffer = uint8Array.buffer.sliceToImmutable(
    uint8Array.byteOffset,
    uint8Array.byteOffset + uint8Array.byteLength,
  );
  return harden(immutableBuffer);
};

/**
 * Convert an immutable ArrayBuffer to a Uint8Array
 * @param {ArrayBufferLike} immutableArrayBuffer
 * @returns {Uint8Array}
 */
export const immutableArrayBufferToUint8Array = immutableArrayBuffer => {
  return new Uint8Array(immutableArrayBuffer.slice());
};

/**
 * Encode a string into an immutable ArrayBuffer.
 * The resulting buffer will have passStyle 'byteArray'.
 *
 * @param {string} string
 * @returns {ArrayBuffer} An immutable ArrayBuffer
 */
export const encodeStringToImmutableArrayBuffer = string => {
  return uint8ArrayToImmutableArrayBuffer(textEncoder.encode(string));
};

/**
 * Decode an immutable ArrayBuffer into a string
 * @param {ArrayBufferLike} buffer
 * @returns {string}
 */
export const decodeImmutableArrayBufferToString = buffer => {
  // Immutable ArrayBuffers need to be sliced for TextDecoder to work
  return textDecoder.decode(buffer.slice());
};

/**
 * Concatenate multiple Uint8Arrays into a single Uint8Array
 * @param {Array<Uint8Array>} uint8Arrays
 * @returns {Uint8Array}
 */
export const concatUint8Arrays = uint8Arrays => {
  const totalLength = uint8Arrays.reduce(
    (acc, uint8Array) => acc + uint8Array.length,
    0,
  );
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const uint8Array of uint8Arrays) {
    result.set(uint8Array, offset);
    offset += uint8Array.length;
  }
  return result;
};
