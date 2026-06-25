import harden from '@endo/harden';

import { toGenuineBytes } from './to-genuine.js';

/**
 * Compares two `Uint8Array` values byte-for-byte.
 * Returns `true` when the two arrays have equal length and equal contents.
 *
 * Tolerates every `Uint8Array` variant on either side: native or emulated,
 * frozen or mutable. An emulated freezable wrapper (from
 * `@endo/immutable-arraybuffer`) exposes no integer-indexed own properties, so
 * `toGenuineBytes` first copies it to a genuine `Uint8Array`; genuine views are
 * passed through uncopied and compared by fast indexing.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {boolean}
 */
export const bytesEqual = (a, b) => {
  if (a === b) {
    return true;
  }
  const ga = toGenuineBytes(a);
  const gb = toGenuineBytes(b);
  if (ga.length !== gb.length) {
    return false;
  }
  for (let i = 0; i < ga.length; i += 1) {
    if (ga[i] !== gb[i]) {
      return false;
    }
  }
  return true;
};
harden(bytesEqual);
