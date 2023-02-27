import {
  assertRankSorted,
  compareAntiRank,
  makeFullOrderComparatorKit,
  sortByRank,
} from '@endo/marshal';
import { assertNoDuplicateKeys, makeBagOfEntries } from './copyBag.js';

const { quote: q, Fail } = assert;

// Based on merge-set-operators.js, but altered for the bag representation.
// TODO share more code with merge-set-operators.js, rather than
// duplicating with changes.

/**
 * Asserts that `bagEntries` is already rank sorted by `rankCompare`, where
 * there
 * may be contiguous regions of bagEntries whose keys are tied for the same
 * rank.
 * Returns an iterable that will enumerate all the bagEntries in order
 * according to `fullOrder`, which should differ from `rankOrder` only
 * by being more precise.
 *
 * This should be equivalent to resorting the entire `bagEntries` array
 * according
 * to `fullOrder`. However, it optimizes for the case where these contiguous
 * runs that need to be resorted are either absent or small.
 *
 * @template T
 * @param {[T,bigint][]} bagEntries
 * @param {RankCompare} rankCompare
 * @param {FullCompare} fullCompare
 * @returns {Iterable<[T,bigint]>}
 */
const bagWindowResort = (bagEntries, rankCompare, fullCompare) => {
  assertRankSorted(bagEntries, rankCompare);
  const { length } = bagEntries;
  let i = 0;
  let optInnerIterator;
  return harden({
    [Symbol.iterator]: () =>
      harden({
        next: () => {
          if (optInnerIterator) {
            const result = optInnerIterator.next();
            if (result.done) {
              optInnerIterator = undefined;
              // fall through
            } else {
              return result;
            }
          }
          if (i < length) {
            const entry = bagEntries[i];
            let j = i + 1;
            while (
              j < length &&
              rankCompare(entry[0], bagEntries[j][0]) === 0
            ) {
              j += 1;
            }
            if (j === i + 1) {
              i = j;
              return harden({ done: false, value: entry });
            }
            const similarRun = bagEntries.slice(i, j);
            i = j;
            const resorted = sortByRank(similarRun, fullCompare);
            // Providing the same `fullCompare` should cause a memo hit
            // within `assertNoDuplicates` enabling it to avoid a
            // redundant resorting.
            assertNoDuplicateKeys(resorted, fullCompare);
            // This is the raw JS array iterator whose `.next()` method
            // does not harden the IteratorResult, in violation of our
            // conventions. Fixing this is expensive and I'm confident the
            // unfrozen value does not escape this file, so I'm leaving this
            // as is.
            optInnerIterator = resorted[Symbol.iterator]();
            return optInnerIterator.next();
          } else {
            return harden({ done: true, value: [null, 0n] });
          }
        },
      }),
  });
};

/**
 * Returns an iterable whose iteration results are [key, xCount, yCount] tuples
 * representing the next key in the local full order, as well as how many
 * times it occurred in the x input iterator and the y input iterator.
 *
 * For sets, these counts are always 0 or 1, but this representation
 * generalizes nicely for bags.
 *
 * @template T
 * @param {[T,bigint][]} xbagEntries
 * @param {[T,bigint][]} ybagEntries
 * @returns {Iterable<[T,bigint,bigint]>}
 */
const merge = (xbagEntries, ybagEntries) => {
  // This fullOrder contains history dependent state. It is specific
  // to this one `merge` call and does not survive it.
  const fullCompare = makeFullOrderComparatorKit().antiComparator;

  const xs = bagWindowResort(xbagEntries, compareAntiRank, fullCompare);
  const ys = bagWindowResort(ybagEntries, compareAntiRank, fullCompare);
  return harden({
    [Symbol.iterator]: () => {
      // These six `let` variables are buffering one ahead from the underlying
      // iterators. Each iteration reports one or the other or both, and
      // then refills the buffers of those it advanced.
      /** @type {T} */
      let x;
      let xc;
      let xDone;
      /** @type {T} */
      let y;
      let yc;
      let yDone;

      const xi = xs[Symbol.iterator]();
      const nextX = () => {
        !xDone || Fail`Internal: nextX should not be called once done`;
        ({
          done: xDone,
          value: [x, xc],
        } = xi.next());
      };
      nextX();

      const yi = ys[Symbol.iterator]();
      const nextY = () => {
        !yDone || Fail`Internal: nextY should not be called once done`;
        ({
          done: yDone,
          value: [y, yc],
        } = yi.next());
      };
      nextY();

      return harden({
        next: () => {
          /** @type {boolean} */
          let done = false;
          /** @type {[T,bigint,bigint]} */
          let value;
          if (xDone && yDone) {
            done = true;
            // @ts-expect-error Because the terminating value does not matter
            value = [null, 0n, 0n];
          } else if (xDone) {
            // only ys are left
            value = [y, 0n, yc];
            nextY();
          } else if (yDone) {
            // only xs are left
            value = [x, xc, 0n];
            nextX();
          } else {
            const comp = fullCompare(x, y);
            if (comp === 0) {
              // x and y are equivalent, so report both
              value = [x, xc, yc];
              nextX();
              nextY();
            } else if (comp < 0) {
              // x is earlier, so report it
              value = [x, xc, 0n];
              nextX();
            } else {
              // y is earlier, so report it
              comp > 0 || Fail`Internal: Unexpected comp ${q(comp)}`;
              value = [y, 0n, yc];
              nextY();
            }
          }
          return harden({ done, value });
        },
      });
    },
  });
};
harden(merge);

