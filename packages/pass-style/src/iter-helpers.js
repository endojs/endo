import { Far } from './make-far.js';

/**
 * The result iterator has as many elements as the `baseIterator` and
 * have the same termination -- the same completion value or failure
 * reason. But the non-final values are the corresponding non-final
 * values from `baseIterator` as transformed by `func`.
 *
 * @template T,U
 * @param {Iterable<T>} baseIterable
 * @param {(value: T) => U} func
 * @returns {Iterable<U>}
 */
export const mapIterable = (baseIterable, func) =>
  /** @type {Iterable<U>} */
  Far('mapped iterable', {
    [Symbol.iterator]: () => {
      const baseIterator = baseIterable[Symbol.iterator]();
      return Far('mapped iterator', {
        next: () => {
          const { value: baseValue, done } = baseIterator.next();
          const value = done ? baseValue : func(baseValue);
          return harden({ value, done });
        },
      });
    },
  });
harden(mapIterable);

/**
 * The result iterator has a subset of the non-final values from the
 * `baseIterator` --- those for which `pred(value)` was truthy. The result
 * has the same termination as the `baseIterator` -- the same completion value
 * or failure reason.
 *
 * @template T
 * @param {Iterable<T>} baseIterable
 * @param {(value: T) => boolean} pred
 * @returns {Iterable<T>}
 */
export const filterIterable = (baseIterable, pred) =>
  /** @type {Iterable<U>} */
  Far('filtered iterable', {
    [Symbol.iterator]: () => {
      const baseIterator = baseIterable[Symbol.iterator]();
      return Far('filtered iterator', {
        next: () => {
          for (;;) {
            const result = baseIterator.next();
            const { value, done } = result;
            if (done || pred(value)) {
              return result;
            }
          }
        },
      });
    },
  });
harden(filterIterable);
