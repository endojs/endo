// @ts-check
import { getTag } from './helpers/passStyle-helpers.js';
import { passStyleOf } from './passStyleOf.js';
import { nameForPassableSymbol } from './helpers/symbol.js';
import { passStylePrefixes, recordParts } from './encodePassable.js';

/** @typedef {import('./types.js').Passable} Passable */
/** @typedef {import('./types.js').PassStyle} PassStyle */
/** @typedef {import('./types.js').RankCover} RankCover */

const { details: X, quote: q } = assert;
const { entries, fromEntries, setPrototypeOf, is } = Object;

/**
 * @typedef {-1 | 0 | 1} RankComparison
 * The result of a `RankCompare` function that defines a rank-order, i.e.,
 * a total preorder in which different elements are always comparable but
 * can be tied for the same rank. See `RankCompare`.
 */

/**
 * @callback RankCompare
 * Returns `-1`, `0`, or `1` depending on whether the rank of `left`
 * is respectively before, tied-with, or after the rank of `right`.
 *
 * This comparison function is valid as argument to
 * `Array.prototype.sort`. This is sometimes described as a "total order"
 * but, depending on your definitions, this is technically incorrect because
 * it may return `0` to indicate that two distinguishable elements such as
 * `-0` and `0` are tied (i.e., are in the same equivalence class
 * for the purposes of this ordering). If each such equivalence class is
 * a *rank* and ranks are disjoint, then this "rank order" is a
 * true total order over these ranks. In mathematics this goes by several
 * other names such as "total preorder".
 *
 * This function establishes a total rank order over all passables.
 * To do so it makes arbitrary choices, such as that all strings
 * are after all numbers. Thus, this order is not intended to be
 * used directly as a comparison with useful semantics. However, it must be
 * closely enough related to such comparisons to aid in implementing
 * lookups based on those comparisons. For example, in order to get a total
 * order among ranks, we put `NaN` after all other JavaScript "number" values
 * (i.e., IEEE 754 floating-point values). But otherwise, we rank JavaScript
 * numbers by signed magnitude, with `0` and `-0` tied. A semantically useful
 * ordering would also compare magnitudes, and so agree with the rank ordering
 * of all values other than `NaN`. An array sorted by rank would enable range
 * queries by magnitude.
 * @param {Passable} left
 * @param {Passable} right
 * @returns {RankComparison}
 */

/**
 * @typedef {object} RankComparatorKit
 * @property {RankCompare} comparator
 * @property {RankCompare} antiComparator
 */

/**
 * @typedef {RankCompare} FullCompare
 * A `FullCompare` function satisfies all the invariants stated below for
 * `RankCompare`'s relation with KeyCompare.
 * In addition, its equality is as precise as the `KeyCompare`
 * comparison defined below, in that, for all Keys `x` and `y`,
 * `FullCompare(x, y) === 0` iff `KeyCompare(x, y) === 0`.
 *
 * For non-keys a `FullCompare` should be exactly as imprecise as
 * `RankCompare`. For example, both will treat all errors as in the same
 * equivalence class. Both will treat all promises as in the same
 * equivalence class. Both will order taggeds the same way, which is admittedly
 * weird, as some taggeds will be considered keys and other taggeds will be
 * considered non-keys.
 */

/**
 * @typedef {object} FullComparatorKit
 * @property {FullCompare} comparator
 * @property {FullCompare} antiComparator
 */

/**
 * @typedef {[number, number]} IndexCover
 */

/**
 * This is the equality comparison used by JavaScript's Map and Set
 * abstractions, where NaN is the same as NaN and -0 is the same as
 * 0. Marshal serializes -0 as zero, so the semantics of our distributed
 * object system does not distinguish 0 from -0.
 *
 * `sameValueZero` is the EcmaScript spec name for this equality comparison,
 * but TODO we need a better name for the API.
 *
 * @param {any} x
 * @param {any} y
 * @returns {boolean}
 */
const sameValueZero = (x, y) => x === y || is(x, y);

const trivialComparator = (left, right) =>
  // eslint-disable-next-line no-nested-ternary
  left < right ? -1 : left === right ? 0 : 1;

/**
 * @typedef {Record<PassStyle, { index: number, cover: RankCover }>} PassStyleRanksRecord
 */

