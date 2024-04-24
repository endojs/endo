// @ts-check

import { encodeBase64 } from '@endo/base64';
import { mapReader } from '@endo/stream';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

/** @import { Reader } from '@endo/stream' */
/** @import { FarRef } from '@endo/eventual-send' */
/** @import { SomehowAsyncIterable } from './types.js' */

/**
 * Returns the iterator for the given iterable object.
 * Supports both synchronous and asynchronous iterables.
 *
 * @template T The item type of the iterable.
 * @param {SomehowAsyncIterable<T>} iterable The iterable object.
 * @returns {Reader<T>} sort of fudging this into a stream to appease "mapReader"
 */
export const asyncIterate = iterable => {
  let iterator;
  if (iterable[Symbol.asyncIterator]) {
    iterator = iterable[Symbol.asyncIterator]();
  } else if (iterable[Symbol.iterator]) {
    iterator = iterable[Symbol.iterator]();
  } else if ('next' in iterable) {
    iterator = iterable;
  }
  return iterator;
};

/**
 * @template T
 * @param {SomehowAsyncIterable<T>} iterable The iterable object.
 * @returns {FarRef<Reader<T>>}
 */
export const makeIteratorRef = iterable => {
  const iterator = asyncIterate(iterable);
  // @ts-ignore while switching from Far
  return makeExo(
    'AsyncIterator',
    M.interface('AsyncIterator', {}, { defaultGuards: 'passable' }),
    {
      async next() {
        return iterator.next(undefined);
      },
      /**
       * @param {any} value
       */
      async return(value) {
        if (iterator.return !== undefined) {
          return iterator.return(value);
        }
        return harden({ done: true, value: undefined });
      },
      /**
       * @param {any} error
       */
      async throw(error) {
        if (iterator.throw !== undefined) {
          return iterator.throw(error);
        }
        return harden({ done: true, value: undefined });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    },
  );
};

/**
 * @param {SomehowAsyncIterable<Uint8Array>} readable
 * @returns {FarRef<Reader<string>>}
 */
export const makeReaderRef = readable =>
  makeIteratorRef(mapReader(asyncIterate(readable), encodeBase64));
