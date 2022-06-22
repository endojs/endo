/* global globalThis */
// @ts-check

/// <reference types="ses"/>

import { memoRace } from './src/memo-race.js';

/** @type {PromiseConstructor} */
const BestPipelinablePromise = globalThis.HandledPromise || Promise;

/**
 * @template T
 * @typedef {Object} PromiseKit A reified Promise
 * @property {(value: ERef<T>) => void} resolve
 * @property {(reason: any) => void} reject
 * @property {Promise<T>} promise
 */

/**
 * PromiseRecord is deprecated in favor of PromiseKit.
 *
 * @template T
 * @typedef {PromiseKit<T>} PromiseRecord
 */

/**
 * @template T
 * @typedef {T | PromiseLike<T>} ERef
 * A reference of some kind for to an object of type T. It may be a direct
 * reference to a local T. It may be a local presence for a remote T. It may
 * be a promise for a local or remote T. Or it may even be a thenable
 * (a promise-like non-promise with a "then" method) for a T.
 */

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
 * @returns {PromiseKit<T>}
 */
export function makePromiseKit() {
  /** @type {(value: ERef<T>) => void} */
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
 * Determine if the argument is a Promise.
 *
 * @param {any} maybePromise The value to examine
 * @returns {maybePromise is Promise} Whether it is a promise
 */
export function isPromise(maybePromise) {
  return Promise.resolve(maybePromise) === maybePromise;
}
harden(isPromise);

/**
 * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
 * or rejected.
 *
 * Unlike `Promise.race` it cleans up after itself so a non-resolved value doesn't hold onto
 * the result promise.
 *
 * @template {readonly unknown[] | []} T
 * @param {T} values An array of Promises.
 * @returns {Promise<Awaited<T[number]>>} A new Promise.
 */
export function racePromises(values) {
  return harden(memoRace(values));
}
harden(racePromises);