const passStyleRanks = /** @type {PassStyleRanksRecord} */ (fromEntries(
  entries(passStylePrefixes)
    // Sort entries by ascending prefix.
    .sort(([_leftStyle, leftPrefixes], [_rightStyle, rightPrefixes]) => {
      return trivialComparator(leftPrefixes, rightPrefixes);
    })
    .map(([passStyle, prefixes], index) => {
      // Cover all strings that start with any character in `prefixes`.
      // `prefixes` is already sorted, so that's
      // all s such that prefixes.at(0) ≤ s < successor(prefixes.at(-1)).
      const cover = [
        prefixes.charAt(0),
        String.fromCharCode(prefixes.charCodeAt(prefixes.length - 1) + 1),
      ];
      return [passStyle, { index, cover }];
    }),
));
setPrototypeOf(passStyleRanks, null);
harden(passStyleRanks);

/**
 * Associate with each passStyle a RankCover that may be an overestimate,
 * and whose results therefore need to be filtered down. For example, because
 * there is not a smallest or biggest bigint, bound it by `NaN` (the last place
 * number) and `''` (the empty string, which is the first place string). Thus,
 * a range query using this range may include these values, which would then
 * need to be filtered out.
 *
 * @param {PassStyle} passStyle
 * @returns {RankCover}
 */
export const getPassStyleCover = passStyle => passStyleRanks[passStyle].cover;
harden(getPassStyleCover);

/**
 * @type {WeakMap<RankCompare,WeakSet<Passable[]>>}
 */
const memoOfSorted = new WeakMap();

/**
 * @type {WeakMap<RankCompare,RankCompare>}
 */
const comparatorMirrorImages = new WeakMap();

/**
 * @param {RankCompare=} compareRemotables
 * An option to create a comparator in which an internal order is
 * assigned to remotables. This defaults to a comparator that
 * always returns `0`, meaning that all remotables are tied
 * for the same rank.
 * @returns {RankComparatorKit}
 */
export const makeComparatorKit = (compareRemotables = (_x, _y) => 0) => {
  /** @type {RankCompare} */
  const comparator = (left, right) => {
    if (sameValueZero(left, right)) {
      return 0;
    }
    const leftStyle = passStyleOf(left);
    const rightStyle = passStyleOf(right);
    if (leftStyle !== rightStyle) {
      return trivialComparator(
        passStyleRanks[leftStyle].index,
        passStyleRanks[rightStyle].index,
      );
    }
    switch (leftStyle) {
      case 'remotable': {
        return compareRemotables(left, right);
      }
      case 'undefined':
      case 'null':
      case 'error':
      case 'promise': {
        // For each of these passStyles, all members of that passStyle are tied
        // for the same rank.
        return 0;
      }
      case 'boolean':
      case 'bigint':
      case 'string': {
        // Within each of these passStyles, the rank ordering agrees with
        // JavaScript's relational operators `<` and `>`.
        if (left < right) {
          return -1;
        } else {
          assert(left > right);
          return 1;
        }
      }
      case 'symbol': {
        return comparator(
          nameForPassableSymbol(left),
          nameForPassableSymbol(right),
        );
      }
      case 'number': {
        // `NaN`'s rank is after all other numbers.
        if (Number.isNaN(left)) {
          assert(!Number.isNaN(right));
          return 1;
        } else if (Number.isNaN(right)) {
          return -1;
        }
        // The rank ordering of non-NaN numbers agrees with JavaScript's
        // relational operators '<' and '>'.
        if (left < right) {
          return -1;
        } else {
          assert(left > right);
          return 1;
        }
      }
      case 'copyRecord': {
        // Lexicographic by inverse sorted order of property names, then
        // lexicographic by corresponding values in that same inverse
        // order of their property names. Comparing names by themselves first,
        // all records with the exact same set of property names sort next to
        // each other in a rank-sort of copyRecords.

        // The copyRecord invariants enforced by passStyleOf ensure that
        // all the property names are strings. We need the reverse sorted order
        // of these names, which we then compare lexicographically. This ensures
        // that if the names of record X are a subset of the names of record Y,
        // then record X will have an earlier rank and sort to the left of Y.
        const [leftNames, leftValues] = recordParts(left);
        const [rightNames, rightValues] = recordParts(right);

        const result = comparator(leftNames, rightNames);
        if (result !== 0) {
          return result;
        }
        return comparator(leftValues, rightValues);
      }
      case 'copyArray': {
        // Lexicographic
        const len = Math.min(left.length, right.length);
        for (let i = 0; i < len; i += 1) {
          const result = comparator(left[i], right[i]);
          if (result !== 0) {
            return result;
          }
        }
        // If all matching elements were tied, then according to their lengths.
        // If array X is a prefix of array Y, then X has an earlier rank than Y.
        return comparator(left.length, right.length);
      }
      case 'tagged': {
        // Lexicographic by `[Symbol.toStringTag]` then `.payload`.
        const labelComp = comparator(getTag(left), getTag(right));
        if (labelComp !== 0) {
          return labelComp;
        }
        return comparator(left.payload, right.payload);
      }
      default: {
        assert.fail(X`Unrecognized passStyle: ${q(leftStyle)}`);
      }
    }
  };

  /** @type {RankCompare} */
  const antiComparator = (x, y) => comparator(y, x);

  memoOfSorted.set(comparator, new WeakSet());
  memoOfSorted.set(antiComparator, new WeakSet());
  comparatorMirrorImages.set(comparator, antiComparator);
  comparatorMirrorImages.set(antiComparator, comparator);

  return harden({ comparator, antiComparator });
};
/**
 * @param {RankCompare} comparator
 * @returns {RankCompare=}
 */
