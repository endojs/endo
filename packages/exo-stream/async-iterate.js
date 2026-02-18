// @ts-check

/** @import { SomehowAsyncIterable } from './types.js' */

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
