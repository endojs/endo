/// <reference types="ses"/>

import { assertChecker, checkNormalProperty } from './passStyle-helpers.js';

const { details: X } = assert;
const { getPrototypeOf } = Object;
const { ownKeys } = Reflect;
const { isArray, prototype: arrayPrototype } = Array;

/**
 * @param {unknown} candidate
 * @param {import('./types.js').Checker} [check]
 * @returns {boolean}
 */
const canBeValid = (candidate, check = undefined) =>
  isArray(candidate) ||
  (!!check && check(false, X`Array expected: ${candidate}`));

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const CopyArrayHelper = harden({
  styleName: 'copyArray',

  canBeValid,

  assertValid: (candidate, passStyleOfRecur) => {
    canBeValid(candidate, assertChecker);
    getPrototypeOf(candidate) === arrayPrototype ||
      assert.fail(X`Malformed array: ${candidate}`, TypeError);
    // Since we're already ensured candidate is an array, it should not be
    // possible for the following test to fail
    checkNormalProperty(candidate, 'length', false, assertChecker);
    const len = /** @type {unknown[]} */ (candidate).length;
    for (let i = 0; i < len; i += 1) {
      checkNormalProperty(candidate, i, true, assertChecker);
    }
    // +1 for the 'length' property itself.
    ownKeys(candidate).length === len + 1 ||
      assert.fail(X`Arrays must not have non-indexes: ${candidate}`, TypeError);
    // Recursively validate that each member is passable.
    candidate.every(v => !!passStyleOfRecur(v));
  },
});
