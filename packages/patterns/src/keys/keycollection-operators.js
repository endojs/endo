// @ts-check
import {
  assertRankSorted,
  compareAntiRank,
  makeFullOrderComparatorKit,
  sortByRank,
} from '@endo/marshal';
import { makeIterator, makeArrayIterator } from '../utils.js';

/** @typedef {import('@endo/marshal').RankCompare} RankCompare */
/** @typedef {import('../types').KeyComparison} KeyComparison */
/** @typedef {import('../types').KeyCompare} KeyCompare */
/** @typedef {import('../types').FullCompare} FullCompare */
/** @typedef {import('../types').KeyCollection} KeyCollection */

const { quote: q, Fail } = assert;

/**
 * Refines a sequence of entries that is already sorted over its keys by the
 * `rankCompare` preorder, where there may be internal runs tied for the same
 * rank, into an iterable that resolves those ties using `fullCompare`.
 *
 * @template [V=unknown]
 * @param {Array<[import('../types.js').Key, V]>} entries
 * @param {RankCompare} rankCompare
 * @param {FullCompare} fullCompare
 * @returns {IterableIterator<[import('../types.js').Key, V]>}
 */
const generateFullSortedEntries = (entries, rankCompare, fullCompare) => {
  // @ts-expect-error FIXME Key types
  assertRankSorted(entries, rankCompare);
  const { length } = entries;
  let i = 0;
  let sameRankIterator;
  return makeIterator(() => {
    if (sameRankIterator) {
      const result = sameRankIterator.next();
      if (!result.done) {
        return result;
      }
      sameRankIterator = undefined;
    }
    if (i < length) {
      const entry = entries[i];
      // Look ahead for same-rank ties.
      let j = i + 1;
      while (j < length && rankCompare(entry[0], entries[j][0]) === 0) {
        j += 1;
      }
      if (j === i + 1) {
        // No ties found.
        i = j;
        return harden({ done: false, value: entry });
      }
      const ties = entries.slice(i, j);
      i = j;

      // Sort the ties by `fullCompare`, enforce key uniqueness, and delegate to
      // a sub-iterator.
      // @ts-expect-error FIXME Key types
      const sortedTies = sortByRank(ties, fullCompare);
      for (let k = 1; k < sortedTies.length; k += 1) {
        // @ts-expect-error FIXME Key types
        const [key0] = sortedTies[k - 1];
        const [key1] = sortedTies[k];
        Math.sign(fullCompare(key0, key1)) ||
          Fail`Duplicate entry key: ${key0}`;
      }
      sameRankIterator = makeArrayIterator(sortedTies);
      return sameRankIterator.next();
    }
    return harden({ done: true, value: undefined });
  });
};
harden(generateFullSortedEntries);

/**
 * Returns an iterator that merges reverse-rank-sorted [key, value] entries of
 * two KeyCollections into a reverse-full-sorted [key, value1, value2] entries
 * by the key they have in common, representing the value for an absent entry in
 * either collection as `absentValue`.
 *
 * @template [C=KeyCollection]
 * @template [V=unknown]
 * @param {C} c1
 * @param {C} c2
 * @param {(collection: C) => Array<[import('../types.js').Key, V]>} getEntries
 * @param {any} absentValue
 * @returns {IterableIterator<[import('../types.js').Key, V | absentValue, V | absentValue]>}
 */
