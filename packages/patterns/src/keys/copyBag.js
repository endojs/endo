import {
  assertChecker,
  makeTagged,
  passStyleOf,
  compareAntiRank,
  isRankSorted,
  makeFullOrderComparatorKit,
  sortByRank,
} from '@endo/marshal';

/// <reference types="ses"/>

const { details: X } = assert;

/**
 * @template T
 * @param {[T,bigint][]} bagEntries
 * @param {FullCompare | undefined} fullCompare If provided and `bagEntries` is already
 * known to be sorted by this `fullCompare`, then we should get a memo hit
 * rather than a resorting. However, currently, we still enumerate the entire
 * array each time.
 *
 * TODO: If doing this reduntantly turns out to be expensive, we
 * could memoize this no-duplicate-keys finding as well, independent
 * of the `fullOrder` use to reach this finding.
 * @param {Checker} check
 * @returns {boolean}
 */
const checkNoDuplicateKeys = (bagEntries, fullCompare, check) => {
  // This fullOrder contains history dependent state. It is specific
  // to this one call and does not survive it.
  // TODO Once all our tooling is ready for `&&=`, the following
  // line should be rewritten using it.
  fullCompare = fullCompare || makeFullOrderComparatorKit().antiComparator;

  // Since the key is more significant than the value (the count),
  // sorting by fullOrder is guaranteed to make duplicate keys
  // adjacent independent of their counts.
  bagEntries = sortByRank(bagEntries, fullCompare);
  const { length } = bagEntries;
  for (let i = 1; i < length; i += 1) {
    const k0 = bagEntries[i - 1][0];
    const k1 = bagEntries[i][0];
    if (fullCompare(k0, k1) === 0) {
      return check(false, X`value has duplicate keys: ${k0}`);
    }
  }
  return true;
};

/**
 * @template T
 * @param {[T,bigint][]} bagEntries
 * @param {FullCompare=} fullCompare
 * @returns {void}
 */
export const assertNoDuplicateKeys = (bagEntries, fullCompare = undefined) => {
  checkNoDuplicateKeys(bagEntries, fullCompare, assertChecker);
};

/**
 * @param {[Passable,bigint][]} bagEntries
 * @param {Checker} check
 * @returns {boolean}
 */
export const checkBagEntries = (bagEntries, check) => {
  if (passStyleOf(bagEntries) !== 'copyArray') {
    return check(
      false,
      X`The entries of a copyBag must be a copyArray: ${bagEntries}`,
    );
  }
  if (!isRankSorted(bagEntries, compareAntiRank)) {
    return check(
      false,
      X`The entries of a copyBag must be sorted in reverse rank order: ${bagEntries}`,
    );
  }
  for (const entry of bagEntries) {
    if (
      passStyleOf(entry) !== 'copyArray' ||
      entry.length !== 2 ||
      typeof entry[1] !== 'bigint'
    ) {
      return check(
        false,
        X`Each entry of a copyBag must be pair of a key and a bigint representing a count: ${entry}`,
      );
    }
    if (entry[1] < 1) {
      return check(
        false,
        X`Each entry of a copyBag must have a positive count: ${entry}`,
      );
    }
  }
  return checkNoDuplicateKeys(bagEntries, undefined, check);
};
harden(checkBagEntries);

// eslint-disable-next-line jsdoc/require-returns-check -- doesn't understand asserts
/**
 * @param {[Passable,bigint][]} bagEntries
 * @returns {asserts bagEntries is [Passable,bigint][]}
 */
export const assertBagEntries = bagEntries => {
  checkBagEntries(bagEntries, assertChecker);
};
harden(assertBagEntries);

export const coerceToBagEntries = bagEntriesList => {
  const bagEntries = sortByRank(bagEntriesList, compareAntiRank);
  assertBagEntries(bagEntries);
  return bagEntries;
};
harden(coerceToBagEntries);

/**
 * @template K
 * @param {Iterable<[K, bigint]>} bagEntryIter
 * @returns {CopyBag<K>}
 */
export const makeBagOfEntries = bagEntryIter =>
  makeTagged('copyBag', coerceToBagEntries(bagEntryIter));
harden(makeBagOfEntries);
