/// <reference types="ses"/>

import { Fail, q, hideAndHardenFunction } from '@endo/errors';
import { Far, getTag, makeTagged, passStyleOf, isAtom } from '@endo/pass-style';
import {
  compareAntiRank,
  makeFullOrderComparatorKit,
  sortByRank,
} from '@endo/marshal';

import { confirmElements, makeSetOfElements } from './copySet.js';
import { confirmBagEntries, makeBagOfEntries } from './copyBag.js';

const { ownKeys } = Reflect;

/**
 * @import {Rejector} from '@endo/errors/rejector.js';
 * @import {Passable, Atom} from '@endo/pass-style';
 * @import {CopyBag, CopyMap, CopySet, Key, ScalarKey} from '../types.js';
 */

// ////////////////// Atom and Scalar keys ////////////////////////////////

/**
 * @param {any} val
 * @param {Rejector} reject
 * @returns {boolean}
 */
export const confirmScalarKey = (val, reject) => {
  if (isAtom(val)) {
    return true;
  }
  const passStyle = passStyleOf(val);
  if (passStyle === 'remotable') {
    return true;
  }
  return reject && reject`A ${q(passStyle)} cannot be a scalar key: ${val}`;
};

/**
 * @param {any} val
 * @returns {val is ScalarKey}
 */
export const isScalarKey = val => confirmScalarKey(val, false);
hideAndHardenFunction(isScalarKey);

/**
 * @param {Passable} val
 * @returns {asserts val is ScalarKey}
 */
export const assertScalarKey = val => {
  confirmScalarKey(val, Fail);
};
hideAndHardenFunction(assertScalarKey);

// ////////////////////////////// Keys /////////////////////////////////////////

// @ts-expect-error Key does not satisfy WeakKey
/** @type {WeakSet<Key>} */
// @ts-expect-error Key does not satisfy WeakKey
const keyMemo = new WeakSet();

/**
 * @param {unknown} val
 * @param {Rejector} reject
 * @returns {boolean}
 */
export const confirmKey = (val, reject) => {
  if (isAtom(val)) {
    return true;
  }
  // @ts-expect-error narrowed
  if (keyMemo.has(val)) {
    return true;
  }
  // eslint-disable-next-line no-use-before-define
  const result = confirmKeyInternal(val, reject);
  if (result) {
    // Don't cache the undefined cases, so that if it is tried again
    // with `Fail` it'll throw a diagnostic again
    // @ts-expect-error narrowed
    keyMemo.add(val);
  }
  // Note that we must not memoize a negative judgement, so that if it is tried
  // again with `Fail`, it will still produce a useful diagnostic.
  return result;
};
harden(confirmKey);

/**
 * @type {{
 *   (val: Passable): val is Key;
 *   (val: any): boolean;
 * }}
 */
export const isKey = val => confirmKey(val, false);
hideAndHardenFunction(isKey);

/**
 * @param {Key} val
 * @returns {asserts val is Key}
 */
export const assertKey = val => {
  confirmKey(val, Fail);
};
hideAndHardenFunction(assertKey);

// //////////////////////////// CopySet ////////////////////////////////////////

// Moved to here so they can check that the copySet contains only keys
// without creating an import cycle.

/** @type {WeakSet<CopySet>} */
const copySetMemo = new WeakSet();

/**
 * @param {any} s
 * @param {Rejector} reject
 * @returns {boolean}
 */
export const confirmCopySet = (s, reject) => {
  if (copySetMemo.has(s)) {
    return true;
  }
  const result =
    ((passStyleOf(s) === 'tagged' && getTag(s) === 'copySet') ||
      (reject && reject`Not a copySet: ${s}`)) &&
    confirmElements(s.payload, reject) &&
    confirmKey(s.payload, reject);
  if (result) {
    copySetMemo.add(s);
  }
  return result;
};
harden(confirmCopySet);

/**
 * @param {any} s
 * @returns {s is CopySet}
 */
export const isCopySet = s => confirmCopySet(s, false);
hideAndHardenFunction(isCopySet);

/**
 * @callback AssertCopySet
 * @param {Passable} s
 * @returns {asserts s is CopySet}
 */

/** @type {AssertCopySet} */
export const assertCopySet = s => {
  confirmCopySet(s, Fail);
};
hideAndHardenFunction(assertCopySet);

/**
 * @template {Key} K
 * @param {CopySet<K>} s
 * @returns {K[]}
 */
export const getCopySetKeys = s => {
  assertCopySet(s);
  return s.payload;
};
harden(getCopySetKeys);

/**
 * @template {Key} K
 * @param {CopySet<K>} s
 * @param {(key: K, index: number) => boolean} fn
 * @returns {boolean}
 */
export const everyCopySetKey = (s, fn) =>
  getCopySetKeys(s).every((key, index) => fn(key, index));
harden(everyCopySetKey);

/**
 * @template {Key} K
 * @param {Iterable<K>} elementIter
 * @returns {CopySet<K>}
 */