// We should be able to use this for iterIsSuperset as well.
// The generalization is free.
/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {boolean}
 */
const bagIterIsSuperbag = xyi => {
  for (const [_m, xc, yc] of xyi) {
    if (xc < yc) {
      // something in y is not in x, so x is not a superbag of y
      return false;
    }
  }
  return true;
};

// We should be able to use this for iterIsDisjoint as well.
// The code is identical.
/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {boolean}
 */
const bagIterIsDisjoint = xyi => {
  for (const [_m, xc, yc] of xyi) {
    if (xc >= 1n && yc >= 1n) {
      // Something in both, so not disjoint
      return false;
    }
  }
  return true;
};

// We should be able to use this for iterCompare as well.
// The generalization is free.
/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {KeyComparison}
 */
const bagIterCompare = xyi => {
  let loneY = false;
  let loneX = false;
  for (const [_m, xc, yc] of xyi) {
    if (xc < yc) {
      // something in y is not in x, so x is not a superbag of y
      loneY = true;
    }
    if (xc > yc) {
      // something in x is not in y, so y is not a superbag of x
      loneX = true;
    }
    if (loneX && loneY) {
      return NaN;
    }
  }
  if (loneX) {
    return 1;
  } else if (loneY) {
    return -1;
  } else {
    (!loneX && !loneY) ||
      Fail`Internal: Unexpected lone pair ${q([loneX, loneY])}`;
    return 0;
  }
};

/**
 * @template T
 * @param {[T,bigint,bigint][]} xyi
 * @returns {[T,bigint][]}
 */
const bagIterUnion = xyi => {
  /** @type {[T,bigint][]} */
  const result = [];
  for (const [m, xc, yc] of xyi) {
    result.push([m, xc + yc]);
  }
  return result;
};

/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {[T,bigint][]}
 */
const bagIterIntersection = xyi => {
  /** @type {[T,bigint][]} */
  const result = [];
  for (const [m, xc, yc] of xyi) {
    const mc = xc <= yc ? xc : yc;
    result.push([m, mc]);
  }
  return result;
};

/**
 * @template T
 * @param {Iterable<[T,bigint,bigint]>} xyi
 * @returns {[T,bigint][]}
 */
const bagIterDisjointSubtract = xyi => {
  /** @type {[T,bigint][]} */
  const result = [];
  for (const [m, xc, yc] of xyi) {
    const mc = xc - yc;
    mc >= 0n || Fail`right element ${m} was not in left`;
    if (mc >= 1n) {
      // the x was not in y
      result.push([m, mc]);
    }
  }
  return result;
};

const mergeify = bagIterOp => (xbagEntries, ybagEntries) =>
  bagIterOp(merge(xbagEntries, ybagEntries));

const bagEntriesIsSuperbag = mergeify(bagIterIsSuperbag);
const bagEntriesIsDisjoint = mergeify(bagIterIsDisjoint);
const bagEntriesCompare = mergeify(bagIterCompare);
const bagEntriesUnion = mergeify(bagIterUnion);
const bagEntriesIntersection = mergeify(bagIterIntersection);
const bagEntriesDisjointSubtract = mergeify(bagIterDisjointSubtract);

const rawBagify = bagEntriesOp => (xbag, ybag) =>
  bagEntriesOp(xbag.payload, ybag.payload);

const bagify = bagEntriesOp => (xbag, ybag) =>
  makeBagOfEntries(bagEntriesOp(xbag.payload, ybag.payload));

export const bagIsSuperbag = rawBagify(bagEntriesIsSuperbag);
export const bagIsDisjoint = rawBagify(bagEntriesIsDisjoint);
export const bagCompare = rawBagify(bagEntriesCompare);
export const bagUnion = bagify(bagEntriesUnion);
export const bagIntersection = bagify(bagEntriesIntersection);
export const bagDisjointSubtract = bagify(bagEntriesDisjointSubtract);