export const comparatorMirrorImage = comparator =>
  comparatorMirrorImages.get(comparator);

/**
 * @param {Passable[]} passables
 * @param {RankCompare} compare
 * @returns {boolean}
 */
export const isRankSorted = (passables, compare) => {
  const subMemoOfSorted = memoOfSorted.get(compare);
  assert(subMemoOfSorted !== undefined);
  if (subMemoOfSorted.has(passables)) {
    return true;
  }
  assert(passStyleOf(passables) === 'copyArray');
  for (let i = 1; i < passables.length; i += 1) {
    if (compare(passables[i - 1], passables[i]) >= 1) {
      return false;
    }
  }
  subMemoOfSorted.add(passables);
  return true;
};
harden(isRankSorted);

/**
 * @param {Passable[]} sorted
 * @param {RankCompare} compare
 */
export const assertRankSorted = (sorted, compare) =>
  isRankSorted(sorted, compare) ||
  assert.fail(
    // TODO assert on bug could lead to infinite recursion. Fix.
    // eslint-disable-next-line no-use-before-define
    X`Must be rank sorted: ${sorted} vs ${sortByRank(sorted, compare)}`,
  );
harden(assertRankSorted);

/**
 * TODO SECURITY BUG: https://github.com/Agoric/agoric-sdk/issues/4260
 * sortByRank currently uses `Array.prototype.sort` directly, and
 * so only works correctly when given a `compare` function that considers
 * `undefined` strictly bigger (`>`) than everything else. This is
 * because `Array.prototype.sort` bizarrely moves all `undefined`s to
 * the end of the array regardless, without consulting the `compare`
 * function. This is a genuine bug for us NOW because sometimes we sort
 * in reverse order by passing a reversed rank comparison function.
 *
 * @param {Iterable<Passable>} passables
 * @param {RankCompare} compare
 * @returns {Passable[]}
 */
export const sortByRank = (passables, compare) => {
  if (Array.isArray(passables)) {
    harden(passables);
    // Calling isRankSorted gives it a chance to get memoized for
    // this `compare` function even if it was already memoized for a different
    // `compare` function.
    if (isRankSorted(passables, compare)) {
      return passables;
    }
  }
  const unsorted = [...passables];
  unsorted.forEach(harden);
  const sorted = harden(unsorted.sort(compare));
  const subMemoOfSorted = memoOfSorted.get(compare);
  assert(subMemoOfSorted !== undefined);
  subMemoOfSorted.add(sorted);
  return sorted;
};
harden(sortByRank);

/**
 * See
 * https://en.wikipedia.org/wiki/Binary_search_algorithm#Procedure_for_finding_the_leftmost_element
 *
 * @param {Passable[]} sorted
 * @param {RankCompare} compare
 * @param {Passable} key
 * @param {("leftMost" | "rightMost")=} bias
 * @returns {number}
 */
const rankSearch = (sorted, compare, key, bias = 'leftMost') => {
  assertRankSorted(sorted, compare);
  let left = 0;
  let right = sorted.length;
  while (left < right) {
    const m = Math.floor((left + right) / 2);
    const comp = compare(sorted[m], key);
    if (comp <= -1 || (comp === 0 && bias === 'rightMost')) {
      left = m + 1;
    } else {
      assert(comp >= 1 || (comp === 0 && bias === 'leftMost'));
      right = m;
    }
  }
  return bias === 'leftMost' ? left : right - 1;
};

/**
 * @param {Passable[]} sorted
 * @param {RankCompare} compare
 * @param {RankCover} rankCover
 * @returns {IndexCover}
 */
