// @ts-check

/// <reference types="ses"/>

import { isPromise } from '@endo/promise-kit';
import { assertChecker, PASS_STYLE } from './passStyle-helpers.js';
import { assertSafePromise } from './safe-promise.js';

const { details: X, quote: q } = assert;
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
      (isPromise(candidate) ||
      candidate[PASS_STYLE] === 'promise' ||
      check(false, X`Missing ${q(PASS_STYLE)}: ${candidate}`))
    );
  },

  assertValid: candidate => {
    if (isPromise(candidate)) {
      assertSafePromise(candidate);
      return;
    }

    PromiseHelper.canBeValid(candidate, assertChecker);

    const proto = getPrototypeOf(candidate);
    proto === objectPrototype ||
      proto === null ||
      assert.fail(X`Unexpected prototype for: ${candidate}`);

    const descKeys = ownKeys(candidate);
    (descKeys.length === 1 && descKeys[0] === PASS_STYLE) ||
      assert.fail(X`Must not have any own properties: ${candidate}`);
  },
});
