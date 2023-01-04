// @ts-check

import { Far } from '@endo/far';
import { encodeBase64 } from '@endo/base64';

export const makeIteratorRef = iterable => {
  let iterator;
  if (iterable[Symbol.asyncIterator]) {
    iterator = iterable[Symbol.asyncIterator]();
  } else if (iterable[Symbol.iterator]) {
    iterator = iterable[Symbol.iterator]();
  } else if ('next' in iterable) {
    iterator = iterable;
  }
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

/**
 * @param {AsyncIterable<Uint8Array> | Iterable<Uint8Array> |
 * AsyncIterator<Uint8Array> | Iterator<Uint8Array>} readable
 * @returns {import('@endo/far').FarRef<AsyncIterableIterator<string>>}
 */
export const makeReaderRef = readable => {
  let reader;
  if (readable[Symbol.asyncIterator]) {
    reader = readable[Symbol.asyncIterator]();
  } else if (readable[Symbol.iterator]) {
    reader = readable[Symbol.iterator]();
  } else if ('next' in readable) {
    reader = readable;
  }
  return Far('Reader', {
    async next() {
      const iterationResult = await reader.next();
      if (iterationResult.done) {
        return iterationResult;
      }
      return harden({ value: encodeBase64(iterationResult.value) });
    },
    /**
     * @param {any} value
     */
    async return(value) {
      if (reader.return !== undefined) {
        const iterationResult = await reader.return(value);
        if (iterationResult.done) {
          return iterationResult;
        }
        return harden({ value: encodeBase64(iterationResult.value) });
      }
      return { done: true, value: undefined };
    },
    /**
     * @param {any} error
     */
    async throw(error) {
      if (reader.throw !== undefined) {
        const iterationResult = await reader.throw(error);
        if (iterationResult.done) {
          return iterationResult;
        }
        return harden({ value: encodeBase64(iterationResult.value) });
      }
      return { done: true, value: undefined };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });
};
