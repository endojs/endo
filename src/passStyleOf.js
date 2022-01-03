// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { isPromise } from '@agoric/promise-kit';
import { isObject, PASS_STYLE } from './helpers/passStyle-helpers.js';

import { CopyArrayHelper } from './helpers/copyArray.js';
import { CopyRecordHelper } from './helpers/copyRecord.js';
import { TaggedHelper } from './helpers/tagged.js';
import { RemotableHelper } from './helpers/remotable.js';
import { ErrorHelper } from './helpers/error.js';

import './types.js';
import './helpers/internal-types.js';
import { assertPassableSymbol } from './helpers/symbol.js';

const { details: X, quote: q } = assert;
const { ownKeys } = Reflect;
const { isFrozen } = Object;

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
  const HelperTable = {
    __proto__: null,
    copyArray: undefined,
    copyRecord: undefined,
    tagged: undefined,
    remotable: undefined,
    error: undefined,
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
    assert(
      HelperTable[styleName] !== undefined,
      X`missing helper for ${q(styleName)}`,
    );
  }
  harden(HelperTable);
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
        assert(
          !inProgress.has(inner),
          X`Pass-by-copy data cannot be cyclic ${inner}`,
        );
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
          assert(
            isFrozen(inner),
            X`Cannot pass non-frozen objects like ${inner}. Use harden()`,
          );
          if (isPromise(inner)) {
            return 'promise';
          }
          assert(
            typeof inner.then !== 'function',
            X`Cannot pass non-promise thenables`,
          );
          const passStyleTag = inner[PASS_STYLE];
          if (passStyleTag !== undefined) {
            assert.typeof(passStyleTag, 'string');
            const helper = HelperTable[passStyleTag];
            assert(
              helper !== undefined,
              X`Unrecognized PassStyle: ${q(passStyleTag)}`,
            );
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
          assert(
            isFrozen(inner),
            X`Cannot pass non-frozen objects like ${inner}. Use harden()`,
          );
          assert(
            typeof inner.then !== 'function',
            X`Cannot pass non-promise thenables`,
          );
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
  RemotableHelper,
  ErrorHelper,
]);

export const assertPassable = val => {
  passStyleOf(val); // throws if val is not a passable
};
harden(assertPassable);
