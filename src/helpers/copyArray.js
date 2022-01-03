// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import '../types.js';
import './internal-types.js';
import '@agoric/assert/exported.js';
import { assertChecker, checkNormalProperty } from './passStyle-helpers.js';

const { details: X } = assert;
const { getPrototypeOf } = Object;
const { ownKeys } = Reflect;
const { isArray, prototype: arrayPrototype } = Array;

/**
 *
 * @type {PassStyleHelper}
 */
export const CopyArrayHelper = harden({
  styleName: 'copyArray',

  canBeValid: (candidate, check = x => x) =>
    check(isArray(candidate), X`Array expected: ${candidate}`),

  assertValid: (candidate, passStyleOfRecur) => {
    CopyArrayHelper.canBeValid(candidate, assertChecker);
    assert(
      getPrototypeOf(candidate) === arrayPrototype,
      X`Malformed array: ${candidate}`,
      TypeError,
    );
    // Since we're already ensured candidate is an array, it should not be
    // possible for the following test to fail
    checkNormalProperty(candidate, 'length', 'string', false, assertChecker);
    const len = candidate.length;
    for (let i = 0; i < len; i += 1) {
      checkNormalProperty(candidate, i, 'number', true, assertChecker);
    }
    assert(
      // +1 for the 'length' property itself.
      ownKeys(candidate).length === len + 1,
      X`Arrays must not have non-indexes: ${candidate}`,
      TypeError,
    );
    // Recursively validate that each member is passable.
    candidate.every(v => !!passStyleOfRecur(v));
  },
});
