/// <reference types="ses"/>

import {
  passStyleOf,
  getTag,
  compareRank,
  recordNames,
  recordValues,
  trivialComparator,
} from '@endo/marshal';
import { q, Fail } from '@endo/errors';
import {
  assertKey,
  getCopyBagEntries,
  getCopyMapEntryArray,
  getCopySetKeys,
} from './checkKey.js';
import { makeCompareCollection } from './keycollection-operators.js';

/** @template {import('../types.js').Key} [K=import('../types.js').Key] @typedef {import('../types').CopySet<K>} CopySet */

/**
 * CopySet X is smaller than CopySet Y iff all of these conditions hold:
 * 1. For every x in X, x is also in Y.
 * 2. There is a y in Y that is not in X.
 *
 * X is equivalent to Y iff the condition 1 holds but condition 2 does not.
 */
export const setCompare = makeCompareCollection(
  /** @type {<K extends unknown>(s: CopySet<K>) => Array<[K, 1]>} */ (
    s => harden(getCopySetKeys(s).map(key => [key, 1]))
  ),
  0,
  trivialComparator,
);
harden(setCompare);

/**
 * CopyBag X is smaller than CopyBag Y iff all of these conditions hold
 * (where `count(A, a)` is shorthand for the count associated with `a` in `A`):
 * 1. For every x in X, x is also in Y and count(X, x) <= count(Y, x).
 * 2. There is a y in Y such that y is not in X or count(X, y) < count(Y, y).
 *
 * X is equivalent to Y iff the condition 1 holds but condition 2 does not.
 */
export const bagCompare = makeCompareCollection(
  getCopyBagEntries,
  0n,
  trivialComparator,
);
harden(bagCompare);

// TODO The desired semantics for CopyMap comparison have not yet been decided.
// See https://github.com/endojs/endo/pull/1737#pullrequestreview-1596595411
// The below is a currently-unused extension of CopyBag semantics (i.e., absent
// entries treated as present with a value that is smaller than everything).
/**
 * A unique local value that is guaranteed to not exist in any inbound data
 * structure (which would not be the case if we used `Symbol.for`).
 */
const ABSENT = Symbol('absent');
/**
 * CopyMap X is smaller than CopyMap Y iff all of these conditions hold:
 * 1. X and Y are both Keys (i.e., neither contains non-comparable data).
 * 2. For every x in X, x is also in Y and X[x] is smaller than or equivalent to Y[x].
 * 3. There is a y in Y such that y is not in X or X[y] is smaller than Y[y].
 *
 * X is equivalent to Y iff conditions 1 and 2 hold but condition 3 does not.
 */
// eslint-disable-next-line no-underscore-dangle
const _mapCompare = makeCompareCollection(
  getCopyMapEntryArray,
  ABSENT,
  (leftValue, rightValue) => {
    if (leftValue === ABSENT && rightValue === ABSENT) {
      throw Fail`Internal: Unexpected absent entry pair`;
    } else if (leftValue === ABSENT) {
      return -1;
    } else if (rightValue === ABSENT) {
      return 1;
    } else {
      // eslint-disable-next-line no-use-before-define
      return compareKeys(leftValue, rightValue);
    }
  },
);
harden(_mapCompare);