export const makeCopySet = elementIter => {
  const result = makeSetOfElements(elementIter);
  assertCopySet(result);
  return result;
};
harden(makeCopySet);

// //////////////////////////// CopyBag ////////////////////////////////////////

// Moved to here so they can check that the copyBag contains only keys
// without creating an import cycle.

/** @type {WeakSet<CopyBag>} */
const copyBagMemo = new WeakSet();

/**
 * @param {any} b
 * @param {Rejector} reject
 * @returns {boolean}
 */
export const confirmCopyBag = (b, reject) => {
  if (copyBagMemo.has(b)) {
    return true;
  }
  const result =
    ((passStyleOf(b) === 'tagged' && getTag(b) === 'copyBag') ||
      (reject && reject`Not a copyBag: ${b}`)) &&
    confirmBagEntries(b.payload, reject) &&
    confirmKey(b.payload, reject);
  if (result) {
    copyBagMemo.add(b);
  }
  return result;
};
harden(confirmCopyBag);

/**
 * @param {any} b
 * @returns {b is CopyBag}
 */
export const isCopyBag = b => confirmCopyBag(b, false);
hideAndHardenFunction(isCopyBag);

/**
 * @callback AssertCopyBag
 * @param {Passable} b
 * @returns {asserts b is CopyBag}
 */

/** @type {AssertCopyBag} */
export const assertCopyBag = b => {
  confirmCopyBag(b, Fail);
};
hideAndHardenFunction(assertCopyBag);

/**
 * @template {Key} K
 * @param {CopyBag<K>} b
 * @returns {CopyBag<K>['payload']}
 */
export const getCopyBagEntries = b => {
  assertCopyBag(b);
  return b.payload;
};
harden(getCopyBagEntries);

/**
 * @template {Key} K
 * @param {CopyBag<K>} b
 * @param {(entry: [K, bigint], index: number) => boolean} fn
 * @returns {boolean}
 */
export const everyCopyBagEntry = (b, fn) =>
  getCopyBagEntries(b).every((entry, index) => fn(entry, index));
harden(everyCopyBagEntry);

/**
 * @template {Key} K
 * @param {Iterable<[K,bigint]>} bagEntryIter
 * @returns {CopyBag<K>}
 */
export const makeCopyBag = bagEntryIter => {
  const result = makeBagOfEntries(bagEntryIter);
  assertCopyBag(result);
  return result;
};
harden(makeCopyBag);

/**
 * @template {Key} K
 * @param {Iterable<K>} elementIter
 * @returns {CopyBag<K>}
 */
export const makeCopyBagFromElements = elementIter => {
  // This fullOrder contains history dependent state. It is specific
  // to this one call and does not survive it.
  const fullCompare = makeFullOrderComparatorKit().antiComparator;
  const sorted = sortByRank(elementIter, fullCompare);
  /** @type {[K,bigint][]} */
  const entries = [];
  for (let i = 0; i < sorted.length; ) {
    const k = sorted[i];
    let j = i + 1;
    while (j < sorted.length && fullCompare(k, sorted[j]) === 0) {
      j += 1;
    }
    entries.push([k, BigInt(j - i)]);
    i = j;
  }
  return makeCopyBag(entries);
};
harden(makeCopyBagFromElements);

// //////////////////////////// CopyMap ////////////////////////////////////////

// Moved to here so they can check that the copyMap's keys contains only keys
// without creating an import cycle.

/** @type {WeakSet<CopyMap>} */
const copyMapMemo = new WeakSet();

/**
 * @param {any} m
 * @param {Rejector} reject
 * @returns {boolean}
 */
export const confirmCopyMap = (m, reject) => {
  if (copyMapMemo.has(m)) {
    return true;
  }
  if (!(passStyleOf(m) === 'tagged' && getTag(m) === 'copyMap')) {
    return reject && reject`Not a copyMap: ${m}`;
  }
  const { payload } = m;
  if (passStyleOf(payload) !== 'copyRecord') {
    return reject && reject`A copyMap's payload must be a record: ${m}`;
  }
  const { keys, values, ...rest } = payload;
  const result =
    (ownKeys(rest).length === 0 ||
      (reject &&
        reject`A copyMap's payload must only have .keys and .values: ${m}`)) &&
    confirmElements(keys, reject) &&
    confirmKey(keys, reject) &&
    (passStyleOf(values) === 'copyArray' ||
      (reject && reject`A copyMap's .values must be a copyArray: ${m}`)) &&
    (keys.length === values.length ||
      (reject &&
        reject`A copyMap must have the same number of keys and values: ${m}`));
  if (result) {
    copyMapMemo.add(m);
  }
  return result;
};
harden(confirmCopyMap);

/**
 * @param {any} m
 * @returns {m is CopyMap<Key, Passable>}
 */
export const isCopyMap = m => confirmCopyMap(m, false);
hideAndHardenFunction(isCopyMap);

/**
 * @param {Passable} m
 * @returns {asserts m is CopyMap<Key, Passable>}
 */
