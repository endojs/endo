import { makeIterator } from './make-iterator.js';

/**
 * A `harden`ing analog of Array.prototype[Symbol.iterator].
 *
 * @template [T=unknown]
 * @param {Array<T>} arr
 * @returns {IterableIterator<T>}
 */
export const makeArrayIterator = arr => {
  const { length } = arr;
  let i = 0;
  return makeIterator(() => {
    /** @type {T} */
    let value;
    if (i < length) {
      value = arr[i];
      i += 1;
      return harden({ done: false, value });
    }
    // @ts-expect-error The terminal value doesn't matter
    return harden({ done: true, value });
  });
};
harden(makeArrayIterator);
