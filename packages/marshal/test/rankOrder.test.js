// @ts-nocheck
import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
// eslint-disable-next-line import/no-extraneous-dependencies
import { fc } from '@fast-check/ava';
import { makeTagged } from '@endo/pass-style';
import { makeArbitraries } from '@endo/pass-style/tools.js';

import { q } from '@endo/errors';
import {
  FullRankCover,
  compareRank,
  compareAntiRank,
  isRankSorted,
  sortByRank,
  getPassStyleCover,
  getIndexCover,
  assertRankSorted,
  compareRankRemotablesTied,
  unionRankCovers,
  intersectRankCovers,
  coveredEntries,
} from '../src/rankOrder.js';
import { unsortedSample, sortedSample } from '../tools/marshal-test-data.js';

const { arbPassable } = makeArbitraries(fc);

test('compareRank is reflexive', async t => {
  await fc.assert(
    fc.property(arbPassable, x => {
      return t.is(compareRank(x, x), 0);
    }),
  );
});

test('compareRankRemotablesTied is reflexive', async t => {
  await fc.assert(
    fc.property(arbPassable, x => {
      return t.is(compareRankRemotablesTied(x, x), 0);
    }),
  );
});

// Both `compareRank` and `compareRankRemotablesTied` are total preorders on
// passables: anti-symmetric and transitive.  They differ only in how they
// handle remotables nested within compound passables: `compareRank`
// short-circuits to 0 as soon as it encounters a remotable, while
// `compareRankRemotablesTied` treats the remotable position as a tie and
// continues to refine by the surrounding structure.  Both properties hold
// for both comparators, so we exercise each property against both.
for (const [name, compare] of /** @type {const} */ ([
  ['compareRank', compareRank],
  ['compareRankRemotablesTied', compareRankRemotablesTied],
])) {
  test(`${name} totally orders ranks`, async t => {
    await fc.assert(
      fc.property(arbPassable, arbPassable, (a, b) => {
        const ab = compare(a, b);
        const ba = compare(b, a);
        if (ab === 0) {
          return t.is(ba, 0);
        }
        return (
          t.true(Math.abs(ab) > 0) &&
          t.true(Math.abs(ba) > 0) &&
          t.is(Math.sign(ba), -Math.sign(ab))
        );
      }),
    );
  });

  test(`${name} is transitive`, async t => {
    await fc.assert(
      fc.property(
        // operate on a set of three passables covering at least two ranks
        fc
          .uniqueArray(arbPassable, { minLength: 3, maxLength: 3 })
          .filter(([a, b, c]) => compare(a, b) !== 0 || compare(a, c) !== 0),
        triple => {
          const sorted = harden(triple.sort(compare));
          assertRankSorted(sorted, compare);
          const [a, b, c] = sorted;
          const failures = [];

          const testCompare = (outcome, message, failure) => {
            t.true(outcome, message);
            if (!outcome) {
              failures.push(failure);
            }
          };

          testCompare(
            compare(a, b) <= 0,
            'a <= b',
            `Expected <= 0: ${q(a)} vs. ${q(b)}`,
          );
          testCompare(
            compare(a, c) <= 0,
            'a <= c',
            `Expected <= 0: ${q(a)} vs. ${q(c)}`,
          );
          testCompare(
            compare(b, c) <= 0,
            'b <= c',
            `Expected <= 0: ${q(b)} vs. ${q(c)}`,
          );
          testCompare(
            compare(c, b) >= 0,
            'c >= b',
            `Expected >= 0: ${q(c)} vs. ${q(b)}`,
          );
          testCompare(
            compare(c, a) >= 0,
            'c >= a',
            `Expected >= 0: ${q(c)} vs. ${q(a)}`,
          );
          testCompare(
            compare(b, a) >= 0,
            'b >= a',
            `Expected >= 0: ${q(b)} vs. ${q(a)}`,
          );

          return t.deepEqual(failures, []);
        },
      ),
    );
  });
}

test('compare and sort by rank', t => {
  assertRankSorted(sortedSample);
  t.false(isRankSorted(unsortedSample));
  const sorted = sortByRank(unsortedSample);
  t.is(
    compareRankRemotablesTied(sorted, sortedSample),
    0,
    `Not sorted as expected: ${q(sorted)}`,
  );
});

// Unused in that it is used only in a skipped test
const unusedRangeSample = harden([
  {}, // 0 -- prefix are earlier, so empty is earliest
  { bar: null }, // 1
  { bar: undefined }, // 2 -- records with same names grouped together
  { foo: 'x' }, // 3 -- name subsets before supersets
  { bar: 'y', foo: 'x' }, // 5
  { bar: 'y', foo: 'x' }, // 6
  { bar: null, foo: 'x' }, // 4
  { bar: undefined, foo: 'x' }, // 7
  { bar: 'y', foo: 'y' }, // 8 -- reverse sort so foo: tested before bar:

  makeTagged('', null), // 9

  ['a'], // 10
  ['a', 'b'], // 11
  ['a', 'x'], // 12
  ['y', 'x'], // 13
]);

/** @type {[RankCover, IndexCover][]} */
// @ts-expect-error Stale from when RankCover was a pair of extreme values
// rather than a pair of strings to be compared to passable encodings.
const brokenQueries = harden([
  [
    [['c'], ['c']],
    // first > last implies absent.
    [12, 11],
  ],
  [
    [['a'], ['a', undefined]],
    [9, 11],
  ],
  [
    [
      ['a', null],
      ['a', undefined],
    ],
    [10, 11],
  ],
  [FullRankCover, [0, 13]],
  [getPassStyleCover('string'), [0, -1]],
  [getPassStyleCover('copyRecord'), [0, 8]],
  [getPassStyleCover('copyArray'), [9, 13]], // cover includes non-array
  [getPassStyleCover('remotable'), [14, 13]],
]);