export const assertCopyMap = m => {
  confirmCopyMap(m, Fail);
};
hideAndHardenFunction(assertCopyMap);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @returns {K[]}
 */
export const getCopyMapKeys = m => {
  assertCopyMap(m);
  return m.payload.keys;
};
harden(getCopyMapKeys);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @returns {V[]}
 */
export const getCopyMapValues = m => {
  assertCopyMap(m);
  return m.payload.values;
};
harden(getCopyMapValues);

/**
 * Returns an array of a CopyMap's entries in storage order.
 *
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @returns {Array<[K,V]>}
 */
export const getCopyMapEntryArray = m => {
  assertCopyMap(m);
  const {
    payload: { keys, values },
  } = m;
  return harden(keys.map((key, i) => [key, values[i]]));
};
harden(getCopyMapEntryArray);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @returns {Iterable<[K,V]>}
 */
export const getCopyMapEntries = m => {
  assertCopyMap(m);
  const {
    payload: { keys, values },
  } = m;
  const { length } = /** @type {Array} */ (keys);
  return Far('CopyMap entries iterable', {
    [Symbol.iterator]: () => {
      let i = 0;
      return Far('CopyMap entries iterator', {
        next: () => {
          /** @type {IteratorResult<[K,V],void>} */
          let result;
          if (i < length) {
            result = harden({ done: false, value: [keys[i], values[i]] });
            i += 1;
            return result;
          } else {
            result = harden({ done: true, value: undefined });
          }
          return result;
        },
      });
    },
  });
};
harden(getCopyMapEntries);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @param {(key: K, index: number) => boolean} fn
 * @returns {boolean}
 */
export const everyCopyMapKey = (m, fn) =>
  getCopyMapKeys(m).every((key, index) => fn(key, index));
harden(everyCopyMapKey);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @param {(value: V, index: number) => boolean} fn
 * @returns {boolean}
 */
export const everyCopyMapValue = (m, fn) =>
  getCopyMapValues(m).every((value, index) => fn(value, index));
harden(everyCopyMapValue);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {CopyMap<K,V>} m
 * @returns {CopySet<K>}
 */
export const copyMapKeySet = m =>
  // A copyMap's keys are already in the internal form used by copySets.
  makeTagged('copySet', m.payload.keys);
harden(copyMapKeySet);

/**
 * @template {Key} K
 * @template {Passable} V
 * @param {Iterable<[K, V]>} entries
 * @returns {CopyMap<K,V>}
 */
export const makeCopyMap = entries => {
  // This is weird, but reverse rank sorting the entries is a good first step
  // for getting the rank sorted keys together with the values
  // organized by those keys. Also, among values associated with
  // keys in the same equivalence class, those are rank sorted.
  // TODO This
  // could solve the copyMap cover issue explained in patternMatchers.js.
  // But only if we include this criteria in our validation of copyMaps,
  // which we currently do not.
  const sortedEntries = sortByRank(entries, compareAntiRank);
  const keys = sortedEntries.map(([k, _v]) => k);
  const values = sortedEntries.map(([_k, v]) => v);
  const result = makeTagged('copyMap', { keys, values });
  assertCopyMap(result);
  return result;
};
harden(makeCopyMap);

// //////////////////////// Keys Recur /////////////////////////////////////////

/**
 * `confirmKeyInternal` is only called if `val` is Passable but is not an Atom.
 *
 * @param {any} val
 * @param {Rejector} reject
 * @returns {boolean}
 */
const confirmKeyInternal = (val, reject) => {
  const checkIt = child => confirmKey(child, reject);

  const passStyle = passStyleOf(val);
  switch (passStyle) {
    case 'remotable': {
      // A remotable is a ScalarKey but not an Atom, so we pick it up here.
      return true;
    }
    case 'copyRecord': {
      // A copyRecord is a key iff all its children are keys
      return Object.values(val).every(checkIt);
    }
    case 'copyArray': {
      // A copyArray is a key iff all its children are keys
      return val.every(checkIt);
    }
    case 'tagged': {
      const tag = getTag(val);
      switch (tag) {
        case 'copySet': {
          return confirmCopySet(val, reject);
        }
        case 'copyBag': {
          return confirmCopyBag(val, reject);
        }
        case 'copyMap': {
          return (
            confirmCopyMap(val, reject) &&
            // For a copyMap to be a key, all its keys and values must
            // be keys. Keys already checked by `confirmCopyMap` since
            // that's a copyMap requirement in general.
            everyCopyMapValue(val, checkIt)
          );
        }
        default: {
          return (
            reject && reject`A passable tagged ${q(tag)} is not a key: ${val}`
          );
        }
      }
    }
    case 'error':
    case 'promise': {
      return reject && reject`A ${q(passStyle)} cannot be a key`;
    }
    default: {
      // Unexpected tags are just non-keys, but an unexpected passStyle
      // is always an error.
      throw Fail`unexpected passStyle ${q(passStyle)}: ${val}`;
    }
  }
};
