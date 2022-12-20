// @ts-check

import { decodeBase64 } from '@endo/base64';
import { mapReader } from '@endo/stream';
import { E } from '@endo/far';

/**
 * @template TValue
 * @template TReturn
 * @template TNext
 * @param {import('@endo/far').ERef<AsyncIterator<TValue, TReturn, TNext>>} iteratorRef
 */
export const eventualIterator = iteratorRef => {
  const iterator = {
    /** @param {[] | [TNext]} args */
    next: async (...args) => E(iteratorRef).next(...args),
    /** @param {[] | [TReturn]} args */
    return: async (...args) => E(iteratorRef).return(...args),
    /** @param {any} error */
    throw: async error => E(iteratorRef).throw(error),
    [Symbol.asyncIterator]: () => iterator,
  };
  return iterator;
};

/**
 * @param {import('@endo/far').ERef<AsyncIterator<string>>} readerRef
 * @returns {AsyncIterableIterator<Uint8Array, any>}
 */
export const makeRefReader = readerRef =>
  mapReader(eventualIterator(readerRef), decodeBase64);
