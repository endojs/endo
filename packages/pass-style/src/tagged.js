/// <reference types="ses"/>

import { Fail } from '@endo/errors';
import {
  confirmTagRecord,
  PASS_STYLE,
  confirmOwnDataDescriptor,
  confirmPassStyle,
} from './passStyle-helpers.js';

/**
 * @import {PassStyleHelper} from './internal-types.js'
 */

const { ownKeys } = Reflect;
const { getOwnPropertyDescriptors } = Object;

/**
 *
 * @type {PassStyleHelper}
 */
export const TaggedHelper = harden({
  styleName: 'tagged',

  confirmCanBeValid: (candidate, reject) =>
    confirmPassStyle(candidate, candidate[PASS_STYLE], 'tagged', reject),

  assertRestValid: (candidate, passStyleOfRecur) => {
    confirmTagRecord(candidate, 'tagged', Fail);

    // Typecasts needed due to https://github.com/microsoft/TypeScript/issues/1863
    const passStyleKey = /** @type {unknown} */ (PASS_STYLE);
    const tagKey = /** @type {unknown} */ (Symbol.toStringTag);
    const {
      // confirmTagRecord already verified PASS_STYLE and Symbol.toStringTag own data properties.
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
      confirmOwnDataDescriptor(candidate, 'payload', true, Fail).value,
    );
  },
});
