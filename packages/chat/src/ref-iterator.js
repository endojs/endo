// @ts-check

import { E } from '@endo/far';

/**
 * Create a local async iterator from a remote iterator reference.
 * This allows iterating over remote async iterators via CapTP.
 *
 * @template TValue
 * @template TReturn
 * @template TNext
 * @param {import('@endo/far').ERef<AsyncIterator<TValue, TReturn, TNext>>} iteratorRef
 * @returns {AsyncIterableIterator<TValue, TReturn, TNext>}
 */
export const makeRefIterator = iteratorRef => {
  const iterator = harden({
    /** @param {[] | [TNext]} args */
    next: async (...args) => E(iteratorRef).next(...args),
    /** @param {[] | [TReturn]} args */
    return: async (...args) => E(iteratorRef).return(...args),
    /** @param {any} error */
    throw: async error => E(iteratorRef).throw(error),
    [Symbol.asyncIterator]: () => iterator,
  });
  return iterator;
};
harden(makeRefIterator);
