import test from '@endo/ses-ava/prepare-endo.js';

import { makeTagged, getTag, passStyleOf } from '@endo/marshal';
import {
  isCopyBag,
  assertCopyBag,
  makeCopyBag,
  makeCopyBagFromElements,
  getCopyBagEntries,
} from '../src/keys/checkKey.js';
import { matches } from '../src/patterns/patternMatchers.js';

import '../src/types.js';

const assertIsCopyBag = (t, bag) => {
  t.is(passStyleOf(bag), 'tagged');
  t.is(getTag(bag), 'copyBag');
  t.notThrows(() => assertCopyBag(bag));
  t.true(isCopyBag(bag));
};

const assertIsInvalidCopyBag = (t, bag, message) => {
  t.is(passStyleOf(bag), 'tagged');
  t.is(getTag(bag), 'copyBag');
  t.throws(() => assertCopyBag(bag), { message });
  t.is(isCopyBag(bag), false);
};

test('makeCopyBag', t => {
  const bag = makeCopyBag([
    ['z', 26n],
    ['a', 1n],
    ['b', 10n],
    ['c', 3n],
  ]);
  assertIsCopyBag(t, bag);
  t.deepEqual(
    getCopyBagEntries(bag),
    [
      ['z', 26n],
      ['c', 3n],
      ['b', 10n],
      ['a', 1n],
    ],
    'entries are reverse-sorted by key',
  );
});

test('makeCopyBagFromElements', t => {
  function* generateKeys() {
    yield* ['z', 'c', 'b', 'a'];
    yield* ['z', 'c', 'b', 'a'];
    yield 'b';
  }
  const bag = makeCopyBagFromElements(generateKeys());
  assertIsCopyBag(t, bag);
  t.deepEqual(
    getCopyBagEntries(bag),
    [
      ['z', 2n],
      ['c', 2n],
      ['b', 3n],
      ['a', 2n],
    ],
    'entries are reverse-sorted by key',
  );
});

test('backwards-compatible static shape', t => {
  const manualBag = harden(
    Object.defineProperties(
      {},
      {
        [Symbol.for('passStyle')]: { value: 'tagged' },
        [Symbol.toStringTag]: { value: 'copyBag' },
        payload: {
          enumerable: true,
          value: [
            ['z', 2n],
            ['c', 1n],
            ['b', 3n],
            ['a', 2n],
          ],
        },
      },
    ),
  );
  assertIsCopyBag(t, manualBag);
  const bags = {
    makeTagged: makeTagged('copyBag', [
      ['z', 2n],
      ['c', 1n],
      ['b', 3n],
      ['a', 2n],
    ]),
    makeCopyBag: makeCopyBag([
      ['z', 2n],
      ['a', 2n],
      ['b', 3n],
      ['c', 1n],
    ]),
    makeCopyBagFromElements: makeCopyBagFromElements('zabczabb'.split('')),
  };
  for (const [label, bag] of Object.entries(bags)) {
    t.deepEqual(
      Object.getOwnPropertyDescriptors(bag),
      Object.getOwnPropertyDescriptors(manualBag),
      label,
    );
  }
});

test('key uniqueness', t => {
  t.throws(
    () =>
      makeCopyBag([
        ['a', 1n],
        ['a', 1n],
      ]),
    { message: /value has duplicate keys/ },
  );
  assertIsInvalidCopyBag(
    t,
    makeTagged('copyBag', [
      ['a', 1n],
      ['a', 1n],
    ]),
    /value has duplicate keys/,
  );
});

// TODO: incorporate fast-check for property-based testing that construction
// reverse rank sorts keys and validation rejects any other key order.

test('matching', t => {
  const bag = makeCopyBag([
    ['z', 26n],
    ['c', 3n],
    ['b', 2n],
    ['a', 1n],
  ]);
  const missingKey = makeCopyBag([
    ['z', 26n],
    ['c', 3n],
    ['b', 2n],
  ]);
  const extraKey = makeCopyBag([
    ['z', 26n],
    ['d', 4n],
    ['c', 3n],
    ['b', 2n],
    ['a', 1n],
  ]);
  const differentCount = makeCopyBag([
    ['z', 1n],
    ['c', 1n],
    ['b', 1n],
    ['a', 1n],
  ]);

  const assertNoMatch = bags => {
    const [[label1, bag1], [label2, bag2]] = Object.entries(bags);
    t.is(
      matches(bag1, bag2),
      false,
      `${label1} specimen must not be matched by ${label2} pattern`,
    );
    t.is(
      matches(bag2, bag1),
      false,
      `${label2} specimen must not be matched by ${label1} pattern`,
    );
  };
  assertNoMatch({
    'non-empty': bag,
    empty: makeCopyBag([]),
  });
  assertNoMatch({ bag, missingKey });
  assertNoMatch({ bag, extraKey });
  assertNoMatch({ bag, differentCount });

  t.true(matches(bag, bag), 'matches itself');
  t.true(
    matches(bag, makeTagged('copyBag', [...getCopyBagEntries(bag)])),
    'matches a manually-cloned pattern',
  );

  t.throws(
    () =>
      matches(
        bag,
        makeTagged('copyBag', [...getCopyBagEntries(bag)].reverse()),
      ),
    { message: /pattern expected/ },
    'key-reversed pattern is rejected',
  );
  t.is(
    matches(makeTagged('copyBag', [...getCopyBagEntries(bag)].reverse()), bag),
    false,
    "key-reversed specimen doesn't match",
  );
});

test('types', t => {
  const bag = makeCopyBag([['a', 1n]]);

  // @ts-expect-error No 'foo' in [string, bigint][]
  bag.payload.foo;
  const [str, count] = bag.payload[0];
  str.concat; // string
  count + 1n; // bigint

  t.pass();
});
