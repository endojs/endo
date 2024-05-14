/// <reference types="ses"/>

import { Fail } from '@endo/errors';
import {
  assertChecker,
  checkTagRecord,
  PASS_STYLE,
  getOwnDataDescriptor,
  checkPassStyle,
} from './passStyle-helpers.js';

const { ownKeys } = Reflect;
const { getOwnPropertyDescriptors } = Object;

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const TaggedHelper = harden({
  styleName: 'tagged',

  canBeValid: (candidate, check = undefined) =>
    checkPassStyle(candidate, candidate[PASS_STYLE], 'tagged', check),

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
    ownKeys(restDescs).length === 0 ||
      Fail`Unexpected properties on tagged record ${ownKeys(restDescs)}`;

    // Validate that the 'payload' property is own/data/enumerable
    // and its associated value is recursively passable.
    passStyleOfRecur(
      getOwnDataDescriptor(candidate, 'payload', true, assertChecker).value,
    );
  },
});
