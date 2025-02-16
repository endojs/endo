/// <reference types="ses"/>

import { X } from '@endo/errors';
import { assertChecker, getOwnDataDescriptor } from './passStyle-helpers.js';

const { getPrototypeOf } = Object;
const { ownKeys } = Reflect;
const { isArray, prototype: arrayPrototype } = Array;

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const CopyArrayHelper = harden({
  styleName: 'copyArray',

  canBeValid: (candidate, check = undefined) =>
    isArray(candidate) ||
    (!!check && check(false, X`Array expected: ${candidate}`)),

  assertRestValid: (candidate, passStyleOfRecur) => {
    getPrototypeOf(candidate) === arrayPrototype ||
      assert.fail(X`Malformed array: ${candidate}`, TypeError);
    // Since we're already ensured candidate is an array, it should not be
    // possible for the following get to fail.
    const len = /** @type {number} */ (
      getOwnDataDescriptor(candidate, 'length', false, assertChecker).value
    );
    // Validate that each index property is own/data/enumerable
    // and its associated value is recursively passable.
    for (let i = 0; i < len; i += 1) {
      passStyleOfRecur(
        getOwnDataDescriptor(candidate, i, true, assertChecker).value,
      );
    }
    // Expect one key per index plus one for 'length'.
    ownKeys(candidate).length === len + 1 ||
      assert.fail(X`Arrays must not have non-indexes: ${candidate}`, TypeError);
  },
});
