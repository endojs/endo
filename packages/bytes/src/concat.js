import harden from '@endo/harden';

import { toGenuineBytes } from './to-genuine.js';

/**
 * Concatenates a list of `Uint8Array` chunks into a single contiguous
 * `Uint8Array`.
 * Empty input yields an empty `Uint8Array`.
 *
 * Tolerates every `Uint8Array` variant among the chunks: native or emulated,
 * frozen or mutable. An emulated freezable wrapper (from
 * `@endo/immutable-arraybuffer`) is not a real `ArrayBufferView`, so
 * `TypedArray.prototype.set` reads zeros from it; `toGenuineBytes` copies such a
 * chunk to a genuine `Uint8Array` before the `set`, while genuine chunks are
 * passed through uncopied.
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
    const genuine = toGenuineBytes(chunk);
    result.set(genuine, offset);
    offset += genuine.length;
  }
  return result;
};
harden(concatBytes);
