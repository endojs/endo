/* global globalThis */

/// <reference types="ses"/>

import { X, Fail, q } from '@endo/errors';
import { isObject, isTypedArray, PASS_STYLE } from './passStyle-helpers.js';

import { CopyArrayHelper } from './copyArray.js';
import { CopyRecordHelper } from './copyRecord.js';
import { TaggedHelper } from './tagged.js';
import { ErrorHelper } from './error.js';
import { RemotableHelper } from './remotable.js';

import { assertPassableSymbol } from './symbol.js';
import { assertSafePromise } from './safe-promise.js';

/** @typedef {import('./internal-types.js').PassStyleHelper} PassStyleHelper */
/** @typedef {import('./types.js').Passable} Passable */
/** @typedef {import('./types.js').PassStyle} PassStyle */
/** @typedef {import('./types.js').PassStyleOf} PassStyleOf */
/** @typedef {import('./types.js').PrimitiveStyle} PrimitiveStyle */

/** @typedef {Exclude<PassStyle, PrimitiveStyle | "promise">} HelperPassStyle */

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
    styleName in HelperTable || Fail`Unrecognized helper: ${q(styleName)}`;
    HelperTable[styleName] === undefined ||
      Fail`conflicting helpers for ${q(styleName)}`;
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
    // const inProgress = new Set();
    const inProgressArray = [];

    /**
     * @type {PassStyleOf}
     */
    const passStyleOfRecur = inner => {
      if (!isObject(inner)) {
        // eslint-disable-next-line no-use-before-define
        return passStyleOfInternal(inner);
      }
      const style = passStyleMemo.get(inner);
      if (style !== undefined) {
        return style;
      }
      // !inProgress.has(inner) ||
      !inProgressArray.includes(inner) ||
        Fail`Pass-by-copy data cannot be cyclic ${inner}`;
      // inProgress.add(inner);
      inProgressArray.push(inner);
      // eslint-disable-next-line no-use-before-define
      const passStyle = passStyleOfInternal(inner);
      passStyleMemo.set(inner, passStyle);
      // inProgress.delete(inner);
      const i = inProgressArray.pop();
      assert(i === inner);
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
          if (inner instanceof Promise) {
            assertSafePromise(inner);
            return 'promise';
          }
          // Bizarrely expensive on non-promises
          // TODO Restore, hopefully cheaper
          // !isPromise(inner) ||
          //   Fail`${inner} promise must inherit from Promise.prototype`;
          typeof inner.then !== 'function' ||
            Fail`Cannot pass non-promise thenables`;
          const passStyleTag = inner[PASS_STYLE];
          if (passStyleTag !== undefined) {
            assert.typeof(passStyleTag, 'string');
            const helper = HelperTable[passStyleTag];
            helper !== undefined ||
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
          isFrozen(inner) ||
            Fail`Cannot pass non-frozen objects like ${inner}. Use harden()`;
          typeof inner.then !== 'function' ||
            Fail`Cannot pass non-promise thenables`;
          remotableHelper.assertValid(inner, passStyleOfRecur);
          return 'remotable';
        }
        default: {
          throw assert.fail(X`Unrecognized typeof ${q(typestr)}`, TypeError);
        }
      }
    };

    return passStyleOfRecur(passable);
  };
  return harden(passStyleOf);
};

export const PassStyleOfEndowmentSymbol = Symbol.for('@endo passStyleOf');

/**
 * If there is already a PassStyleOfEndowmentSymbol property on the global,
 * then presumably it was endowed for us by liveslots with a `passStyleOf`
 * function, so we should use and export that one instead.
 * Other software may have left it for us here,
 * but it would require write access to our global, or the ability to
 * provide endowments to our global, both of which seems adequate as a test of
 * whether it is authorized to serve the same role as liveslots.
 *
 * NOTE HAZARD: This use by liveslots does rely on `passStyleOf` being
 * deterministic. If it is not, then in a liveslot-like virtualized
 * environment, it can be used to detect GC.
 *
 * @type {PassStyleOf}
 */
export const passStyleOf =
  (globalThis && globalThis[PassStyleOfEndowmentSymbol]) ||
  makePassStyleOf([
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
