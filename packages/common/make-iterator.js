/**
 * Makes a one-shot iterable iterator from a provided `next` function.
 *
 * @template [T=unknown]
 * @param {() => IteratorResult<T>} next
 * @returns {IterableIterator<T>}
 */
export const makeIterator = next => {
  const iter = harden({
    [Symbol.iterator]: () => iter,
    next,
  });
  return iter;
};
harden(makeIterator);