// XXX This test is skipped because of unresolved impedance mismatch between the
// older value-as-cover scheme and the newer string-encoded-key-as-cover scheme
// that we currently use. Whoever sorts that mismatch out (likely as part of
// adding composite key handling to the durable store implementation) will need
// to re-enable and (likely) update this test.
test.skip('range queries', t => {
  t.assert(isRankSorted(unusedRangeSample));
  for (const [rankCover, indexRange] of brokenQueries) {
    const range = getIndexCover(unusedRangeSample, rankCover);
    t.is(range[0], indexRange[0]);
    t.is(range[1], indexRange[1]);
  }
});

// Exercise the optional `compare` defaulting to `compareRankRemotablesTied`.
// If the parameter order regresses (e.g. back to (sorted, compare, rankCover)
// for getIndexCover, or (compare, covers) for unionRankCovers /
// intersectRankCovers), these tests fail because the trailing argument is no
// longer treated as a comparator.
test('isRankSorted defaults compare to compareRankRemotablesTied', t => {
  const sorted = harden(['a', 'b', 'c']);
  t.true(isRankSorted(sorted));
  t.true(isRankSorted(sorted, compareRankRemotablesTied));
  t.true(isRankSorted(sorted, compareRank));

  const unsorted = harden(['c', 'a', 'b']);
  t.false(isRankSorted(unsorted));
});

test('assertRankSorted defaults compare to compareRankRemotablesTied', t => {
  const sorted = harden(['a', 'b', 'c']);
  t.notThrows(() => assertRankSorted(sorted));
  t.notThrows(() => assertRankSorted(sorted, compareRankRemotablesTied));

  const unsorted = harden(['c', 'a', 'b']);
  t.throws(() => assertRankSorted(unsorted), {
    message: /Must be rank sorted/,
  });
});

test('sortByRank defaults compare to compareRankRemotablesTied', t => {
  const unsorted = harden(['c', 'a', 'b']);
  t.deepEqual(sortByRank(unsorted), ['a', 'b', 'c']);
  t.deepEqual(sortByRank(unsorted, compareRankRemotablesTied), ['a', 'b', 'c']);
  t.deepEqual(sortByRank(unsorted, compareAntiRank), ['c', 'b', 'a']);
});

test('getIndexCover (sorted, rankCover, compare?) signature', t => {
  // sorted strings
  const sorted = harden(['a', 'b', 'c', 'd', 'e']);

  // Default compare
  t.deepEqual(getIndexCover(sorted, ['b', 'd']), [1, 3]);
  t.deepEqual(getIndexCover(sorted, ['', '{']), [0, 4]);

  // Explicit compare
  t.deepEqual(
    getIndexCover(sorted, ['b', 'd'], compareRankRemotablesTied),
    [1, 3],
  );
  t.deepEqual(getIndexCover(sorted, ['b', 'd'], compareRank), [1, 3]);
});

test('unionRankCovers (covers, compare?) signature', t => {
  /** @type {[string, string][]} */
  const covers = harden([
    ['b', 'd'],
    ['c', 'e'],
    ['a', 'b'],
  ]);
  // Default compare
  t.deepEqual(unionRankCovers(covers), ['a', 'e']);
  // Explicit compare
  t.deepEqual(unionRankCovers(covers, compareRankRemotablesTied), ['a', 'e']);
  t.deepEqual(unionRankCovers(covers, compareRank), ['a', 'e']);
  // Empty union returns identity element ['{', '']
  t.deepEqual(unionRankCovers(harden([])), ['{', '']);
});

test('intersectRankCovers (covers, compare?) signature', t => {
  /** @type {[string, string][]} */
  const covers = harden([
    ['a', 'e'],
    ['b', 'd'],
    ['c', 'f'],
  ]);
  // Default compare
  t.deepEqual(intersectRankCovers(covers), ['c', 'd']);
  // Explicit compare
  t.deepEqual(intersectRankCovers(covers, compareRankRemotablesTied), [
    'c',
    'd',
  ]);
  t.deepEqual(intersectRankCovers(covers, compareRank), ['c', 'd']);
  // Empty intersection returns identity element ['', '{']
  t.deepEqual(intersectRankCovers(harden([])), ['', '{']);
});

test('coveredEntries iterates entries within index bounds', t => {
  const sorted = harden(sortByRank([3, 1, 'a', 'z', 2, 'b'], compareRank));
  // Use explicit index bounds to test the iterator.
  const entries = coveredEntries(sorted, [0, 2]);
  const result = [];
  for (const [i, value] of entries) {
    result.push({ i, value });
  }
  t.is(result.length, 3);
  // coveredEntries yields [i+1, element] per iteration.
  t.is(result[0].value, sorted[0]);
  t.is(result[1].value, sorted[1]);
  t.is(result[2].value, sorted[2]);
});

test('coveredEntries empty range', t => {
  const sorted = harden([1, 2, 3]);
  // leftIndex > rightIndex → empty iteration
  const entries = coveredEntries(sorted, [5, 2]);
  const result = [];
  for (const entry of entries) {
    result.push(entry);
  }
  t.is(result.length, 0);
});
