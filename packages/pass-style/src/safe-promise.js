/// <reference types="ses"/>

import { isPromise } from '@endo/promise-kit';
import { q } from '@endo/errors';
import { assertChecker, CX } from './passStyle-helpers.js';

/** @import {Checker} from './types.js' */

const { isFrozen, getPrototypeOf, getOwnPropertyDescriptor, hasOwn } = Object;
const { ownKeys } = Reflect;
const { toStringTag } = Symbol;

/**
 * @param {Promise} pr The value to examine
 * @param {Checker} check
 * @returns {pr is Promise} Whether it is a safe promise
 */
const checkPromiseOwnKeys = (pr, check) => {
  const keys = ownKeys(pr);

  if (keys.length === 0) {
    return true;
  }

  /**
   * This excludes those symbol-named own properties that are also found on
   * `Promise.prototype`, so that overrides of these properties can be
   * explicitly tolerated if they pass the `checkSafeOwnKey` check below.
   * In particular, we wish to tolerate
   *   * An overriding `toStringTag` non-enumerable data property
   *     with a string value.
   *   * Those own properties that might be added by Node's async_hooks.
   */
  const unknownKeys = keys.filter(
    key => typeof key !== 'symbol' || !hasOwn(Promise.prototype, key),
  );

  if (unknownKeys.length !== 0) {
    return CX(
      check,
    )`${pr} - Must not have any own properties: ${q(unknownKeys)}`;
  }

  /**
   * Explicitly tolerate a `toStringTag` symbol-named non-enumerable
   * data property whose value is a string. Otherwise, tolerate those
   * symbol-named properties that might be added by NodeJS's async_hooks,
   * if they obey the expected safety properties.
   *
   * At the time of this writing, Node's async_hooks contains the
   * following code, which we can safely tolerate
   *
   * ```js
   * function destroyTracking(promise, parent) {
   *   trackPromise(promise, parent);
   *   const asyncId = promise[async_id_symbol];
   *   const destroyed = { destroyed: false };
   *   promise[destroyedSymbol] = destroyed;
   *   registerDestroyHook(promise, asyncId, destroyed);
   * }
   * ```
   *
   * @param {string|symbol} key
   */
  const checkSafeOwnKey = key => {
    if (key === toStringTag) {
      // TODO should we also enforce anything on the contents of the string,
      // such as that it must start with `'Promise'`?
      const tagDesc = getOwnPropertyDescriptor(pr, toStringTag);
      assert(tagDesc !== undefined);
      return (
        (hasOwn(tagDesc, 'value') ||
          CX(
            check,
          )`Own @@toStringTag must be a data property, not an accessor: ${q(tagDesc)}`) &&
        (typeof tagDesc.value === 'string' ||
          CX(
            check,
          )`Own @@toStringTag value must be a string: ${q(tagDesc.value)}`) &&
        (!tagDesc.enumerable ||
          CX(check)`Own @@toStringTag must not be enumerable: ${q(tagDesc)}`)
      );
    }
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
    return CX(
      check,
    )`Unexpected Node async_hooks additions to promise: ${pr}.${q(
      String(key),
    )} is ${val}`;
  };

  return keys.every(checkSafeOwnKey);
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
  return (
    (isFrozen(pr) || CX(check)`${pr} - Must be frozen`) &&
    (isPromise(pr) || CX(check)`${pr} - Must be a promise`) &&
    (getPrototypeOf(pr) === Promise.prototype ||
      CX(check)`${pr} - Must inherit from Promise.prototype: ${q(
        getPrototypeOf(pr),
      )}`) &&
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
