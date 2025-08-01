/// <reference types="ses"/>

import { Fail } from '@endo/errors';
import { confirmOwnDataDescriptor } from './passStyle-helpers.js';
import { canBeMethod } from './remotable.js';

/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {PassStyleHelper} from './internal-types.js';
 */

const { ownKeys } = Reflect;
const { getPrototypeOf, prototype: objectPrototype } = Object;

/**
 * @param {unknown} candidate
 * @param {Rejector} reject
 */
const confirmObjectPrototype = (candidate, reject) => {
  return (
    getPrototypeOf(candidate) === objectPrototype ||
    (reject && reject`Records must inherit from Object.prototype: ${candidate}`)
  );
};

/**
 * @param {unknown} candidate
 * @param {PropertyKey} key
 * @param {unknown} value
 * @param {Rejector} reject
 */
const confirmPropertyCanBeValid = (candidate, key, value, reject) => {
  return (
    (typeof key === 'string' ||
      (reject &&
        reject`Records can only have string-named properties: ${candidate}`)) &&
    (!canBeMethod(value) ||
      (reject &&
        // TODO: Update message now that there is no such thing as "implicit Remotable".
        reject`Records cannot contain non-far functions because they may be methods of an implicit Remotable: ${candidate}`))
  );
};

/**
 *
 * @type {PassStyleHelper}
 */
export const CopyRecordHelper = harden({
  styleName: 'copyRecord',

  confirmCanBeValid: (candidate, reject) => {
    return (
      confirmObjectPrototype(candidate, reject) &&
      // Reject any candidate with a symbol-keyed property or method-like property
      // (such input is potentially a Remotable).
      ownKeys(candidate).every(key =>
        confirmPropertyCanBeValid(candidate, key, candidate[key], reject),
      )
    );
  },

  assertRestValid: (candidate, passStyleOfRecur) => {
    // Validate that each own property has a recursively passable associated
    // value (we already know from confirmCanBeValid that the other constraints are
    // satisfied).
    for (const name of ownKeys(candidate)) {
      const { value } = confirmOwnDataDescriptor(candidate, name, true, Fail);
      passStyleOfRecur(value);
    }
  },
});
