/* global globalThis */
// @ts-check

/// <reference types="ses"/>

import { memoRace } from './src/memo-race.js';

export * from './src/is-promise.js';
// eslint-disable-next-line import/export
export * from './src/types.js';

/** @type {PromiseConstructor} */
const BestPipelinablePromise = globalThis.HandledPromise || Promise;

/**
 * Needed to prevent type errors where functions are detected to be undefined.
 */
const NOOP_INITIALIZER = harden(() => {});

/**
 * makePromiseKit() builds a Promise object, and returns a record
 * containing the promise itself, as well as separate facets for resolving
 * and rejecting it.
 *
 * @template T
 * @returns {import('./src/types.js').PromiseKit<T>}
 */
export function makePromiseKit() {
  /** @type {(value: import('./src/types.js').ERef<T>) => void} */
  let resolve = NOOP_INITIALIZER;
  /** @type {(reason: unknown) => void} */
  let reject = NOOP_INITIALIZER;

  /** @type {Promise<T>} */
  const promise = new BestPipelinablePromise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return harden({ promise, resolve, reject });
}
harden(makePromiseKit);

/**
 * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
 * or rejected.
 *
 * Unlike `Promise.race` it cleans up after itself so a non-resolved value doesn't hold onto
 * the result promise.
 *
 * @template T
 * @param {Iterable<T>} values An iterable of Promises.
 * @returns {Promise<Awaited<T>>} A new Promise.
 */
export function racePromises(values) {
  return harden(memoRace.call(BestPipelinablePromise, values));
}
harden(racePromises);
