import { Fail, hideAndHardenFunction } from '@endo/errors';
import {
  makeTagged,
  passStyleOf,
  compareAntiRank,
  isRankSorted,
  makeFullOrderComparatorKit,
  sortByRank,
} from '@endo/marshal';

/// <reference types="ses"/>

/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {Passable} from '@endo/pass-style';
 * @import {FullCompare} from '@endo/marshal';
 * @import {CopyBag, Key} from '../types.js';
 */

/**
 * @template {Key} T
 * @param {[T,bigint][]} bagEntries
 * @param {FullCompare | undefined} fullCompare If provided and `bagEntries` is already
 * known to be sorted by this `fullCompare`, then we should get a memo hit
 * rather than a resorting. However, currently, we still enumerate the entire
 * array each time.
 *
 * TODO: If doing this reduntantly turns out to be expensive, we
 * could memoize this no-duplicate-keys finding as well, independent
 * of the `fullOrder` use to reach this finding.
 * @param {Rejector} reject
 * @returns {boolean}
 */
const confirmNoDuplicateKeys = (bagEntries, fullCompare, reject) => {
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
      return reject && reject`value has duplicate keys: ${k0}`;
    }
  }
  return true;
};

/**
 * @template {Key} T
 * @param {[T,bigint][]} bagEntries
 * @param {FullCompare} [fullCompare]
 * @returns {void}
 */
export const assertNoDuplicateKeys = (bagEntries, fullCompare = undefined) => {
  confirmNoDuplicateKeys(bagEntries, fullCompare, Fail);
};

/**
 * @param {[Passable,bigint][]} bagEntries
 * @param {Rejector} reject
 * @returns {boolean}
 */
export const confirmBagEntries = (bagEntries, reject) => {
  if (passStyleOf(bagEntries) !== 'copyArray') {
    return (
      reject &&
      reject`The entries of a copyBag must be a copyArray: ${bagEntries}`
    );
  }
  if (!isRankSorted(bagEntries, compareAntiRank)) {
    return (
      reject &&
      reject`The entries of a copyBag must be sorted in reverse rank order: ${bagEntries}`
    );
  }
  for (const entry of bagEntries) {
    if (
      passStyleOf(entry) !== 'copyArray' ||
      entry.length !== 2 ||
      typeof entry[1] !== 'bigint'
    ) {
      return (
        reject &&
        reject`Each entry of a copyBag must be pair of a key and a bigint representing a count: ${entry}`
      );
    }
    if (entry[1] < 1) {
      return (
        reject &&
        reject`Each entry of a copyBag must have a positive count: ${entry}`
      );
    }
  }
  // @ts-expect-error XXX Key types
  return confirmNoDuplicateKeys(bagEntries, undefined, reject);
};
harden(confirmBagEntries);

// eslint-disable-next-line jsdoc/require-returns-check -- doesn't understand asserts
/**
 * @param {[Passable,bigint][]} bagEntries
 * @returns {asserts bagEntries is [Passable,bigint][]}
 */
export const assertBagEntries = bagEntries => {
  confirmBagEntries(bagEntries, Fail);
};
hideAndHardenFunction(assertBagEntries);

/**
 * @template {Key} K
 * @param {Iterable<[K, bigint]>} bagEntriesList
 */
export const coerceToBagEntries = bagEntriesList => {
  const bagEntries = sortByRank(bagEntriesList, compareAntiRank);
  assertBagEntries(bagEntries);
  return bagEntries;
};
harden(coerceToBagEntries);

/**
 * @template {Key} K
 * @param {Iterable<[K, bigint]>} bagEntryIter
 * @returns {CopyBag<K>}
 */
export const makeBagOfEntries = bagEntryIter =>
  makeTagged('copyBag', coerceToBagEntries(bagEntryIter));
harden(makeBagOfEntries);