export const getIndexCover = (sorted, compare, [leftKey, rightKey]) => {
  assertRankSorted(sorted, compare);
  const leftIndex = rankSearch(sorted, compare, leftKey, 'leftMost');
  const rightIndex = rankSearch(sorted, compare, rightKey, 'rightMost');
  return [leftIndex, rightIndex];
};
harden(getIndexCover);

/** @type {RankCover} */
export const FullRankCover = harden(['', '{']);

/**
 * @param {Passable[]} sorted
 * @param {IndexCover} indexCover
 * @returns {Iterable<[number, Passable]>}
 */
export const coveredEntries = (sorted, [leftIndex, rightIndex]) => {
  /** @type {Iterable<[number, Passable]>} */
  const iterable = harden({
    [Symbol.iterator]: () => {
      let i = leftIndex;
      return harden({
        next: () => {
          if (i <= rightIndex) {
            const element = sorted[i];
            i += 1;
            return harden({ value: [i, element], done: false });
          } else {
            return harden({ value: undefined, done: true });
          }
        },
      });
    },
  });
  return iterable;
};
harden(coveredEntries);

/**
 * @param {RankCompare} compare
 * @param {Passable} a
 * @param {Passable} b
 * @returns {Passable}
 */
const maxRank = (compare, a, b) => (compare(a, b) >= 0 ? a : b);

/**
 * @param {RankCompare} compare
 * @param {Passable} a
 * @param {Passable} b
 * @returns {Passable}
 */
const minRank = (compare, a, b) => (compare(a, b) <= 0 ? a : b);

/**
 * @param {RankCompare} compare
 * @param {RankCover[]} covers
 * @returns {RankCover}
 */
export const unionRankCovers = (compare, covers) => {
  /**
   * @param {RankCover} a
   * @param {RankCover} b
   * @returns {RankCover}
   */
  const unionRankCoverPair = ([leftA, rightA], [leftB, rightB]) => [
    minRank(compare, leftA, leftB),
    maxRank(compare, rightA, rightB),
  ];
  return covers.reduce(unionRankCoverPair, ['{', '']);
};
harden(unionRankCovers);

/**
 * @param {RankCompare} compare
 * @param {RankCover[]} covers
 * @returns {RankCover}
 */
export const intersectRankCovers = (compare, covers) => {
  /**
   * @param {RankCover} a
   * @param {RankCover} b
   * @returns {RankCover}
   */
  const intersectRankCoverPair = ([leftA, rightA], [leftB, rightB]) => [
    maxRank(compare, leftA, leftB),
    minRank(compare, rightA, rightB),
  ];
  return covers.reduce(intersectRankCoverPair, ['', '{']);
};

export const {
  comparator: compareRank,
  antiComparator: compareAntiRank,
} = makeComparatorKit();

/**
 * Create a comparator kit in which remotables are fully ordered
 * by the order in which they are first seen by *this* comparator kit.
 * BEWARE: This is observable mutable state, so such a comparator kit
 * should never be shared among subsystems that should not be able
 * to communicate.
 *
 * Note that this order does not meet the requirements for store
 * ordering, since it has no memory of deleted keys.
 *
 * These full order comparator kit is strictly more precise that the
 * rank order comparator kits above. As a result, any array which is
 * sorted by such a full order will pass the isRankSorted test with
 * a corresponding rank order.
 *
 * An array which is sorted by a *fresh* full order comparator, i.e.,
 * one that has not yet seen any remotables, will of course remain
 * sorted by according to *that* full order comparator. An array *of
 * scalars* sorted by a fresh full order will remain sorted even
 * according to a new fresh full order comparator, since it will see
 * the remotables in the same order again. Unfortunately, this is
 * not true of arrays of passables in general.
 *
 * @param {boolean=} longLived
 * @returns {FullComparatorKit}
 */
export const makeFullOrderComparatorKit = (longLived = false) => {
  let numSeen = 0;
  // When dynamically created with short lifetimes (the default) a WeakMap
  // would perform poorly, and the leak created by a Map only lasts as long
  // as the Map.
  const MapConstructor = longLived ? WeakMap : Map;
  const seen = new MapConstructor();
  const tag = r => {
    if (seen.has(r)) {
      return seen.get(r);
    }
    numSeen += 1;
    seen.set(r, numSeen);
    return numSeen;
  };
  const compareRemotables = (x, y) => compareRank(tag(x), tag(y));
  return makeComparatorKit(compareRemotables);
};
harden(makeFullOrderComparatorKit);
