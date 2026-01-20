/**
 * Must not escape this module.
 */
const encapsulatedPumpkin = harden({});

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
      const memoedResult = memo.get(arg);
      if (Object.is(memoedResult, encapsulatedPumpkin)) {
        throw new TypeError('no recursion through memoization with same arg');
      }
      return memoedResult;
    }
    // This both prevents recursion through memoization,
    // and errors early on a non-weak-key-compat arg, rather than calling `fn`.
    memo.set(arg, encapsulatedPumpkin);
    let result;
    try {
      result = fn(arg);
    } catch (e) {
      // if `fn` throws, clear the recursion protection on the way out.
      memo.delete(arg);
      throw e;
    }
    memo.set(arg, result);
    return result;
  };
  return harden(memoFn);
};
harden(memoize);
