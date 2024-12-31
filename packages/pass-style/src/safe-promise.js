/// <reference types="ses"/>

import { isPromise } from '@endo/promise-kit';
import { q } from '@endo/errors';
import { isFrozenOrIsNonTrapping } from 'ses/nonTrappingShimAdapter.js';
import {
  assertChecker,
  hasOwnPropertyOf,
  CX,
  isObject,
} from './passStyle-helpers.js';

/** @import {Checker} from './types.js' */

const { getPrototypeOf, getOwnPropertyDescriptor } = Object;
const { ownKeys } = Reflect;

/**
 * Explicitly tolerate symbol-named non-configurable non-writable data
 * property whose value is obviously harmless, such as a primitive value.
 *
 * The motivations are to tolerate `@@toStringTag` and those properties
 * that might be added by Node's async_hooks. Thus, beyond primitives, the
 * only values that must be tolerated are those safe values that might be
 * added by async_hooks.
 *
 * At the time of this writing, Node's async_hooks contains the
 * following code, which we need to tolerate if safe:
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
 * @param {object} obj
 * @param {string|symbol} key
 * @param {Checker} check
 */
const checkSafeOwnKeyOf = (obj, key, check) => {
  const desc = getOwnPropertyDescriptor(obj, key);
  assert(desc);
  const quoteKey = q(String(key));
  if (!hasOwnPropertyOf(desc, 'value')) {
    return CX(
      check,
    )`Own ${quoteKey} must be a data property, not an accessor: ${obj}`;
  }
  const { value, writable, configurable } = desc;
  if (writable) {
    return CX(check)`Own ${quoteKey} must not be writable: ${obj}`;
  }
  if (configurable) {
    return CX(check)`Own ${quoteKey} must not be configurable: ${obj}`;
  }
  if (!isObject(value)) {
    return true;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    isFrozenOrIsNonTrapping(value) &&
    getPrototypeOf(value) === Object.prototype
  ) {
    const subKeys = ownKeys(value);
    if (subKeys.length === 0) {
      return true;
    }

    if (subKeys.length === 1 && subKeys[0] === 'destroyed') {
      return checkSafeOwnKeyOf(value, 'destroyed', check);
    }
  }
  return CX(
    check,
  )`Unexpected Node async_hooks additions: ${obj}[${quoteKey}] is ${value}`;
};

/**
 * @see https://github.com/endojs/endo/issues/2700
 * @param {Promise} pr The value to examine
 * @param {Checker} check
 * @returns {pr is Promise} Whether it is a safe promise
 */
const checkPromiseOwnKeys = (pr, check) => {
  const keys = ownKeys(pr);

  if (keys.length === 0) {
    return true;
  }

  const stringKeys = keys.filter(key => typeof key !== 'symbol');

  if (stringKeys.length !== 0) {
    return CX(
      check,
    )`${pr} - Must not have any string-named own properties: ${q(stringKeys)}`;
  }

  return keys.every(key => checkSafeOwnKeyOf(pr, key, check));
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
    (isFrozenOrIsNonTrapping(pr) || CX(check)`${pr} - Must be frozen`) &&
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
