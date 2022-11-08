// @ts-check

/// <reference types="ses"/>

import { isPromise } from '@endo/promise-kit';
import {
  isObject,
  isTypedArray,
  PASS_STYLE,
} from './helpers/passStyle-helpers.js';

import { CopyArrayHelper } from './helpers/copyArray.js';
import { CopyRecordHelper } from './helpers/copyRecord.js';
import { TaggedHelper } from './helpers/tagged.js';
import { ErrorHelper } from './helpers/error.js';
import { RemotableHelper } from './helpers/remotable.js';

import { assertPassableSymbol } from './helpers/symbol.js';
import { assertSafePromise } from './helpers/safe-promise.js';

/** @typedef {import('./helpers/internal-types.js').PassStyleHelper} PassStyleHelper */
/** @typedef {import('./types.js').Passable} Passable */
/** @typedef {import('./types.js').PassStyle} PassStyle */
/** @typedef {import('./types.js').PassStyleOf} PassStyleOf */
/** @typedef {import('./types.js').PrimitiveStyle} PrimitiveStyle */

/** @typedef {Exclude<PassStyle, PrimitiveStyle | "promise">} HelperPassStyle */

const { details: X, Fail, quote: q } = assert;
const { ownKeys } = Reflect;
const { isFrozen } = Object;

/**
 * @param {PassStyleHelper[]} passStyleHelpers
 * @returns {Record<HelperPassStyle, PassStyleHelper> }
 */

const makeHelperTable = passStyleHelpers => {
  /** @type {Record<HelperPassStyle, any> & {__proto__: null}} */
  const HelperTable = {
    __proto__: null,
    copyArray: undefined,
    copyRecord: undefined,
    tagged: undefined,
    error: undefined,
    remotable: undefined,
  };
  for (const helper of passStyleHelpers) {
    const { styleName } = helper;
    assert(styleName in HelperTable, X`Unrecognized helper: ${q(styleName)}`);
    assert.equal(
      HelperTable[styleName],
      undefined,
      X`conflicting helpers for ${q(styleName)}`,
    );
    HelperTable[styleName] = helper;
  }
  for (const styleName of ownKeys(HelperTable)) {
    HelperTable[styleName] !== undefined ||
      Fail`missing helper for ${q(styleName)}`;
  }

  return harden(HelperTable);
};

/**
 * @param {PassStyleHelper[]} passStyleHelpers The passStyleHelpers to register,
 * in priority order.
 * NOTE These must all be "trusted",
 * complete, and non-colliding. `makePassStyleOf` may *assume* that each helper
 * does what it is supposed to do. `makePassStyleOf` is not trying to defend
 * itself against malicious helpers, though it does defend against some
 * accidents.
 * @returns {PassStyleOf}
 */
const makePassStyleOf = passStyleHelpers => {
  const HelperTable = makeHelperTable(passStyleHelpers);
  const remotableHelper = HelperTable.remotable;

  /**
   * Purely for performance. However it is mutable static state, and
   * it does have some observability on proxies. TODO need to assess
   * whether this creates a static communications channel.
   *
   * passStyleOf does a full recursive walk of pass-by-copy
   * structures, in order to validate that they are acyclic. In addition
   * it is used by other algorithms to recursively walk these pass-by-copy
   * structures, so without this cache, these algorithms could be
   * O(N**2) or worse.
   *
   * @type {WeakMap<Passable, PassStyle>}
   */
  const passStyleMemo = new WeakMap();

  /**
   * @type {PassStyleOf}
   */
  const passStyleOf = passable => {
    // Even when a WeakSet is correct, when the set has a shorter lifetime
    // than its keys, we prefer a Set due to expected implementation
    // tradeoffs.
    const inProgress = new Set();

    /**
     * @type {PassStyleOf}
     */
    const passStyleOfRecur = inner => {
      const innerIsObject = isObject(inner);
      if (innerIsObject) {
        if (passStyleMemo.has(inner)) {
          // @ts-ignore TypeScript doesn't know that `get` after `has` is safe
          return passStyleMemo.get(inner);
        }
        (!inProgress.has(inner)) ||
          Fail`Pass-by-copy data cannot be cyclic ${inner}`;
        inProgress.add(inner);
      }
      // eslint-disable-next-line no-use-before-define
      const passStyle = passStyleOfInternal(inner);
      if (innerIsObject) {
        passStyleMemo.set(inner, passStyle);
        inProgress.delete(inner);
      }
      return passStyle;
    };

    /**
     * @type {PassStyleOf}
     */
    const passStyleOfInternal = inner => {
      const typestr = typeof inner;
      switch (typestr) {
        case 'undefined':
        case 'string':
        case 'boolean':
        case 'number':
        case 'bigint': {
          return typestr;
        }
        case 'symbol': {
          assertPassableSymbol(inner);
          return 'symbol';
        }
        case 'object': {
          if (inner === null) {
            return 'null';
          }
          if (!isFrozen(inner)) {
            assert.fail(
              // TypedArrays get special treatment in harden()
              // and a corresponding special error message here.
              isTypedArray(inner)
                ? X`Cannot pass mutable typed arrays like ${inner}.`
                : X`Cannot pass non-frozen objects like ${inner}. Use harden()`,
            );
          }
          if (isPromise(inner)) {
            assertSafePromise(inner);
            return 'promise';
          }
          (typeof inner.then !== 'function') ||
            Fail`Cannot pass non-promise thenables`;
          const passStyleTag = inner[PASS_STYLE];
          if (passStyleTag !== undefined) {
            assert.typeof(passStyleTag, 'string');
            const helper = HelperTable[passStyleTag];
            (helper !== undefined) ||
              Fail`Unrecognized PassStyle: ${q(passStyleTag)}`;
            helper.assertValid(inner, passStyleOfRecur);
            return /** @type {PassStyle} */ (passStyleTag);
          }
          for (const helper of passStyleHelpers) {
            if (helper.canBeValid(inner)) {
              helper.assertValid(inner, passStyleOfRecur);
              return helper.styleName;
            }
          }
          remotableHelper.assertValid(inner, passStyleOfRecur);
          return 'remotable';
        }
        case 'function': {
          (isFrozen(inner)) ||
            Fail`Cannot pass non-frozen objects like ${inner}. Use harden()`;
          (typeof inner.then !== 'function') ||
            Fail`Cannot pass non-promise thenables`;
          remotableHelper.assertValid(inner, passStyleOfRecur);
          return 'remotable';
        }
        default: {
          assert.fail(X`Unrecognized typeof ${q(typestr)}`, TypeError);
        }
      }
    };

    return passStyleOfRecur(passable);
  };
  return harden(passStyleOf);
};

export const passStyleOf = makePassStyleOf([
  CopyArrayHelper,
  CopyRecordHelper,
  TaggedHelper,
  ErrorHelper,
  RemotableHelper,
]);

export const assertPassable = val => {
  passStyleOf(val); // throws if val is not a passable
};
harden(assertPassable);
