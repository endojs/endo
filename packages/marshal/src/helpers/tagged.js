/// <reference types="ses"/>

import {
  assertChecker,
  checkTagRecord,
  PASS_STYLE,
  checkNormalProperty,
  checkPassStyle,
} from './passStyle-helpers.js';

const { Fail } = assert;
const { ownKeys } = Reflect;
const { getOwnPropertyDescriptors } = Object;

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const TaggedHelper = harden({
  styleName: 'tagged',

  canBeValid: (candidate, check = undefined) =>
    checkPassStyle(candidate, 'tagged', check),

  assertValid: (candidate, passStyleOfRecur) => {
    checkTagRecord(candidate, 'tagged', assertChecker);

    // Typecasts needed due to https://github.com/microsoft/TypeScript/issues/1863
    const passStyleKey = /** @type {unknown} */ (PASS_STYLE);
    const tagKey = /** @type {unknown} */ (Symbol.toStringTag);
    const {
      // checkTagRecord already verified PASS_STYLE and Symbol.toStringTag own data properties.
      [/** @type {string} */ (passStyleKey)]: _passStyleDesc,
      [/** @type {string} */ (tagKey)]: _labelDesc,
      payload: _payloadDesc, // value checked by recursive walk at the end
      ...restDescs
    } = getOwnPropertyDescriptors(candidate);
    (ownKeys(restDescs).length === 0) ||
      Fail`Unexpected properties on tagged record ${ownKeys(restDescs)}`;

    checkNormalProperty(candidate, 'payload', true, assertChecker);

    // Recursively validate that each member is passable.
    passStyleOfRecur(candidate.payload);
  },
});
