/* `makeQueue`, `makeStream`, and `makePipe` are utilities for creating async
 * iterator "streams". A Stream is compatible with AsyncIterator and Generator
 * but differ in that every method and argument of both is required.
 * For example, streams always have `return` and `throw` for closing the write
 * side.
 * The `Stream` interface is symmetric, but a stream that sends data and
 * receives undefined is conventionally a `Writer` whereas a stream that
 * receives data and sends undefined is conventionally a `Reader`.
 */

// @ts-check
/// <reference types="ses"/>

/**
 * @template T
 * @typedef {{
 *   resolve(value?: T | Promise<T>): void,
 *   reject(error: Error): void,
 *   promise: Promise<T>
 * }} PromiseKit
 */

// TypeScript ReadOnly semantics are not sufficiently expressive to distinguish
// a value one promises not to alter from a value one must not alter,
// making it useless.
const freeze = /** @type {<T>(v: T | Readonly<T>) => T} */ (Object.freeze);

/**
 * @template T
 * @returns {PromiseKit<T>}
 */
const makePromiseKit = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  assert(resolve !== undefined);
  assert(reject !== undefined);
  return harden({ promise, resolve, reject });
};

/**
 * @template T
 * @returns {import('./types.js').AsyncQueue<T>}
 */
export const makeQueue = () => {
  let { promise: tailPromise, resolve: tailResolve } = makePromiseKit();
  return {
    put(value) {
      const { resolve, promise } = makePromiseKit();
      tailResolve(freeze({ value, promise }));
      tailResolve = resolve;
    },
    get() {
      const promise = tailPromise.then(next => next.value);
      tailPromise = tailPromise.then(next => next.promise);
      return harden(promise);
    },
  };
};
harden(makeQueue);

/**
 * @template TRead
 * @template TWrite
 * @template TReadReturn
 * @template TWriteReturn
 * @param {import('./types.js').AsyncQueue<IteratorResult<TRead, TReadReturn>>} acks
 * @param {import('./types.js').AsyncQueue<IteratorResult<TWrite, TWriteReturn>>} data
 */
export const makeStream = (acks, data) => {
  const stream = harden({
    /**
     * @param {TWrite} value
     */
    next(value) {
      // Note the shallow freeze since value is not guaranteed to be freezable
      // (typed arrays are not).
      data.put(freeze({ value, done: false }));
      return acks.get();
    },
    /**
     * @param {TWriteReturn} value
     */
    return(value) {
      data.put(freeze({ value, done: true }));
      return acks.get();
    },
    /**
     * @param {Error} error
     */
    throw(error) {
      data.put(harden(Promise.reject(error)));
      return acks.get();
    },
    [Symbol.asyncIterator]() {
      return stream;
    },
  });
  return stream;
};
harden(makeStream);

// JSDoc TypeScript seems unable to express this particular function's
// entanglement of queues, but the definition in index.d.ts works for the end
// user.
export const makePipe = () => {
  const data = makeQueue();
  const acks = makeQueue();
  const reader = makeStream(acks, data);
  const writer = makeStream(data, acks);
  return harden([writer, reader]);
};
harden(makePipe);
