/**
 * Given a one-argument function `fn` or a WeakMap-key compatible
 * argument `arg`, returns `memoFn`, a memoizing form of that function
 * that will only call `fn(arg)` for a given `arg` the first time.
 * The `memoFn` function remembers the result and reuses it on subsequent
 * calls with the same `arg`.
 *
 * See memoize.md for the Memoization Safety properties of `memoize`.
 * (TODO turn into link once there's a URL)
 *
 * @template {{}} A Should be WeakMap-key compatible
 * @template R Can be anything
 * @param {(arg: A) => R} fn
 * @returns {(arg: A) => R}
 */
export const memoize = fn => {
  const memo = new WeakMap();
  const memoFn = arg => {
    if (memo.has(arg)) {
      return memo.get(arg);
    }
    const result = fn(arg);
    memo.set(arg, result);
    return result;
  };
  return harden(memoFn);
};
harden(memoize);
