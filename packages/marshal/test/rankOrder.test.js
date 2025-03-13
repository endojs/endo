// @ts-nocheck
import test from '@endo/ses-ava/prepare-endo.js';

// eslint-disable-next-line import/no-extraneous-dependencies
import { fc } from '@fast-check/ava';
import { makeTagged } from '@endo/pass-style';
import { makeArbitraries } from '@endo/pass-style/tools.js';

import { q } from '@endo/errors';
import {
  FullRankCover,
  compareRank,
  isRankSorted,
  sortByRank,
  getPassStyleCover,
  getIndexCover,
  assertRankSorted,
} from '../src/rankOrder.js';
import { unsortedSample, sortedSample } from './_marshal-test-data.js';

const { arbPassable } = makeArbitraries(fc);

test('compareRank is reflexive', async t => {
  await fc.assert(
    fc.property(arbPassable, x => {
      return t.is(compareRank(x, x), 0);
    }),
  );
});

test('compareRank totally orders ranks', async t => {
  await fc.assert(
    fc.property(arbPassable, arbPassable, (a, b) => {
      const ab = compareRank(a, b);
      const ba = compareRank(b, a);
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

test('compareRank is transitive', async t => {
  await fc.assert(
    fc.property(
      // operate on a set of three passables covering at least two ranks
      fc
        .uniqueArray(arbPassable, { minLength: 3, maxLength: 3 })
        .filter(
          ([a, b, c]) => compareRank(a, b) !== 0 || compareRank(a, c) !== 0,
        ),
      triple => {
        const sorted = harden(triple.sort(compareRank));
        assertRankSorted(sorted, compareRank);
        const [a, b, c] = sorted;
        const failures = [];

        const testCompare = (outcome, message, failure) => {
          t.true(outcome, message);
          if (!outcome) {
            failures.push(failure);
          }
        };

        testCompare(
          compareRank(a, b) <= 0,
          'a <= b',
          `Expected <= 0: ${q(a)} vs. ${q(b)}`,
        );
        testCompare(
          compareRank(a, c) <= 0,
          'a <= c',
          `Expected <= 0: ${q(a)} vs. ${q(c)}`,
        );
        testCompare(
          compareRank(b, c) <= 0,
          'b <= c',
          `Expected <= 0: ${q(b)} vs. ${q(c)}`,
        );
        testCompare(
          compareRank(c, b) >= 0,
          'c >= b',
          `Expected >= 0: ${q(c)} vs. ${q(b)}`,
        );
        testCompare(
          compareRank(c, a) >= 0,
          'c >= a',
          `Expected >= 0: ${q(c)} vs. ${q(a)}`,
        );
        testCompare(
          compareRank(b, a) >= 0,
          'b >= a',
          `Expected >= 0: ${q(b)} vs. ${q(a)}`,
        );

        return t.deepEqual(failures, []);
      },
    ),
  );
});

test('compare and sort by rank', t => {
  assertRankSorted(sortedSample, compareRank);
  t.false(isRankSorted(unsortedSample, compareRank));
  const sorted = sortByRank(unsortedSample, compareRank);
  t.is(
    compareRank(sorted, sortedSample),
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
  t.assert(isRankSorted(unusedRangeSample, compareRank));
  for (const [rankCover, indexRange] of brokenQueries) {
    const range = getIndexCover(unusedRangeSample, compareRank, rankCover);
    t.is(range[0], indexRange[0]);
    t.is(range[1], indexRange[1]);
  }
});
