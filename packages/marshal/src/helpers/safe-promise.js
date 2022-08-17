// @ts-check

/// <reference types="ses"/>

import { isPromise } from '@endo/promise-kit';
import { assertChecker } from './passStyle-helpers.js';

/** @typedef {import('../types.js').Checker} Checker */

const { details: X, quote: q } = assert;
const { isFrozen, getPrototypeOf } = Object;
const { ownKeys } = Reflect;

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
 * @param {Checker} [check]
 * @returns {pr is Promise} Whether it is a safe promise
 */
const checkSafePromise = (pr, check = x => x) => {
  let keys;
  return (
    check(isFrozen(pr), X`${pr} - Must be frozen`) &&
    check(isPromise(pr), X`${pr} - Must be a promise`) &&
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
