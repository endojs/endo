import { getTag, passStyleOf, nameForPassableSymbol } from '@endo/pass-style';
import { Fail, q } from '@endo/errors';
import {
  passStylePrefixes,
  recordNames,
  recordValues,
} from './encodePassable.js';

/**
 * @import {Passable, PassStyle} from '@endo/pass-style'
 * @import {FullCompare, PartialCompare, PartialComparison, RankCompare, RankCover} from './types.js'
 */

const { entries, fromEntries, setPrototypeOf, is } = Object;

/**
 * @typedef {object} RankComparatorKit
 * @property {RankCompare} comparator
 * @property {RankCompare} antiComparator
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

export const trivialComparator = (left, right) =>
  // eslint-disable-next-line no-nested-ternary, @endo/restrict-comparison-operands
  left < right ? -1 : left === right ? 0 : 1;

/**
 * @typedef {Record<PassStyle, { index: number, cover: RankCover }>} PassStyleRanksRecord
 */

const passStyleRanks = /** @type {PassStyleRanksRecord} */ (
  fromEntries(
    entries(passStylePrefixes)
      // TODO Until byteArray prefix is chosen
      .filter(([_style, prefixes]) => prefixes.length >= 1)
      // Sort entries by ascending prefix.
      .sort(([_leftStyle, leftPrefixes], [_rightStyle, rightPrefixes]) => {
        return trivialComparator(leftPrefixes, rightPrefixes);
      })
      .map(([passStyle, prefixes], index) => {
        // Cover all strings that start with any character in `prefixes`,
        // verifying that it is sorted so that is
        // all s such that prefixes.at(0) ≤ s < successor(prefixes.at(-1)).
        prefixes === [...prefixes].sort().join('') ||
          Fail`unsorted prefixes for passStyle ${q(passStyle)}: ${q(prefixes)}`;
        const cover = [
          prefixes.charAt(0),
          String.fromCharCode(prefixes.charCodeAt(prefixes.length - 1) + 1),
        ];
        return [passStyle, { index, cover }];
      }),
  )
);
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
 * @param {PartialCompare} [compareRemotables]
 * A comparator for assigning an internal order to remotables.
 * It defaults to a function that always returns `NaN`, meaning that all
 * remotables are incomparable and should tie for the same rank by
 * short-circuiting without further refinement (e.g., not only are `r1` and `r2`
 * tied, but so are `[r1, 0]` and `[r2, "x"]`).
 * @returns {RankComparatorKit}
 */
export const makeComparatorKit = (compareRemotables = (_x, _y) => NaN) => {
  /** @type {PartialCompare} */
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
    /* eslint-disable @endo/restrict-comparison-operands --
     * We know `left` and `right` are comparable.
     */
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
        const leftNames = recordNames(left);
        const rightNames = recordNames(right);

        const result = comparator(leftNames, rightNames);
        if (result !== 0) {
          return result;
        }
        const leftValues = recordValues(left, leftNames);
        const rightValues = recordValues(right, rightNames);
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
      case 'byteArray': {
        const leftArray = new Uint8Array(left.slice(0));
        const rightArray = new Uint8Array(right.slice(0));
        const byteLen = Math.min(left.byteLength, right.byteLength);
        for (let i = 0; i < byteLen; i += 1) {
          const leftByte = leftArray[i];
          const rightByte = rightArray[i];
          if (leftByte < rightByte) {
            return -1;
          }
          if (leftByte > rightByte) {
            return 1;
          }
        }
        // If all corresponding bytes are the same,
        // then according to their lengths.
        // Thus, if the data of ByteArray X is a prefix of
        // the data of ByteArray Y, then X is smaller than Y.
        return comparator(left.byteLength, right.byteLength);
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
        throw Fail`Unrecognized passStyle: ${q(leftStyle)}`;
      }
    }
    /* eslint-enable */
  };

  /** @type {RankCompare} */
  const outerComparator = (x, y) =>
    // When the inner comparator returns NaN to indicate incomparability,
    // replace that with 0 to indicate a tie.
    /** @type {Exclude<PartialComparison, NaN>} */ (comparator(x, y) || 0);

  /** @type {RankCompare} */
  const antiComparator = (x, y) => outerComparator(y, x);

  memoOfSorted.set(outerComparator, new WeakSet());
  memoOfSorted.set(antiComparator, new WeakSet());
  comparatorMirrorImages.set(outerComparator, antiComparator);
  comparatorMirrorImages.set(antiComparator, outerComparator);

  return harden({ comparator: outerComparator, antiComparator });
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
  // TODO assert on bug could lead to infinite recursion. Fix.
  // eslint-disable-next-line no-use-before-define
  Fail`Must be rank sorted: ${sorted} vs ${sortByRank(sorted, compare)}`;
harden(assertRankSorted);

/**
 * @template {Passable} T
 * @param {Iterable<T>} passables
 * @param {RankCompare} compare
 * @returns {T[]}
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
  const sorted = unsorted.sort(compare);
  // For reverse comparison, move `undefined` values from the end to the start.
  // Note that passStylePrefixes (@see {@link ./encodePassable.js}) MUST NOT
  // sort any category after `undefined`.
  if (compare(true, undefined) > 0) {
    let i = sorted.length - 1;
    while (i >= 0 && sorted[i] === undefined) i -= 1;
    const n = sorted.length - i - 1;
    if (n > 0 && n < sorted.length) {
      sorted.copyWithin(n, 0);
      sorted.fill(/** @type {T} */ (undefined), 0, n);
    }
  }
  harden(sorted);
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
 * @template {Passable} T
 * @param {RankCompare} compare
 * @param {T} a
 * @param {T} b
 * @returns {T}
 */
const maxRank = (compare, a, b) => (compare(a, b) >= 0 ? a : b);

/**
 * @template {Passable} T
 * @param {RankCompare} compare
 * @param {T} a
 * @param {T} b
 * @returns {T}
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

export const { comparator: compareRank, antiComparator: compareAntiRank } =
  makeComparatorKit();

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
