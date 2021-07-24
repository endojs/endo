/* global globalThis */
// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

/** @type {import('@agoric/eventual-send').HandledPromiseConstructor | PromiseConstructor} */
const BestPipelinablePromise = globalThis.HandledPromise || Promise;

/**
 * @template T
 * @typedef {Object} PromiseRecord A reified Promise
 * @property {(value: ERef<T>) => void} resolve
 * @property {(reason: any) => void} reject
 * @property {Promise<T>} promise
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
 * @returns {PromiseRecord<T>}
 */
export function makePromiseKit() {
  /** @type {(value: ERef<T>) => void} */
  let res = NOOP_INITIALIZER;
  /** @type {(reason: any) => void} */
  let rej = NOOP_INITIALIZER;

  /** @type {Promise<any> & {domain?: unknown}} */
  const p = new BestPipelinablePromise((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
  // Node.js adds the `domain` property which is not a standard
  // property on Promise. Because we do not know it to be ocap-safe,
  // we remove it.
  if ('domain' in p) {
    // deleting p.domain may break functionality. To retain current
    // functionality at the expense of safety, set unsafe to true.
    const unsafe = false;
    if (unsafe) {
      const originalDomain = p.domain;
      Object.defineProperty(p, 'domain', {
        get() {
          return originalDomain;
        },
      });
    } else {
      delete p.domain;
    }
  }
  return harden({ promise: p, resolve: res, reject: rej });
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
