// @ts-check

import harden from '@endo/harden';
import { encodeBase64 } from '@endo/base64';
import { mapReader } from '@endo/stream';
import { makeExo } from '@endo/exo';

import { AsyncIteratorInterface } from './interfaces.js';

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
 * Defensively freeze an iterator result so the strict XS marshaller
 * does not reject the `{value, done}` record on the wire as
 * "extensible object".  We use Object.freeze (one level deep) rather
 * than harden because the wrapped value (e.g. a base64 string) is
 * already a primitive — and harden would refuse a `{value:
 * Uint8Array}` record on XS where TypedArray indexed properties
 * cannot be reconfigured.
 *
 * @template T
 * @param {IteratorResult<T> | Promise<IteratorResult<T>> | any} result
 * @returns {any}
 */
const freezeResult = result => {
  if (result && typeof result === 'object' && !Object.isFrozen(result)) {
    Object.freeze(result);
  }
  return result;
};

/**
 * @template T
 * @param {SomehowAsyncIterable<T>} iterable The iterable object.
 * @returns {FarRef<Reader<T>>}
 */
export const makeIteratorRef = iterable => {
  const iterator = asyncIterate(iterable);
  // @ts-ignore while switching from Far
  return makeExo('AsyncIterator', AsyncIteratorInterface, {
    async next() {
      return freezeResult(await iterator.next(undefined));
    },
    /**
     * @param {any} value
     */
    async return(value) {
      if (iterator.return !== undefined) {
        return freezeResult(await iterator.return(value));
      }
      return harden({ done: true, value: undefined });
    },
    /**
     * @param {any} error
     */
    async throw(error) {
      if (iterator.throw !== undefined) {
        return freezeResult(await iterator.throw(error));
      }
      return harden({ done: true, value: undefined });
    },
  });
};

/**
 * @param {SomehowAsyncIterable<Uint8Array>} readable
 * @returns {FarRef<Reader<string>>}
 */
export const makeReaderRef = readable =>
  makeIteratorRef(mapReader(asyncIterate(readable), encodeBase64));
