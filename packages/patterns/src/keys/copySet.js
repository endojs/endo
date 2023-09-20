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

/** @template {Key} [K=Key] @typedef {import('../types').CopySet<K>} CopySet */
/** @typedef {import('../types').Key} Key */
/** @typedef {import('../types').FullCompare} FullCompare */
/** @typedef {import('@endo/marshal').Checker} Checker */
/** @typedef {import('@endo/pass-style').Passable} Passable */

/**
 * @template T
 * @param {T[]} elements
 * @param {FullCompare | undefined} fullCompare If provided and `elements` is already known
 * to be sorted by this `fullCompare`, then we should get a memo hit rather
 * than a resorting. However, currently, we still enumerate the entire array
 * each time.
 *
 * TODO: If doing this reduntantly turns out to be expensive, we
 * could memoize this no-duplicate finding as well, independent
 * of the `fullOrder` use to reach this finding.
 * @param {Checker} check
 * @returns {boolean}
 */
const checkNoDuplicates = (elements, fullCompare, check) => {
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
      return check(false, X`value has duplicate keys: ${k0}`);
    }
  }
  return true;
};

/**
 * @template T
 * @param {T[]} elements
 * @param {FullCompare} [fullCompare]
 * @returns {void}
 */
export const assertNoDuplicates = (elements, fullCompare = undefined) => {
  checkNoDuplicates(elements, fullCompare, assertChecker);
};

/**
 * @param {Passable[]} elements
 * @param {Checker} check
 * @returns {boolean}
 */
export const checkElements = (elements, check) => {
  if (passStyleOf(elements) !== 'copyArray') {
    return check(
      false,
      X`The keys of a copySet or copyMap must be a copyArray: ${elements}`,
    );
  }
  if (!isRankSorted(elements, compareAntiRank)) {
    return check(
      false,
      X`The keys of a copySet or copyMap must be sorted in reverse rank order: ${elements}`,
    );
  }
  return checkNoDuplicates(elements, undefined, check);
};
harden(checkElements);

export const assertElements = elements => {
  checkElements(elements, assertChecker);
};
harden(assertElements);

export const coerceToElements = elementsList => {
  const elements = sortByRank(elementsList, compareAntiRank);
  assertElements(elements);
  return elements;
};
harden(coerceToElements);

/**
 * @template K
 * @param {Iterable<K>} elementIter
 * @returns {CopySet<K>}
 */
export const makeSetOfElements = elementIter =>
  makeTagged('copySet', coerceToElements(elementIter));
harden(makeSetOfElements);
