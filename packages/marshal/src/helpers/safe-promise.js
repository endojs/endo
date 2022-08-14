// @ts-check

/// <reference types="ses"/>

import { isPromise } from '@endo/promise-kit';
import { assertChecker } from './passStyle-helpers.js';

/** @typedef {import('../types.js').Checker} Checker */

const { details: X, quote: q } = assert;
const { isFrozen, getPrototypeOf } = Object;
const { ownKeys } = Reflect;

/**
 * Under Hardened JS a promise is "safe" if its `then` menthod can be called
 * syncronously without giving the promise an opportunity for a
 * reentrancy attack during that call. No matter what `pr` is
 * `checkSafePromise(pr)` also should not give it such an opportunity.
 *
 * We first test whether `pr` is a promise using `isPromise`,
 * which currently is not safe against reentrancy.
 * TODO: Make `isPromise` safe against reentrancy.
 *
 * Once we know `pr` is a promise, we know `pr` is not a proxy, so
 * pr should not be able to sense the rest of these tests.
 *
 * @param {unknown} pr The value to examine
 * @param {Checker} [check]
 * @returns {pr is Promise} Whether it is a safe promise
 */
const checkSafePromise = (pr, check = x => x) => {
  let keys;
  return (
    check(isPromise(pr), X`${pr} - Must be a promise`) &&
    check(isFrozen(pr), X`${pr} - Must be frozen`) &&
    check(
      getPrototypeOf(pr) === Promise.prototype,
      X`${pr} - Must inherit from Promise.prototype: ${q(getPrototypeOf(pr))}`,
    ) &&
    check(
      // Suppressing prettier for the following line because it wants to
      // remove the "extra" parens around `pr`. However, these parens are
      // required for the TypeScript case syntax. We know this case is safe
      // because we only get here if `ifPromise(pr)` already passed.
      // eslint-disable-next-line prettier/prettier
      (keys = ownKeys(/** @type {Promise} pr */(pr))).length === 0,
      X`{pr} - Must not have any own properties: ${q(keys)}`,
    )
  );
};
harden(checkSafePromise);

/**
 * Determine if the argument is a Promise.
 *
 * @param {unknown} pr The value to examine
 * @returns {pr is Promise} Whether it is a promise
 */
export const isSafePromise = pr => checkSafePromise(pr);
harden(isSafePromise);

export const assertSafePromise = pr => checkSafePromise(pr, assertChecker);
