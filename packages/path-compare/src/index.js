/**
 * Comparison function for two values of the same type `T`.
 *
 * Can be used with `Array.prototype.sort` and other similar contexts
 *
 * @template T The type of the values to compare
 * @callback CompareFn
 * @param {T} a First value
 * @param {T} b Second value
 * @returns {number} Negative integer if `a < b`; positive integer if `a > b`;
 * `0` if equal
 */

const { stringify: q } = JSON;

/**
 * String comparison function based on UTF-16 code units
 *
 * @type {CompareFn<string>}
 */
// eslint-disable-next-line no-nested-ternary
export const stringCompare = (a, b) => (a === b ? 0 : a < b ? -1 : 1);

/**
 * Compares two string arrays and returns a comparison result.
 *
 * The algorithm is as follows:
 *
 * 1. _Check if either value is `undefined`._ If both are `undefined`, return
 *    `0`. If `a` is `undefined`, return `1`. If `b` is `undefined`, return
 *    `-1`.
 * 2. _Check the lengths of the arrays._ If they are different, return the
 *    difference.
 * 3. _Check the cumulative lengths of the arrays_ using the count of UTF-16
 *    units in each string. If they are different, return the difference.
 * 4. _Check the individual elements of the arrays_ via lexical comparison. If
 *    they are different, return the difference.
 * 5. _If all elements are the same_ ("deep equality"), return `0`.
 *
 * @type {CompareFn<string[]|undefined>}
 */
export const pathCompare = (a, b) => {
  // Undefined compares greater than anything else.
  if (a === undefined || b === undefined) {
    // eslint-disable-next-line no-nested-ternary
    return a === b ? 0 : a === undefined ? 1 : -1;
  }

  // Prefer the shortest dependency path.
  if (a.length !== b.length) {
    return a.length - b.length;
  }

  // Otherwise, favor the shortest cumulative length.
  const aStringLength = a.join('').length;
  const bStringLength = b.join('').length;
  if (aStringLength !== bStringLength) {
    return aStringLength - bStringLength;
  }

  // sanity check
  /* c8 ignore next 5 */
  if (a.length !== b.length) {
    throw new Error(
      `Unexpectedly different lengths of string arrays: ${q({ a, b })}`,
    );
  }

  // Otherwise, compare lexicographically.
  // This loop guarantees that if any pair of strings at the same index differ,
  // including the case where one is a prefix of the other, we will return a
  // non-zero value.
  for (let i = 0; i < a.length; i += 1) {
    const comparison = stringCompare(a[i], b[i]);
    if (comparison !== 0) {
      return comparison;
    }
  }

  // If all pairs of terms are the same respective lengths, we are guaranteed
  // that they are exactly the same or one of them is lexically distinct and would
  // have already been caught.
  return 0;
};
