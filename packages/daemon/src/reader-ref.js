// @ts-check

import { Far } from '@endo/far';
import { encodeBase64 } from '@endo/base64';

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
