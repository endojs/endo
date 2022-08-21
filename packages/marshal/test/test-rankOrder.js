// @ts-nocheck
import { test } from './prepare-test-env-ava.js';
// eslint-disable-next-line import/order, import/no-extraneous-dependencies
import { fc } from '@fast-check/ava';

import {
  FullRankCover,
  compareRank,
  isRankSorted,
  sortByRank,
  getIndexCover,
  getPassStyleCover,
  assertRankSorted,
} from '../src/rankOrder.js';

import { makeTagged } from '../src/makeTagged.js';
import { Far } from '../src/make-far.js';

const { quote: q } = assert;

/**
 * The only elements with identity. Everything else should be equal
 * by contents.
 */
const alice = Far('alice', {});
const bob = Far('bob', {});
const carol = Far('carol', {});

/**
 * A factory for arbitrary passables
 */
const { passable } = fc.letrec(tie => {
  return {
    passable: tie('dag').map(x => harden(x)),
    dag: fc.oneof(
      { depthFactor: 0.5, withCrossShrink: true },
      // a tagged value whose payload is an array of [key, leaf] pairs
      // where each key is unique within the payload
      // XXX can the payload be generalized further?
      fc
        .record({
          type: fc.constantFrom('copyMap', 'copySet', 'nonsense'),
          payload: fc
            .uniqueArray(fc.fullUnicodeString(), { maxLength: 3 })
            .chain(k => {
              return fc.tuple(fc.constant(k), tie('leaf'));
            }),
        })
        .map(({ type, payload }) => makeTagged(type, payload)),
      fc.array(tie('dag'), { maxLength: 3 }),
      fc.dictionary(
        fc.fullUnicodeString().filter(s => s !== 'then'),
        tie('dag'),
        { maxKeys: 3 },
      ),
      tie('dag').map(v => Promise.resolve(v)),
      tie('leaf'),
    ),
    leaf: fc.oneof(
      fc.record({}),
      fc.fullUnicodeString(),
      fc.fullUnicodeString().map(s => Symbol.for(s)),
      fc.fullUnicodeString().map(s => new Error(s)),
      // primordial symbols and registered lookalikes
      fc.constantFrom(
        ...Object.getOwnPropertyNames(Symbol).flatMap(k => {
          const v = Symbol[k];
          if (typeof v !== 'symbol') return [];
          return [v, Symbol.for(k), Symbol.for(`@@${k}`)];
        }),
      ),
      fc.bigInt(),
      fc.integer(),
      fc.constantFrom(-0, NaN, Infinity, -Infinity),
      fc.constantFrom(null, undefined, false, true),
      fc.constantFrom(alice, bob, carol),
      // unresolved promise
      fc.constant(new Promise(() => {})),
    ),
  };
});

test('compareRank is reflexive', async t => {
  await fc.assert(
    fc.property(passable, x => {
      return t.is(compareRank(x, x), 0);
    }),
  );
});

test('compareRank totally orders ranks', async t => {
  await fc.assert(
    fc.property(passable, passable, (a, b) => {
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

// TODO Had to remove key-level cases from the test-encodePassable.js as
// migrated to endo. As a result, some of the tests here are broken.
// Fix.
test.skip('compareRank is transitive', async t => {
  await fc.assert(
    fc.property(
      // operate on a set of three passables covering at least two ranks
      fc
        .uniqueArray(passable, { minLength: 3, maxLength: 3 })
        .filter(
          ([a, b, c]) => compareRank(a, b) !== 0 || compareRank(a, c) !== 0,
        ),
      triple => {
        const sorted = harden(triple.sort(compareRank));
        assertRankSorted(sorted, compareRank);
        const [a, b, c] = sorted;
        const failures = [];
        let result;
        let resultOk;

        result = compareRank(a, b);
        resultOk = t.true(result <= 0, 'a <= b');
        if (!resultOk) {
          failures.push(`Expected <= 0: ${result} from ${q(a)} vs. ${q(b)}`);
        }
        result = compareRank(a, c);
        resultOk = t.true(result <= 0, 'a <= c');
        if (!resultOk) {
          failures.push(`Expected <= 0: ${result} from ${q(a)} vs. ${q(c)}`);
        }
        result = compareRank(b, c);
        resultOk = t.true(result <= 0, 'b <= c');
        if (!resultOk) {
          failures.push(`Expected <= 0: ${result} from ${q(b)} vs. ${q(c)}`);
        }
        result = compareRank(c, b);
        resultOk = t.true(result >= 0, 'c >= b');
        if (!resultOk) {
          failures.push(`Expected >= 0: ${result} from ${q(c)} vs. ${q(b)}`);
        }
        result = compareRank(c, a);
        resultOk = t.true(result >= 0, 'c >= a');
        if (!resultOk) {
          failures.push(`Expected >= 0: ${result} from ${q(c)} vs. ${q(a)}`);
        }
        result = compareRank(b, a);
        resultOk = t.true(result >= 0, 'b >= a');
        if (!resultOk) {
          failures.push(`Expected >= 0: ${result} from ${q(b)} vs. ${q(a)}`);
        }

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
  bob,
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
  alice,
  [],
  Symbol.for('foo'),
  new Error('not erroneous'),
  Symbol.for('@@foo'),
  [5, { bar: 5 }],
  Symbol.for(''),
  false,
  carol,
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
  bob,
  alice,
  carol,

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

const rangeSample = harden([
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
const queries = harden([
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
  t.assert(isRankSorted(rangeSample, compareRank));
  for (const [rankCover, indexRange] of queries) {
    const range = getIndexCover(rangeSample, compareRank, rankCover);
    t.is(range[0], indexRange[0]);
    t.is(range[1], indexRange[1]);
  }
});
