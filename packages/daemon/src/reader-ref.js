// @ts-check

import { encodeBase64 } from '@endo/base64';
import { mapReader } from '@endo/stream';
import { Far } from '@endo/far';

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

export const makeIteratorRef = iterator => {
  return Far('AsyncIterator', {
    async next() {
      return iterator.next();
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
  });
};

export const makeReaderRef = readable =>
  makeIteratorRef(mapReader(asyncIterate(readable), encodeBase64));
