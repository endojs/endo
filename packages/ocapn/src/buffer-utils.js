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
 * Converts a hex string to an ArrayBuffer
 * @param {string} hexString - The hex string to convert
 * @returns {ArrayBuffer} The ArrayBuffer representation of the hex string
 */
export function hexToArrayBuffer(hexString) {
  if (hexString.length % 2 !== 0) {
    throw new Error(
      `Hex string must have an even length, got ${hexString.length}`,
    );
  }
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
  }
  return uint8ArrayToImmutableArrayBuffer(bytes);
}

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

/**
 * Concatenate multiple ArrayBuffers into a single Uint8Array
 * @param {Array<ArrayBuffer>} arrayBuffers
 * @returns {ArrayBuffer}
 */
export const concatArrayBuffers = arrayBuffers => {
  const totalLength = arrayBuffers.reduce(
    (acc, arrayBuffer) => acc + arrayBuffer.byteLength,
    0,
  );
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arrayBuffer of arrayBuffers) {
    // Immutable ArrayBuffers need to be sliced before creating a Uint8Array view
    result.set(new Uint8Array(arrayBuffer.slice()), offset);
    offset += arrayBuffer.byteLength;
  }
  return uint8ArrayToImmutableArrayBuffer(result);
};
