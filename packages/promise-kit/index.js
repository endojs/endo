/* global globalThis */

import { makeReleasingExecutorKit } from './src/promise-executor-kit.js';
import { memoRace } from './src/memo-race.js';

export * from './src/is-promise.js';
// eslint-disable-next-line import/export
export * from './src/types.js';

/** @type {PromiseConstructor} */
const BestPipelinablePromise = globalThis.HandledPromise || Promise;

/**
 * makePromiseKit() builds a Promise object, and returns a record
 * containing the promise itself, as well as separate facets for resolving
 * and rejecting it.
 *
 * @template T
 * @returns {import('./src/types.js').PromiseKit<T>}
 */
export function makePromiseKit() {
  const { resolve, reject, executor } = makeReleasingExecutorKit();

  const promise = new BestPipelinablePromise(executor);

  return harden({ promise, resolve, reject });
}
harden(makePromiseKit);

// NB: Another implementation for Promise.race would be to use the releasing executor,
// However while it would no longer leak the raced promise objects themselves, it would
// still leak reactions on the non-resolved promises contending for the race.

/**
 * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
 * or rejected.
 *
 * Unlike `Promise.race` it cleans up after itself so a non-resolved value doesn't hold onto
 * the result promise.
 *
 * @template {readonly unknown[] | []} T
 * @param {T} values An iterable of Promises.
 * @returns {Promise<Awaited<T[number]>>} A new Promise.
 */
export function racePromises(values) {
  return harden(memoRace.call(BestPipelinablePromise, values));
}
harden(racePromises);
