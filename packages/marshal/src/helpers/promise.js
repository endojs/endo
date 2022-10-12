// @ts-check

/// <reference types="ses"/>

import { isPromise } from '@endo/promise-kit';
import {
  assertChecker,
  checkTagRecord,
  PASS_STYLE,
} from './passStyle-helpers.js';
import { assertSafePromise } from './safe-promise.js';

const { details: X, quote: q } = assert;
const {
  getOwnPropertyDescriptor,
  getPrototypeOf,
  prototype: objectPrototype,
} = Object;
const { ownKeys } = Reflect;
const { toStringTag } = Symbol;

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
export const PromiseHelper = harden({
  styleName: 'promise',

  canBeValid: (candidate, check) => {
    const passStyleDesc = getOwnPropertyDescriptor(candidate, PASS_STYLE);
    return (
      ((passStyleDesc && passStyleDesc.value === 'promise') ||
      isPromise(candidate) ||
      check(
        false,
        X`Pseudo-promise must be an object with ${q(PASS_STYLE)} ${q(
          'promise',
        )}: ${candidate}`,
      ))
    );
  },

  assertValid: candidate => {
    if (isPromise(candidate)) {
      assertSafePromise(candidate);
      return;
    }

    checkTagRecord(candidate, 'promise', assertChecker);

    // XXX Should this (and TaggedHelper.assertValid) support a null prototype?
    getPrototypeOf(candidate) === objectPrototype ||
      assert.fail(X`Unexpected prototype for: ${candidate}`);

    const tagDesc = getOwnPropertyDescriptor(candidate, toStringTag);
    (tagDesc && tagDesc.value === 'Pseudo-promise') ||
      assert.fail(
        X`Pseudo-promise must be an object with ${q(toStringTag)} ${q(
          'Pseudo-promise',
        )}: ${candidate}`,
      );
    const keys = ownKeys(candidate);
    keys.every(k => k === PASS_STYLE || k === toStringTag) ||
      assert.fail(X`Unexpected properties on pseudo-promise ${keys}`);
  },
});
