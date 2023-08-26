import { test } from './prepare-test-env-ava.js';
// eslint-disable-next-line import/order
import { makeTagged, getTag, passStyleOf } from '@endo/marshal';
import {
  isCopyMap,
  assertCopyMap,
  makeCopyMap,
  getCopyMapEntries,
} from '../src/keys/checkKey.js';
import { matches } from '../src/patterns/patternMatchers.js';

import '../src/types.js';

const { Fail } = assert;

const assertIsCopyMap = (t, m) => {
  t.is(passStyleOf(m), 'tagged');
  t.is(getTag(m), 'copyMap');
  t.notThrows(() => assertCopyMap(m));
  t.true(isCopyMap(m));
};

const assertIsInvalidCopyMap = (t, m, message) => {
  t.is(passStyleOf(m), 'tagged');
  t.is(getTag(m), 'copyMap');
  t.throws(() => assertCopyMap(m), { message });
  t.is(isCopyMap(m), false);
};

test('makeCopyMap', t => {
  // @ts-ignore Mixed-type values
  const m = makeCopyMap([
    ['z', undefined],
    ['a', null],
    ['b', true],
    ['c', 4],
    ['d', 5n],
    ['e', 'foo'],
    ['f', 'bar'],
    ['g', 'baz'],
  ]);
  assertIsCopyMap(t, m);
  t.deepEqual(
    [...getCopyMapEntries(m)],
    [
      ['z', undefined],
      ['g', 'baz'],
      ['f', 'bar'],
      ['e', 'foo'],
      ['d', 5n],
      ['c', 4],
      ['b', true],
      ['a', null],
    ],
    'entries are reverse-sorted by key',
  );
});

test('backwards-compatible static shape', t => {
  // @ts-ignore Mixed-type values
  const sortedEntries = new Map([
    ['z', undefined],
    ['g', 'baz'],
    ['f', 'bar'],
    ['e', 'foo'],
    ['d', 5n],
    ['c', 4],
    ['b', true],
    ['a', null],
  ]);
  const manualMap = harden(
    Object.defineProperties(
      {},
      {
        [Symbol.for('passStyle')]: { value: 'tagged' },
        [Symbol.toStringTag]: { value: 'copyMap' },
        payload: {
          enumerable: true,
          value: {
            keys: [...sortedEntries.keys()],
            values: [...sortedEntries.values()],
          },
        },
      },
    ),
  );
  assertIsCopyMap(t, manualMap);
  const maps = {
    makeTagged: makeTagged('copyMap', {
      keys: [...sortedEntries.keys()],
      values: [...sortedEntries.values()],
    }),
    makeCopyMap: makeCopyMap([...sortedEntries].reverse()),
  };
  for (const [label, m] of Object.entries(maps)) {
    t.deepEqual(
      Object.getOwnPropertyDescriptors(m),
      Object.getOwnPropertyDescriptors(manualMap),
      label,
    );
  }
});

test('key uniqueness', t => {
  t.throws(
    () =>
      makeCopyMap([
        ['a', 1n],
        ['a', 1n],
      ]),
    { message: /value has duplicate keys/ },
  );
  assertIsInvalidCopyMap(
    t,
    makeTagged('copyMap', { keys: ['a', 'a'], values: [1n, 1n] }),
    /value has duplicate keys/,
  );
});

// TODO: incorporate fast-check for property-based testing that construction
// reverse rank sorts keys and validation rejects any other key order.

test('iterators are passable', t => {
  const m = makeCopyMap([
    ['x', 8],
    ['y', 7],
  ]);
  const i = getCopyMapEntries(m);
  t.is(passStyleOf(i), 'remotable');
  const iter = i[Symbol.iterator]();
  t.is(passStyleOf(iter), 'remotable');
  const iterResult = iter.next();
  t.is(passStyleOf(iterResult), 'copyRecord');
});

test('matching', t => {
  // TODO CopyMap matching depends upon comparison, the semantics for which have
  // not yet been decided.
  // See https://github.com/endojs/endo/pull/1737#pullrequestreview-1596595411
  try {
    matches(makeCopyMap([]), makeCopyMap([])) || Fail`Unexpected match failure`;
    t.fail('CopyMap comparison support (time to test unconditionally?)');
  } catch (err) {
    // no CopyMap comparison support
    t.pass();
    return;
  }

  const copyMap = makeCopyMap([
    ['z', null],
    ['a', undefined],
  ]);
  const missingKey = makeCopyMap([['z', null]]);
  const extraKey = makeCopyMap([
    ['z', null],
    ['m', 'foo'],
    ['a', undefined],
  ]);
  const differentValue = makeCopyMap([
    ['z', null],
    ['a', null],
  ]);

  const assertNoMatch = maps => {
    const [[label1, map1], [label2, map2]] = Object.entries(maps);
    t.is(
      matches(map1, map2),
      false,
      `${label1} specimen must not be matched by ${label2} pattern`,
    );
    t.is(
      matches(map2, map1),
      false,
      `${label2} specimen must not be matched by ${label1} pattern`,
    );
  };
  assertNoMatch({
    'non-empty': copyMap,
    empty: makeCopyMap([]),
  });
  assertNoMatch({ copyMap, missingKey });
  assertNoMatch({ copyMap, extraKey });
  assertNoMatch({ copyMap, differentValue });

  const tagEntries = entries =>
    makeTagged('copyMap', {
      keys: entries.map(entry => entry[0]),
      values: entries.map(entry => entry[1]),
    });
  t.true(matches(copyMap, copyMap), 'matches itself');
  t.true(
    matches(copyMap, tagEntries([...getCopyMapEntries(copyMap)])),
    'matches a manually-cloned pattern',
  );

  t.throws(
    () =>
      matches(copyMap, tagEntries([...getCopyMapEntries(copyMap)].reverse())),
    { message: /pattern expected/ },
    'key-reversed pattern is rejected',
  );
  t.is(
    matches(tagEntries([...getCopyMapEntries(copyMap)].reverse()), copyMap),
    false,
    "key-reversed specimen doesn't match",
  );
});
