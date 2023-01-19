// @ts-nocheck
// eslint-disable-next-line import/order
import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/no-extraneous-dependencies
import { fc } from '@fast-check/ava';
import { makeTagged } from '@endo/pass-style';
import {
  exampleAlice,
  exampleBob,
  exampleCarol,
  arbPassable,
} from '@endo/pass-style/tools.js';

import {
  FullRankCover,
  compareRank,
  isRankSorted,
  sortByRank,
  getPassStyleCover,
  getIndexCover,
  assertRankSorted,
} from '../src/rankOrder.js';

const { quote: q } = assert;

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

/**
 * An unordered copyArray of some passables
 */
export const sample = harden([
  makeTagged('copySet', [
    ['b', 3],
    ['a', 4],
  ]),
  'foo',
  3n,
  'barr',
  undefined,
  [5, { foo: 4 }],
  2,
  null,
  [5, { foo: 4, bar: null }],
  exampleBob,
  0,
  makeTagged('copySet', [
    ['a', 4],
    ['b', 3],
  ]),
  NaN,
  true,
  undefined,
  -Infinity,
  [5],
  exampleAlice,
  [],
  Symbol.for('foo'),
  new Error('not erroneous'),
  Symbol.for('@@foo'),
  [5, { bar: 5 }],
  Symbol.for(''),
  false,
  exampleCarol,
  -0,
  {},
  [5, undefined],
  -3,
  makeTagged('copyMap', [
    ['a', 4],
    ['b', 3],
  ]),
  true,
  'bar',
  [5, null],
  new Promise(() => {}), // forever unresolved
  makeTagged('nonsense', [
    ['a', 4],
    ['b', 3],
  ]),
  Infinity,
  Symbol.isConcatSpreadable,
  [5, { foo: 4, bar: undefined }],
  Promise.resolve('fulfillment'),
  [5, { foo: 4 }],
  // The promises should be of the same rank, in which case
  // the singleton array should be earlier. But if the encoded
  // gives the earlier promise an earlier encoding (as it used to),
  // then the encoded forms will not be order preserving.
  [Promise.resolve(null), 'x'],
  [Promise.resolve(null)],
]);

const rejectedP = Promise.reject(new Error('broken'));
rejectedP.catch(() => {}); // Suppress unhandled rejection warning/error

/**
 * The correctly stable rank sorting of `sample`
 */
const sortedSample = harden([
  // All errors are tied.
  new Error('different'),

  {},

  // Lexicographic tagged: tag then payload
  makeTagged('copyMap', [
    ['a', 4],
    ['b', 3],
  ]),
  makeTagged('copySet', [
    ['a', 4],
    ['b', 3],
  ]),
  // Doesn't care if a valid copySet
  makeTagged('copySet', [
    ['b', 3],
    ['a', 4],
  ]),
  // Doesn't care if a recognized tagged tag
  makeTagged('nonsense', [
    ['a', 4],
    ['b', 3],
  ]),

  // All promises are tied.
  rejectedP,
  rejectedP,

  // Lexicographic arrays. Shorter beats longer.
  // Lexicographic records by reverse sorted property name, then by values
  // in that order.
  [],
  [Promise.resolve(null)],
  [Promise.resolve(null), 'x'],
  [5],
  [5, { bar: 5 }],
  [5, { foo: 4 }],
  [5, { foo: 4 }],
  [5, { foo: 4, bar: null }],
  [5, { foo: 4, bar: undefined }],
  [5, null],
  [5, undefined],

  false,
  true,
  true,

  // -0 is equivalent enough to 0. NaN after all numbers.
  -Infinity,
  -3,
  -0,
  0,
  2,
  Infinity,
  NaN,

  3n,

  // All remotables are tied for the same rank and the sort is stable,
  // so their relative order is preserved
  exampleBob,
  exampleAlice,
  exampleCarol,

  // Lexicographic strings. Shorter beats longer.
  // TODO Probe UTF-16 vs Unicode vs UTF-8 (Moddable) ordering.
  'bar',
  'barr',
  'foo',

  null,
  Symbol.for(''),
  Symbol.for('@@foo'),
  Symbol.isConcatSpreadable,
  Symbol.for('foo'),

  undefined,
  undefined,
]);

test('compare and sort by rank', t => {
  assertRankSorted(sortedSample, compareRank);
  t.false(isRankSorted(sample, compareRank));
  const sorted = sortByRank(sample, compareRank);
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
