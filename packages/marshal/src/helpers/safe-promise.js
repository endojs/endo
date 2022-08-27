// @ts-check

/// <reference types="ses"/>

import { isPromise } from '@endo/promise-kit';
import { assertChecker, hasOwnPropertyOf } from './passStyle-helpers.js';

/** @typedef {import('../types.js').Checker} Checker */

const { details: X, quote: q } = assert;
const { isFrozen, getPrototypeOf } = Object;
const { ownKeys } = Reflect;

/**
 * @param {Promise} pr The value to examine
 * @param {Checker} check
 * @returns {pr is Promise} Whether it is a safe promise
 */
const checkPromiseOwnKeys = (pr, check) => {
  const keys = ownKeys(pr);

  const unknownKeys = keys.filter(
    key => typeof key !== 'symbol' || !hasOwnPropertyOf(Promise.prototype, key),
  );

  return (
    check(
      unknownKeys.length === 0,
      X`${pr} - Must not have any own properties: ${q(unknownKeys)}`,
    ) &&
    check(
      keys.filter(key => {
        const val = pr[key];
        return !(
          val === undefined ||
          typeof val === 'number' ||
          (typeof val === 'object' &&
            isFrozen(val) &&
            getPrototypeOf(val) === Object.prototype &&
            ownKeys(val).length === 0)
        );
      }).length === 0,
      X`${pr} - async_hooks own keys have unexpected values`,
    )
  );
};

/**
 * Under Hardened JS a promise is "safe" if its `then` method can be called
 * synchronously without giving the promise an opportunity for a
 * reentrancy attack during that call.
 *
 * https://github.com/Agoric/agoric-sdk/issues/9
 * raises the issue of testing that a specimen is a safe promise
 * such that the test also does not give the specimen a
 * reentrancy opportunity. That is well beyond the ambition here.
 * TODO Though if we figure out a nice solution, it might be good to
 * use it here as well.
 *
 * @param {unknown} pr The value to examine
 * @param {Checker} check
 * @returns {pr is Promise} Whether it is a safe promise
 */
const checkSafePromise = (pr, check) =>
  check(isFrozen(pr), X`${pr} - Must be frozen`) &&
  check(isPromise(pr), X`${pr} - Must be a promise`) &&
  check(
    getPrototypeOf(pr) === Promise.prototype,
    X`${pr} - Must inherit from Promise.prototype: ${q(getPrototypeOf(pr))}`,
  ) &&
  checkPromiseOwnKeys(/** @type {Promise} */ (pr), check);
harden(checkSafePromise);

/**
 * Determine if the argument is a Promise.
 *
 * @param {unknown} pr The value to examine
 * @returns {pr is Promise} Whether it is a promise
 */
export const isSafePromise = pr => checkSafePromise(pr, x => x);
harden(isSafePromise);

export const assertSafePromise = pr => checkSafePromise(pr, assertChecker);
