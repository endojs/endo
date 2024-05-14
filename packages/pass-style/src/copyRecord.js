/// <reference types="ses"/>

/** @import {Checker} from './types.js' */

import {
  assertChecker,
  canBeMethod,
  checkNormalProperty,
  CX,
} from './passStyle-helpers.js';

const { ownKeys } = Reflect;
const { getPrototypeOf, values, prototype: objectPrototype } = Object;

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const CopyRecordHelper = harden({
  styleName: 'copyRecord',

  canBeValid: (candidate, check = undefined) => {
    if (getPrototypeOf(candidate) !== objectPrototype) {
      return (
        !!check &&
        CX(check)`Records must inherit from Object.prototype: ${candidate}`
      );
    }

    return ownKeys(candidate).every(key => {
      return (
        (typeof key === 'string' ||
          (!!check &&
            CX(check)`Records can only have string-named properties: ${candidate}`)) &&
        (!canBeMethod(candidate[key]) ||
          (!!check &&
            // TODO: Update message now that there is no such thing as "implicit Remotable".
            CX(check)`Records cannot contain non-far functions because they may be methods of an implicit Remotable: ${candidate}`))
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
