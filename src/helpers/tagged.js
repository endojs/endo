// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import {
  assertChecker,
  checkTagRecord,
  PASS_STYLE,
  checkNormalProperty,
} from './passStyle-helpers.js';

import '../types.js';
import './internal-types.js';
import '@agoric/assert/exported.js';

const { details: X } = assert;
const { ownKeys } = Reflect;
const { getPrototypeOf, prototype: objectPrototype } = Object;

/**
 *
 * @type {PassStyleHelper}
 */
export const TaggedHelper = harden({
  styleName: 'tagged',

  canBeValid: (candidate, check = x => x) =>
    checkTagRecord(candidate, 'tagged', check),

  assertValid: (candidate, passStyleOfRecur) => {
    TaggedHelper.canBeValid(candidate, assertChecker);
    assert.equal(
      getPrototypeOf(candidate),
      objectPrototype,
      X`Unexpected prototype for: ${candidate}`,
    );

    const {
      [PASS_STYLE]: _passStyle, // checkTagRecord already checked
      [Symbol.toStringTag]: _label, // checkTagRecord already checked
      payload: _payload, // value checked by recursive walk at the end
      ...rest
    } = candidate;

    assert(
      ownKeys(rest).length === 0,
      X`Unexpected properties on Remotable Proto ${ownKeys(rest)}`,
    );

    checkNormalProperty(candidate, 'payload', 'string', true, assertChecker);

    // Recursively validate that each member is passable.
    !!passStyleOfRecur(candidate.payload);
  },
});
