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
 * @import {CopySet, Key} from '../types.js';
 */

/**
 * @template {Passable} T
 * @param {T[]} elements
 * @param {FullCompare | undefined} fullCompare If provided and `elements` is already known
 * to be sorted by this `fullCompare`, then we should get a memo hit rather
 * than a resorting. However, currently, we still enumerate the entire array
 * each time.
 *
 * TODO: If doing this reduntantly turns out to be expensive, we
 * could memoize this no-duplicate finding as well, independent
 * of the `fullOrder` use to reach this finding.
 * @param {Rejector} reject
 * @returns {boolean}
 */
const confirmNoDuplicates = (elements, fullCompare, reject) => {
  // This fullOrder contains history dependent state. It is specific
  // to this one call and does not survive it.
  // TODO Once all our tooling is ready for `&&=`, the following
  // line should be rewritten using it.
  fullCompare = fullCompare || makeFullOrderComparatorKit().antiComparator;

  elements = sortByRank(elements, fullCompare);
  const { length } = elements;
  for (let i = 1; i < length; i += 1) {
    const k0 = elements[i - 1];
    const k1 = elements[i];
    if (fullCompare(k0, k1) === 0) {
      return reject && reject`value has duplicate keys: ${k0}`;
    }
  }
  return true;
};

/**
 * @template {Passable} T
 * @param {T[]} elements
 * @param {FullCompare} [fullCompare]
 * @returns {void}
 */
export const assertNoDuplicates = (elements, fullCompare = undefined) => {
  confirmNoDuplicates(elements, fullCompare, Fail);
};

/**
 * @param {Passable[]} elements
 * @param {Rejector} reject
 * @returns {boolean}
 */
export const confirmElements = (elements, reject) => {
  if (passStyleOf(elements) !== 'copyArray') {
    return (
      reject &&
      reject`The keys of a copySet or copyMap must be a copyArray: ${elements}`
    );
  }
  if (!isRankSorted(elements, compareAntiRank)) {
    return (
      reject &&
      reject`The keys of a copySet or copyMap must be sorted in reverse rank order: ${elements}`
    );
  }
  return confirmNoDuplicates(elements, undefined, reject);
};
harden(confirmElements);

export const assertElements = elements => {
  confirmElements(elements, Fail);
};
hideAndHardenFunction(assertElements);

/**
 * @template {Key} K
 * @param {Iterable<K>} elementsList
 */
export const coerceToElements = elementsList => {
  const elements = sortByRank(elementsList, compareAntiRank);
  assertElements(elements);
  return elements;
};
harden(coerceToElements);

/**
 * @template {Key} K
 * @param {Iterable<K>} elementIter
 * @returns {CopySet<K>}
 */
export const makeSetOfElements = elementIter =>
  makeTagged('copySet', coerceToElements(elementIter));
harden(makeSetOfElements);
