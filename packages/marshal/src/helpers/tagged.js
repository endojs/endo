// @ts-check

/// <reference types="ses"/>

import {
  assertChecker,
  checkTagRecord,
  PASS_STYLE,
  checkNormalProperty,
} from './passStyle-helpers.js';

const { details: X } = assert;
const { ownKeys } = Reflect;
const { getPrototypeOf, prototype: objectPrototype } = Object;

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const TaggedHelper = harden({
  styleName: 'tagged',

  canBeValid: (candidate, check) => checkTagRecord(candidate, 'tagged', check),

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
    (ownKeys(rest).length === 0) ||
      assert.fail(X`Unexpected properties on Remotable Proto ${ownKeys(rest)}`);

    checkNormalProperty(candidate, 'payload', 'string', true, assertChecker);

    // Recursively validate that each member is passable.
    !!passStyleOfRecur(candidate.payload);
  },
});
