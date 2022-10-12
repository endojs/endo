// @ts-check

/// <reference types="ses"/>

import { isPromise } from '@endo/promise-kit';
import {
  assertChecker,
  checkTagRecord,
  PASS_STYLE,
} from './passStyle-helpers.js';
import { assertSafePromise } from './safe-promise.js';

const { details: X } = assert;
const { ownKeys } = Reflect;
const { getPrototypeOf, prototype: objectPrototype } = Object;

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const PromiseHelper = harden({
  styleName: 'promise',

  canBeValid: (candidate, check) => {
    return (
      (candidate[PASS_STYLE] === 'promise' ||
      isPromise(candidate) ||
      checkTagRecord(candidate, 'promise', check))
    );
  },

  assertValid: candidate => {
    PromiseHelper.canBeValid(candidate, assertChecker);
    if (isPromise(candidate)) {
      assertSafePromise(candidate);
      return;
    }

    const proto = getPrototypeOf(candidate);
    proto === objectPrototype ||
      proto === null ||
      assert.fail(X`Unexpected prototype for: ${candidate}`);

    const descKeys = ownKeys(candidate);
    (descKeys.length === 1 && descKeys[0] === PASS_STYLE) ||
      assert.fail(X`Must not have any own properties: ${candidate}`);
  },
});
