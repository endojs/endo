/// <reference types="ses"/>

import { Fail } from '@endo/errors';
import {
  assertChecker,
  checkSelectorRecord,
  PASS_STYLE,
  checkPassStyle,
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
export const SelectorHelper = harden({
  styleName: 'selector',

  canBeValid: (candidate, check = undefined) =>
    checkPassStyle(candidate, candidate[PASS_STYLE], 'selector', check),

  assertRestValid: (candidate, passStyleOfRecur) => {
    checkSelectorRecord(candidate, 'selector', assertChecker);

    // Typecasts needed due to https://github.com/microsoft/TypeScript/issues/1863
    const passStyleKey = /** @type {unknown} */ (PASS_STYLE);
    const tagKey = /** @type {unknown} */ (Symbol.toStringTag);
    const {
      // checkTagRecord already verified PASS_STYLE and Symbol.toStringTag own data properties.
      [/** @type {string} */ (passStyleKey)]: _passStyleDesc,
      [/** @type {string} */ (tagKey)]: _labelDesc,
      ...restDescs
    } = getOwnPropertyDescriptors(candidate);
    ownKeys(restDescs).length === 0 ||
      Fail`Unexpected properties on selector record ${ownKeys(restDescs)}`;
  },
});
