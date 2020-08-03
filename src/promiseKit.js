/* global harden */
// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { HandledPromise } from '@agoric/eventual-send';

/**
 * @template T
 * @typedef {Object} PromiseRecord A reified Promise
 * @property {(value: T) => void} resolve
 * @property {(reason: any) => void} reject
 * @property {Promise<T>} promise
 */

/**
 * Needed to prevent type errors where functions are detected to be undefined.
 */
const NOOP_INITIALIZER = harden(_ => {});

/**
 * makePromiseKit() builds a HandledPromise object, and returns a record
 * containing the promise itself, as well as separate facets for resolving
 * and rejecting it.
 *
 * @template T
 * @returns {PromiseRecord<T>}
 */
export function makePromiseKit() {
  /** @type {(value: T) => void} */
  let res = NOOP_INITIALIZER;
  /** @type {(reason: any) => void} */
  let rej = NOOP_INITIALIZER;

  // We use a HandledPromise so that we can run HandledPromise.unwrap(p)
  // even if p doesn't travel through a comms system (like SwingSet's).
  const p = new HandledPromise((resolve, reject) => {
    res = resolve;
    rej = reject;
  });
  // Node.js adds the `domain` property which is not a standard
  // property on Promise. Because we do not know it to be ocap-safe,
  // we remove it.
  if (p.domain) {
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
  return HandledPromise.resolve(maybePromise) === maybePromise;
}
harden(isPromise);