/** @type {import('../types').KeyCompare} */
export const compareKeys = (left, right) => {
  assertKey(left);
  assertKey(right);
  const leftStyle = passStyleOf(left);
  const rightStyle = passStyleOf(right);
  if (leftStyle !== rightStyle) {
    // Different passStyles are incommensurate
    return NaN;
  }
  switch (leftStyle) {
    case 'undefined':
    case 'null':
    case 'boolean':
    case 'bigint':
    case 'string':
    case 'symbol': {
      // for these, keys compare the same as rank
      return compareRank(left, right);
    }
    case 'number': {
      const rankComp = compareRank(left, right);
      if (rankComp === 0) {
        return 0;
      }
      if (Number.isNaN(left) || Number.isNaN(right)) {
        // NaN is equal to itself, but incommensurate with everything else
        assert(!Number.isNaN(left) || !Number.isNaN(right));
        return NaN;
      }
      // Among non-NaN numbers, key order is the same as rank order. Note that
      // in both orders, `-0` is in the same equivalence class as `0`.
      return rankComp;
    }
    case 'remotable': {
      if (left === right) {
        return 0;
      }
      // If two remotables are not identical, then as keys they are
      // incommensurate.
      return NaN;
    }
    case 'copyArray': {
      // Lexicographic by key order. Rank order of arrays is lexicographic by
      // rank order.
      // Because the invariants above apply to the elements of the array,
      // they apply to the array as a whole.
      const len = Math.min(left.length, right.length);
      for (let i = 0; i < len; i += 1) {
        const result = compareKeys(left[i], right[i]);
        if (result !== 0) {
          return result;
        }
      }
      // If all matching elements are keyEQ, then according to their lengths.
      // Thus, if array X is a prefix of array Y, then X is smaller than Y.
      return compareRank(left.length, right.length);
    }
    case 'copyRecord': {
      // Pareto partial order comparison.
      const leftNames = recordNames(left);
      const rightNames = recordNames(right);

      // eslint-disable-next-line no-use-before-define
      if (!keyEQ(leftNames, rightNames)) {
        // If they do not have exactly the same properties,
        // they are incommensurate.
        // Note that rank sorting of copyRecords groups all copyRecords with
        // the same keys together, enabling range searching over copyRecords
        // to avoid more irrelevant ones.
        return NaN;
      }
      const leftValues = recordValues(left, leftNames);
      const rightValues = recordValues(right, rightNames);
      // Presume that both copyRecords have the same key order
      // until encountering a property disproving that hypothesis.
      let result = 0;
      for (let i = 0; i < leftValues.length; i += 1) {
        const comp = compareKeys(leftValues[i], rightValues[i]);
        if (Number.isNaN(comp)) {
          return NaN;
        }
        if (result !== comp && comp !== 0) {
          if (result === 0) {
            result = comp;
          } else {
            assert(
              (result === -1 && comp === 1) || (result === 1 && comp === -1),
            );
            return NaN;
          }
        }
      }
      // If copyRecord X is smaller than copyRecord Y, then they must have the
      // same property names and every value in X must be smaller or equal to
      // the corresponding value in Y (with at least one value smaller).
      // The rank order of X and Y is based on lexicographic rank order of
      // their values, as organized by reverse lexicographic order of their
      // property names.
      // Thus if compareKeys(X,Y) < 0 then compareRank(X,Y) < 0.
      return result;
    }
    case 'tagged': {
      const leftTag = getTag(left);
      const rightTag = getTag(right);
      if (leftTag !== rightTag) {
        // different tags are incommensurate
        return NaN;
      }
      switch (leftTag) {
        case 'copySet': {
          return setCompare(left, right);
        }
        case 'copyBag': {
          return bagCompare(left, right);
        }
        case 'copyMap': {
          // TODO The desired semantics for CopyMap comparison have not yet been decided.
          // See https://github.com/endojs/endo/pull/1737#pullrequestreview-1596595411
          throw Fail`Map comparison not yet implemented: ${left} vs ${right}`;
        }
        default: {
          throw Fail`unexpected tag ${q(leftTag)}: ${left}`;
        }
      }
    }
    default: {
      throw Fail`unexpected passStyle ${q(leftStyle)}: ${left}`;
    }
  }
};
harden(compareKeys);

export const keyLT = (left, right) => compareKeys(left, right) < 0;
harden(keyLT);

export const keyLTE = (left, right) => compareKeys(left, right) <= 0;
harden(keyLTE);

export const keyEQ = (left, right) => compareKeys(left, right) === 0;
harden(keyEQ);

export const keyGTE = (left, right) => compareKeys(left, right) >= 0;
harden(keyGTE);

export const keyGT = (left, right) => compareKeys(left, right) > 0;
harden(keyGT);
