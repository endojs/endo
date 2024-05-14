/// <reference types="ses"/>

/** @import {Checker} from './types.js' */

import {
  assertChecker,
  canBeMethod,
  getOwnDataDescriptor,
  CX,
} from './passStyle-helpers.js';

const { ownKeys } = Reflect;
const { getPrototypeOf, prototype: objectPrototype } = Object;

/**
 * @param {unknown} candidate
 * @param {Checker} [check]
 */
const checkObjectPrototype = (candidate, check = undefined) => {
  return (
    getPrototypeOf(candidate) === objectPrototype ||
    (!!check &&
      CX(check)`Records must inherit from Object.prototype: ${candidate}`)
  );
};

/**
 * @param {unknown} candidate
 * @param {PropertyKey} key
 * @param {unknown} value
 * @param {Checker} [check]
 */
const checkPropertyCanBeValid = (candidate, key, value, check = undefined) => {
  return (
    (typeof key === 'string' ||
      (!!check &&
        CX(
          check,
        )`Records can only have string-named properties: ${candidate}`)) &&
    (!canBeMethod(value) ||
      (!!check &&
        // TODO: Update message now that there is no such thing as "implicit Remotable".
        CX(
          check,
        )`Records cannot contain non-far functions because they may be methods of an implicit Remotable: ${candidate}`))
  );
};

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const CopyRecordHelper = harden({
  styleName: 'copyRecord',

  canBeValid: (candidate, check = undefined) => {
    return (
      checkObjectPrototype(candidate, check) &&
      // Reject any candidate with a symbol-keyed property or method-like property
      // (such input is potentially a Remotable).
      ownKeys(candidate).every(key =>
        checkPropertyCanBeValid(candidate, key, candidate[key], check),
      )
    );
  },

  assertValid: (candidate, passStyleOfRecur) => {
    checkObjectPrototype(candidate, assertChecker);

    // Validate that each own property is appropriate, data/enumerable,
    // and has a recursively passable associated value.
    for (const name of ownKeys(candidate)) {
      const { value } = getOwnDataDescriptor(
        candidate,
        name,
        true,
        assertChecker,
      );
      checkPropertyCanBeValid(candidate, name, value, assertChecker);
      passStyleOfRecur(value);
    }
  },
});
