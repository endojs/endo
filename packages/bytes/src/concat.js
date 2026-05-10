import harden from '@endo/harden';

/**
 * Concatenates a list of `Uint8Array` chunks into a single contiguous
 * `Uint8Array`.
 * Empty input yields an empty `Uint8Array`.
 *
 * @param {readonly Uint8Array[]} chunks
 * @returns {Uint8Array}
 */
export const concatBytes = chunks => {
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};
harden(concatBytes);
