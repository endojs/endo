import harden from '@endo/harden';

/**
 * Compares two `Uint8Array` values byte-for-byte.
 * Returns `true` when the two arrays have equal length and equal contents.
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {boolean}
 */
export const bytesEqual = (a, b) => {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};
harden(bytesEqual);
