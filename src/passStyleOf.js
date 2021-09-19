// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { isPromise } from '@agoric/promise-kit';
import { isObject, PASS_STYLE } from './helpers/passStyleHelpers.js';

import { CopyArrayHelper } from './helpers/copyArray.js';
import { CopyRecordHelper } from './helpers/copyRecord.js';
import { ErrorHelper } from './helpers/error.js';
import { RemotableHelper } from './helpers/remotable.js';

import './types.js';
import './helpers/internal-types.js';

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
 * @returns {{passStyleOf: PassStyleOf, HelperTable: any}}
 */
const makePassStyleOfKit = passStyleHelpers => {
  const HelperTable = {
    __proto__: null,
    copyArray: undefined,
    copyRecord: undefined,
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
        case 'bigint':
        case 'symbol': {
          return typestr;
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
  return harden({ passStyleOf, HelperTable });
};

const { passStyleOf, HelperTable } = makePassStyleOfKit([
  CopyArrayHelper,
  CopyRecordHelper,
  ErrorHelper,
  RemotableHelper,
]);
export { passStyleOf };

export const everyPassableChild = (passable, fn) => {
  const passStyle = passStyleOf(passable);
  const helper = HelperTable[passStyle];
  if (helper) {
    // everyPassable guards .every so that each helper only gets a
    // genuine passable of its own flavor.
    return helper.every(passable, fn);
  }
  return true;
};
harden(everyPassableChild);
