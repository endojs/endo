// @ts-check

/**
 * Lexicographic byte comparison. Returns 0 if equal, a negative number
 * if `left` sorts before `right`, positive if after. A shorter prefix
 * sorts before a longer string with the same prefix.
 *
 * Duplicated from `@endo/ocapn` rather than introduced as a public
 * export there: the function is small enough that inlining a copy is
 * cheaper than committing to a cross-package API surface.
 *
 * @param {Uint8Array} left
 * @param {Uint8Array} right
 * @returns {number}
 */
export const compareUint8Arrays = (left, right) => {
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
};
