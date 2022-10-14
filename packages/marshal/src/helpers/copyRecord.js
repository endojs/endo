// @ts-check

/// <reference types="ses"/>

import {
  assertChecker,
  canBeMethod,
  checkNormalProperty,
} from './passStyle-helpers.js';

const { details: X, quote: q } = assert;
const { ownKeys } = Reflect;
const {
  getPrototypeOf,
  getOwnPropertyDescriptors,
  prototype: objectPrototype,
} = Object;

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const CopyRecordHelper = harden({
  styleName: 'copyRecord',

  canBeValid: (candidate, check) => {
    const reject = !!check && (details => check(false, details));
    if (getPrototypeOf(candidate) !== objectPrototype) {
      return (
        (reject &&
        reject(X`Records must inherit from Object.prototype: ${candidate}`))
      );
    }
    const descs = getOwnPropertyDescriptors(candidate);
    const descKeys = ownKeys(descs);

    for (const descKey of descKeys) {
      if (typeof descKey !== 'string') {
        // Pass by copy
        return (
          (reject &&
          reject(
            X`Records can only have string-named own properties: ${candidate}`,
          ))
        );
      }
      const desc = descs[descKey];
      if (canBeMethod(desc.value)) {
        return (
          (reject &&
          reject(
            X`Records cannot contain non-far functions because they may be methods of an implicit Remotable: ${candidate}`,
          ))
        );
      }
    }
    return true;
  },

  assertValid: (candidate, passStyleOfRecur) => {
    CopyRecordHelper.canBeValid(candidate, assertChecker);
    for (const name of ownKeys(candidate)) {
      typeof name === 'string' ||
        assert.fail(
          X`${q(name)} must be a string-named property: ${candidate}`,
        );
      checkNormalProperty(candidate, name, true, assertChecker);
    }
    // Recursively validate that each member is passable.
    Object.values(candidate).every(v => !!passStyleOfRecur(v));
  },
});
