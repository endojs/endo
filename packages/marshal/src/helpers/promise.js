// @ts-check

/// <reference types="ses"/>

import { isPromise } from '@endo/promise-kit';
import {
  assertChecker,
  checkTagRecord,
  hasOwnPropertyOf,
  PASS_STYLE,
} from './passStyle-helpers.js';

/** @typedef {import('../types.js').Checker} Checker */

const { details: X, quote: q } = assert;
const {
  getOwnPropertyDescriptor,
  getPrototypeOf,
  isFrozen,
  prototype: objectPrototype,
} = Object;
const { ownKeys } = Reflect;
const { toStringTag } = Symbol;

/**
 * @param {Promise} pr The value to examine
 * @param {Checker} check
 * @returns {pr is Promise} Whether it is a safe promise
 */
const checkPromiseOwnKeys = (pr, check) => {
  const reject = details => check(false, details);
  const keys = ownKeys(pr);

  if (keys.length === 0) {
    return true;
  }

  const unknownKeys = keys.filter(
    key => typeof key !== 'symbol' || !hasOwnPropertyOf(Promise.prototype, key),
  );

  if (unknownKeys.length !== 0) {
    return reject(
      X`${pr} - Must not have any own properties: ${q(unknownKeys)}`,
    );
  }

  /**
   * At the time of this writing, Node's async_hooks contains the
   * following code, which we can also safely tolerate
   *
   * ```js
   * function destroyTracking(promise, parent) {
   * trackPromise(promise, parent);
   *   const asyncId = promise[async_id_symbol];
   *   const destroyed = { destroyed: false };
   *   promise[destroyedSymbol] = destroyed;
   *   registerDestroyHook(promise, asyncId, destroyed);
   * }
   * ```
   *
   * @param {string|symbol} key
   */
  const checkSafeAsyncHooksKey = key => {
    const val = pr[key];
    if (val === undefined || typeof val === 'number') {
      return true;
    }
    if (
      typeof val === 'object' &&
      val !== null &&
      isFrozen(val) &&
      getPrototypeOf(val) === Object.prototype
    ) {
      const subKeys = ownKeys(val);
      if (subKeys.length === 0) {
        return true;
      }

      if (
        subKeys.length === 1 &&
        subKeys[0] === 'destroyed' &&
        val.destroyed === false
      ) {
        return true;
      }
    }
    return reject(
      X`Unexpected Node async_hooks additions to promise: ${pr}.${q(
        String(key),
      )} is ${val}`,
    );
  };

  return keys.every(checkSafeAsyncHooksKey);
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
const checkSafePromise = (pr, check) => {
  const reject = details => check(false, details);
  return (
    (isFrozen(pr) || reject(X`${pr} - Must be frozen`)) &&
    (isPromise(pr) || reject(X`${pr} - Must be a promise`)) &&
    (getPrototypeOf(pr) === Promise.prototype ||
      reject(
        X`${pr} - Must inherit from Promise.prototype: ${q(
          getPrototypeOf(pr),
        )}`,
      )) &&
    checkPromiseOwnKeys(/** @type {Promise} */ (pr), check)
  );
};
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

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const PromiseHelper = harden({
  styleName: 'promise',

  canBeValid: (candidate, check) => {
    const passStyleDesc = getOwnPropertyDescriptor(candidate, PASS_STYLE);
    return (
      ((passStyleDesc && passStyleDesc.value === 'promise') ||
      isPromise(candidate) ||
      check(
        false,
        X`Pseudo-promise must be an object with ${q(PASS_STYLE)} ${q(
          'promise',
        )}: ${candidate}`,
      ))
    );
  },

  assertValid: candidate => {
    if (isPromise(candidate)) {
      assertSafePromise(candidate);
      return;
    }

    checkTagRecord(candidate, 'promise', assertChecker);

    getPrototypeOf(candidate) === objectPrototype ||
      assert.fail(X`Unexpected prototype for: ${candidate}`);

    const tagDesc = getOwnPropertyDescriptor(candidate, toStringTag);
    (tagDesc && tagDesc.value === 'Pseudo-promise') ||
      assert.fail(
        X`Pseudo-promise must be an object with ${q(toStringTag)} ${q(
          'Pseudo-promise',
        )}: ${candidate}`,
      );
    const keys = ownKeys(candidate);
    keys.every(k => k === PASS_STYLE || k === toStringTag) ||
      assert.fail(X`Unexpected properties on pseudo-promise ${keys}`);
  },
});