export const generateCollectionPairEntries = (
  c1,
  c2,
  getEntries,
  absentValue,
) => {
  const e1 = getEntries(c1);
  const e2 = getEntries(c2);

  // Establish a history-dependent comparison scoped to the active invocation
  // and use it to map reverse-preordered entries into an iterator with a
  // narrower total order.
  const fullCompare = makeFullOrderComparatorKit().antiComparator;
  const x = generateFullSortedEntries(e1, compareAntiRank, fullCompare);
  const y = generateFullSortedEntries(e2, compareAntiRank, fullCompare);

  // Maintain a single-result { done, key, value } buffer for each iterator
  // so they can be merged.
  let xDone;
  let xKey;
  let xValue;
  let yDone;
  let yKey;
  let yValue;
  const nonEntry = [undefined, undefined];
  const nextX = () => {
    !xDone || Fail`Internal: nextX must not be called once done`;
    const result = xValue;
    ({ done: xDone, value: [xKey, xValue] = nonEntry } = x.next());
    return result;
  };
  nextX();
  const nextY = () => {
    !yDone || Fail`Internal: nextY must not be called once done`;
    const result = yValue;
    ({ done: yDone, value: [yKey, yValue] = nonEntry } = y.next());
    return result;
  };
  nextY();
  return makeIterator(() => {
    let done = false;
    /** @type {[import('../types.js').Key, V | absentValue, V | absentValue]} */
    let value;
    if (xDone && yDone) {
      done = true;
      value = [undefined, absentValue, absentValue];
    } else if (xDone) {
      value = [yKey, absentValue, nextY()];
    } else if (yDone) {
      value = [xKey, nextX(), absentValue];
    } else {
      // Compare the keys to determine if we should return a merged result
      // or a one-sided result.
      const comp = fullCompare(xKey, yKey);
      if (comp === 0) {
        value = [xKey, nextX(), nextY()];
      } else if (comp < 0) {
        value = [xKey, nextX(), absentValue];
      } else if (comp > 0) {
        value = [yKey, absentValue, nextY()];
      } else {
        throw Fail`Unexpected key comparison ${q(comp)} for ${xKey} vs ${yKey}`;
      }
    }
    return harden({ done, value });
  });
};
harden(generateCollectionPairEntries);

/**
 * Returns a function for comparing two KeyCollections of the same type using
 * the provided entries factory and same-key entry value comparator (where the
 * value for an absent entry in one collection is `absentValue`).
 *
 * If the corresponding entries for any single key are incomparable or the
 * comparison result has the opposite sign of the result for a different key,
 * then the KeyCollections are incomparable. Otherwise, the collections compare
 * by the result of any non-equal entry comparison, or compare equal if there is
 * no non-equal entry comparison result.
 * For example, given CopyBags X and Y and a value comparator that goes by count
 * (defaulting absent keys to a count of 0), X is smaller than Y (`result < 0`)
 * iff there are no keys in X that are either absent from Y
 * (`compareValues(xCount, absentValue) > 0`) or present in Y with a lower count
 * (`compareValues(xCount, yCount) > 0`) AND there is at least one key in Y that
 * is either absent from X (`compareValues(absentValue, yCount) < 0`) or present
 * with a lower count (`compareValues(xCount, yCount) < 0`).
 *
 * This can be generalized to virtual collections in the future by replacing
 * `getEntries => Array` with `generateEntries => IterableIterator`.
 *
 * @template [C=KeyCollection]
 * @template [V=unknown]
 * @param {(collection: C) => Array<[import('../types.js').Key, V]>} getEntries
 * @param {any} absentValue
 * @param {KeyCompare} compareValues
 * @returns {(left: C, right: C) => KeyComparison}
 */
export const makeCompareCollection = (getEntries, absentValue, compareValues) =>
  harden((left, right) => {
    const merged = generateCollectionPairEntries(
      left,
      right,
      getEntries,
      absentValue,
    );
    let leftIsBigger = false;
    let rightIsBigger = false;
    for (const [_key, leftValue, rightValue] of merged) {
      const comp = compareValues(leftValue, rightValue);
      if (comp === 0) {
        // eslint-disable-next-line no-continue
        continue;
      } else if (comp < 0) {
        // Based on this key, left < right.
        rightIsBigger = true;
      } else if (comp > 0) {
        // Based on this key, left > right.
        leftIsBigger = true;
      } else {
        Number.isNaN(comp) ||
          // prettier-ignore
          Fail`Unexpected value comparison ${q(comp)} for ${leftValue} vs ${rightValue}`;
        return NaN;
      }
      if (leftIsBigger && rightIsBigger) {
        return NaN;
      }
    }
    // eslint-disable-next-line no-nested-ternary
    return leftIsBigger ? 1 : rightIsBigger ? -1 : 0;
  });
harden(makeCompareCollection);
