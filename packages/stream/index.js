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
 * @typedef {{
 *   put(value: T | Promise<T>): void,
 *   get(): Promise<T>
 * }} AsyncQueue
 */

/**
 * @template T
 * @returns {AsyncQueue<T>}
 */
export const makeQueue = () => {
  let { promise: tailPromise, resolve: tailResolve } = makePromiseKit();
  return {
    put(value) {
      const { resolve, promise } = makePromiseKit();
      tailResolve(Object.freeze({ value, promise }));
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
 * @template T
 * @template U
 * @template V
 * @typedef {{
 *   next(value: U): Promise<IteratorResult<T>>,
 *   return(value: V): Promise<IteratorResult<T>>,
 *   throw(error: Error): Promise<IteratorResult<T>>,
 *   [Symbol.asyncIterator](): Stream<T, U, V>
 * }} Stream
 */

/**
 * @template T
 * @template V
 * @typedef {Stream<T, undefined, V>} Reader
 */

/**
 * @template U
 * @template V
 * @typedef {Stream<undefined, U, V>} Writer
 */

/**
 * @template T
 * @template U
 * @template V
 * @param {AsyncQueue<IteratorResult<T>>} acks
 * @param {AsyncQueue<IteratorResult<U>>} data
 * @returns {Stream<T, U, V>}
 */
export const makeStream = (acks, data) => {
  const stream = harden({
    /**
     * @param {U} value
     */
    next(value) {
      // Note the shallow freeze since value is not guaranteed to be freezable
      // (typed arrays are not).
      data.put(Object.freeze({ value, done: false }));
      return acks.get();
    },
    /**
     * @param {V} value
     */
    return(value) {
      data.put(Object.freeze({ value, done: true }));
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

/**
 * @template T
 * @template U
 * @template TReturn
 * @template UReturn
 * @returns {[Stream<T, U, TReturn>, Stream<U, T, UReturn>]}
 */
export const makePipe = () => {
  const data = makeQueue();
  const acks = makeQueue();
  const reader = makeStream(data, acks);
  const writer = makeStream(acks, data);
  return harden([reader, writer]);
};
harden(makePipe);
