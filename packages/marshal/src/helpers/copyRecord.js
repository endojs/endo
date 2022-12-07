/// <reference types="ses"/>

import {
  assertChecker,
  canBeMethod,
  checkNormalProperty,
} from './passStyle-helpers.js';

const { details: X } = assert;
const { ownKeys } = Reflect;
const { getPrototypeOf, values, prototype: objectPrototype } = Object;

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const CopyRecordHelper = harden({
  styleName: 'copyRecord',

  canBeValid: (candidate, check = undefined) => {
    const reject = !!check && (details => check(false, details));
    if (getPrototypeOf(candidate) !== objectPrototype) {
      return (
        reject &&
        reject(X`Records must inherit from Object.prototype: ${candidate}`)
      );
    }

    return ownKeys(candidate).every(key => {
      return (
        ((typeof key === 'string' ||
          (!!reject &&
            reject(
              X`Records can only have string-named properties: ${candidate}`,
            ))) &&
        (!canBeMethod(candidate[key]) ||
          (!!reject &&
            reject(
              // TODO: Update message now that there is no such thing as "implicit Remotable".
              X`Records cannot contain non-far functions because they may be methods of an implicit Remotable: ${candidate}`,
            ))))
      );
    });
  },

  assertValid: (candidate, passStyleOfRecur) => {
    CopyRecordHelper.canBeValid(candidate, assertChecker);
    for (const name of ownKeys(candidate)) {
      checkNormalProperty(candidate, name, true, assertChecker);
    }
    // Recursively validate that each member is passable.
    for (const val of values(candidate)) {
      passStyleOfRecur(val);
    }
  },
});
