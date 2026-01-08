// @ts-check

/**
 * A type that can be iterated asynchronously.
 * Mirrors Stream<TRead, TWrite, TReadReturn, TWriteReturn> template parameters.
 * The `@endo/stream` Stream type is also accepted since it extends AsyncIterator.
 *
 * @template TRead
 * @template [TWrite=undefined]
 * @template [TReadReturn=unknown]
 * @template [TWriteReturn=unknown]
 * @typedef {AsyncIterable<TRead, TReadReturn, TWrite>
 *   | Iterable<TRead, TReadReturn, TWrite>
 *   | AsyncIterator<TRead, TReadReturn, TWrite>
 *   | Iterator<TRead, TReadReturn, TWrite>
 * } SomehowAsyncIterable
 */

/**
 * Returns the iterator for the given iterable object.
 * Supports both synchronous and asynchronous iterables.
 *
 * @template TRead
 * @template [TWrite=undefined]
 * @template [TReadReturn=undefined]
 * @template [TWriteReturn=undefined]
 * @param {SomehowAsyncIterable<TRead, TWrite, TReadReturn, TWriteReturn>} iterable
 * @returns {AsyncIterator<TRead, TReadReturn, TWrite> | Iterator<TRead, TReadReturn, TWrite>}
 */
export const asyncIterate = iterable => {
  if (Symbol.asyncIterator in iterable) {
    return iterable[Symbol.asyncIterator]();
  } else if (Symbol.iterator in iterable) {
    return iterable[Symbol.iterator]();
  } else if ('next' in iterable) {
    return iterable;
  }
  throw new TypeError('Expected an iterable or iterator');
};
