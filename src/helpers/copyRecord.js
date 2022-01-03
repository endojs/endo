// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import {
  assertChecker,
  canBeMethod,
  checkNormalProperty,
} from './passStyle-helpers.js';

import '../types.js';
import './internal-types.js';
import '@agoric/assert/exported.js';

const { details: X } = assert;
const { ownKeys } = Reflect;
const {
  getPrototypeOf,
  getOwnPropertyDescriptors,
  prototype: objectPrototype,
} = Object;

/**
 *
 * @type {PassStyleHelper}
 */
export const CopyRecordHelper = harden({
  styleName: 'copyRecord',

  canBeValid: (candidate, check = x => x) => {
    const proto = getPrototypeOf(candidate);
    if (proto !== objectPrototype && proto !== null) {
      return check(false, X`Unexpected prototype for: ${candidate}`);
    }
    const descs = getOwnPropertyDescriptors(candidate);
    const descKeys = ownKeys(descs);

    for (const descKey of descKeys) {
      if (typeof descKey !== 'string') {
        // Pass by copy
        return check(
          false,
          X`Records can only have string-named own properties: ${candidate}`,
        );
      }
      const desc = descs[descKey];
      if (canBeMethod(desc.value)) {
        return check(
          false,
          X`Records cannot contain non-far functions because they may be methods of an implicit Remotable: ${candidate}`,
        );
      }
    }
    return true;
  },

  assertValid: (candidate, passStyleOfRecur) => {
    CopyRecordHelper.canBeValid(candidate, assertChecker);
    for (const name of ownKeys(candidate)) {
      checkNormalProperty(candidate, name, 'string', true, assertChecker);
    }
    // Recursively validate that each member is passable.
    Object.values(candidate).every(v => !!passStyleOfRecur(v));
  },
});
