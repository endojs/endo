// @ts-check

/**
 * The manual surrogate scan: the implementation used on engines that do not
 * carry the built-in `String.prototype.isWellFormed` (XS among them), and the
 * reason this package exists at all.
 *
 * It lives in its own module so it can be tested directly. Selected in-place by
 * a ternary in `index.js`, it was unreachable from any test on an engine that
 * has the built-in — which is every engine CI runs — so the load-bearing half
 * of the package shipped unpinned. Deleting the global to force the branch is
 * not an option either: under `lockdown()` the intrinsics are frozen and the
 * deletion throws.
 *
 * Behaviorally identical to the native arm; both are held to the one table in
 * `test/cases.js`.
 *
 * @param {unknown} str
 * @returns {str is string}
 */
export const isWellFormedStringFallback = str => {
  if (typeof str !== 'string') {
    return false;
  }
  for (const ch of str) {
    // The string iterator iterates by Unicode code point, not
    // UTF16 code unit. But if it encounters an unpaired surrogate,
    // it will produce it.
    const cp = /** @type {number} */ (ch.codePointAt(0));
    if (cp >= 0xd800 && cp <= 0xdfff) {
      // All surrogates are in this range. The string iterator only
      // produces a character in this range for unpaired surrogates,
      // which only happens if the string is not well-formed.
      return false;
    }
  }
  return true;
};
