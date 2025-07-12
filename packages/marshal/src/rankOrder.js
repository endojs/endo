import { getEnvironmentOption as getenv } from '@endo/env-options';
import { Fail, q } from '@endo/errors';
import { getTag, passStyleOf, nameForPassableSymbol } from '@endo/pass-style';
import {
  passStylePrefixes,
  recordNames,
  recordValues,
} from './encodePassable.js';

/**
 * @import {Passable, PassStyle} from '@endo/pass-style'
 * @import {FullCompare, PartialCompare, PartialComparison, RankCompare, RankComparison, RankCover} from './types.js'
 */

const { isNaN: NumberIsNaN } = Number;
const { entries, fromEntries, setPrototypeOf, is } = Object;

const ENDO_RANK_STRINGS = getenv('ENDO_RANK_STRINGS', 'utf16-code-unit-order', [
  'unicode-code-point-order',
  'error-if-order-choice-matters',
]);

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
 * 0. Marshal still serializes -0 as zero, so the semantics of our distributed
 * object system does not yet distinguish 0 from -0.
 *
 * `sameValueZero` is the EcmaScript spec name for this equality comparison,
 * but TODO we need a better name for the API.
 *
 * @param {any} x
 * @param {any} y
 * @returns {boolean}
 */
const sameValueZero = (x, y) => x === y || is(x, y);

/**
 * @param {any} left
 * @param {any} right
 * @returns {RankComparison}
 */
const trivialComparator = (left, right) =>
  // eslint-disable-next-line no-nested-ternary, @endo/restrict-comparison-operands
  left < right ? -1 : left === right ? 0 : 1;
harden(trivialComparator);

// Apparently eslint confused about whether the function can ever exit
// without an explicit return.
// eslint-disable-next-line jsdoc/require-returns-check
/**
 * @param {string} left
 * @param {string} right
 * @returns {RankComparison}
 */
export const compareByCodePoints = (left, right) => {
  const leftIter = left[Symbol.iterator]();
  const rightIter = right[Symbol.iterator]();
  for (;;) {
    const { value: leftChar } = leftIter.next();
    const { value: rightChar } = rightIter.next();
    if (leftChar === undefined && rightChar === undefined) {
      return 0;
    } else if (leftChar === undefined) {
      // left is a prefix of right.
      return -1;
    } else if (rightChar === undefined) {
      // right is a prefix of left.
      return 1;
    }
    const leftCodepoint = /** @type {number} */ (leftChar.codePointAt(0));
    const rightCodepoint = /** @type {number} */ (rightChar.codePointAt(0));
    if (leftCodepoint < rightCodepoint) return -1;
    if (leftCodepoint > rightCodepoint) return 1;
  }
};
harden(compareByCodePoints);

/**
 * Compare two same-type numeric values, returning results consistent with
 * `compareRank`'s "rank order" (i.e., treating both positive and negative zero
 * as equal and placing NaN as self-equal after all other numbers).
 *
 * @template {number | bigint} T
 * @param {T} left
 * @param {T} right
 * @returns {RankComparison}
 */
export const compareNumerics = (left, right) => {
  // eslint-disable-next-line @endo/restrict-comparison-operands
  if (left < right) return -1;
  // eslint-disable-next-line @endo/restrict-comparison-operands
  if (left > right) return 1;
  if (NumberIsNaN(left) === NumberIsNaN(right)) return 0;
  if (NumberIsNaN(right)) return -1;
  assert(NumberIsNaN(left));
  return 1;
};
harden(compareNumerics);

/**
 * @typedef {Record<PassStyle, { index: number, cover: RankCover }>} PassStyleRanksRecord
 */

const passStyleRanks = /** @type {PassStyleRanksRecord} */ (
  fromEntries(
    entries(passStylePrefixes)
      // Sort entries by ascending prefix, assuming that all prefixes are
      // limited to the Basic Multilingual Plane (U+0000 through U+FFFF) and
      // thus contain only code units that are equivalent to code points.
      // In practice, they are entirely printable ASCII
      // (0x20 SPACE through 0x7E TILDE).
      .sort(([_leftStyle, leftPrefixes], [_rightStyle, rightPrefixes]) => {
        return trivialComparator(leftPrefixes, rightPrefixes);
      })
      .map(([passStyle, prefixes], index) => {
        // Verify that `prefixes` is sorted, and cover all strings that start
        // with any of its characters, i.e.
        // all s such that prefixes.at(0) ≤ s < successor(prefixes.at(-1)).
        prefixes === prefixes.split('').sort().join('') ||
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
      return compareNumerics(
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
      case 'bigint': {
        // Within each of these passStyles, the rank ordering agrees with
        // JavaScript's relational operators `<` and `>`.
        return trivialComparator(left, right);
      }
      case 'string': {
        switch (ENDO_RANK_STRINGS) {
          case 'utf16-code-unit-order': {
            return trivialComparator(left, right);
          }
          case 'unicode-code-point-order': {
            return compareByCodePoints(left, right);
          }
          case 'error-if-order-choice-matters': {
            const result1 = trivialComparator(left, right);
            const result2 = compareByCodePoints(left, right);
            result1 === result2 ||
              Fail`Comparisons differed: ${left} vs ${right}, ${q(result1)} vs ${q(result2)}`;
            return result1;
          }
          default: {
            throw Fail`Unexpected ENDO_RANK_STRINGS ${q(ENDO_RANK_STRINGS)}`;
          }
        }
      }
      case 'symbol': {
        return comparator(
          nameForPassableSymbol(left),
          nameForPassableSymbol(right),
        );
      }
      case 'number': {
        return compareNumerics(left, right);
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
        // ByteArrays compare by shortlex.
        // - first, if they are of unequal length, then the shorter is less.
        // - then, among byteArrays of equal length, by lexicographic comparison
        //   of their bytes in ascending order.
        const { byteLength: leftLen } = left;
        const { byteLength: rightLen } = right;
        if (leftLen < rightLen) {
          return -1;
        }
        if (leftLen > rightLen) {
          return 1;
        }

        // Account for gaps in the @endo/immutable-arraybuffer shim.
        const leftArray =
          Object.getPrototypeOf(left) === ArrayBuffer.prototype
            ? new Uint8Array(left)
            : new Uint8Array(left.slice(0));
        const rightArray =
          Object.getPrototypeOf(right) === ArrayBuffer.prototype
            ? new Uint8Array(right)
            : new Uint8Array(right.slice(0));
        for (let i = 0; i < leftLen; i += 1) {
          const leftByte = leftArray[i];
          const rightByte = rightArray[i];
          if (leftByte < rightByte) {
            return -1;
          }
          if (leftByte > rightByte) {
            return 1;
          }
        }
        return 0;
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
harden(makeComparatorKit);

/**
 * @param {RankCompare} comparator
 * @returns {RankCompare=}
 */
export const comparatorMirrorImage = comparator =>
  comparatorMirrorImages.get(comparator);
harden(comparatorMirrorImage);

export const { comparator: compareRank, antiComparator: compareAntiRank } =
  makeComparatorKit();

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
  /** @type {T[]} mutable for in-place sorting, but with hardened elements */
  let unsorted;
  if (Array.isArray(passables)) {
    harden(passables);
    // Calling isRankSorted gives it a chance to get memoized for
    // this `compare` function even if it was already memoized for a different
    // `compare` function.
    if (isRankSorted(passables, compare)) {
      return passables;
    }
    unsorted = [...passables];
  } else {
    unsorted = Array.from(passables, harden);
  }
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
harden(intersectRankCovers);

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
