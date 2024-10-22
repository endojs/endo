import test from '@endo/ses-ava/prepare-endo.js';

import { fc } from '@fast-check/ava';
import { makeTagged, getTag, passStyleOf } from '@endo/marshal';
import {
  arbKey,
  exampleAlice,
  exampleBob,
  exampleCarol,
} from '@endo/pass-style/tools.js';
import { Fail, q } from '@endo/errors';
import {
  isCopySet,
  assertCopySet,
  makeCopySet,
  getCopySetKeys,
} from '../src/keys/checkKey.js';
import { keyEQ } from '../src/keys/compareKeys.js';
import {
  setIsSuperset,
  setIsDisjoint,
  setUnion,
  setDisjointUnion,
  setIntersection,
  setDisjointSubtract,
} from '../src/keys/merge-set-operators.js';
import { M, matches } from '../src/patterns/patternMatchers.js';

import '../src/types.js';

/** @import { Key } from '../src/types.js'; */

const assertIsCopySet = (t, s) => {
  t.is(passStyleOf(s), 'tagged');
  t.is(getTag(s), 'copySet');
  t.notThrows(() => assertCopySet(s));
  t.true(isCopySet(s));
};

const assertIsInvalidCopySet = (t, s, message) => {
  t.is(passStyleOf(s), 'tagged');
  t.is(getTag(s), 'copySet');
  t.throws(() => assertCopySet(s), { message });
  t.is(isCopySet(s), false);
};

test('makeCopySet', t => {
  const s = makeCopySet(['z', 'a', 'b', 'c']);
  assertIsCopySet(t, s);
  t.deepEqual(
    getCopySetKeys(s),
    ['z', 'c', 'b', 'a'],
    'keys are reverse-sorted',
  );
});

test('backwards-compatible static shape', t => {
  const manualSet = harden(
    Object.defineProperties(
      {},
      {
        [Symbol.for('passStyle')]: { value: 'tagged' },
        [Symbol.toStringTag]: { value: 'copySet' },
        payload: {
          enumerable: true,
          value: ['z', 'c', 'b', 'a'],
        },
      },
    ),
  );
  assertIsCopySet(t, manualSet);
  const sets = {
    makeTagged: makeTagged('copySet', ['z', 'c', 'b', 'a']),
    makeCopySet: makeCopySet(['z', 'a', 'b', 'c']),
  };
  for (const [label, s] of Object.entries(sets)) {
    t.deepEqual(
      Object.getOwnPropertyDescriptors(s),
      Object.getOwnPropertyDescriptors(manualSet),
      label,
    );
  }
});

test('key uniqueness', t => {
  t.throws(() => makeCopySet(['a', 'a']), {
    message: /value has duplicate keys/,
  });
  assertIsInvalidCopySet(
    t,
    makeTagged('copySet', ['a', 'a']),
    /value has duplicate keys/,
  );
});

// TODO: incorporate fast-check for property-based testing that construction
// reverse rank sorts keys and validation rejects any other key order.

test('operations on golden inputs', t => {
  const x = makeCopySet(['b', 'a', 'c']);
  const y = makeCopySet(['a', 'b']);
  const z = makeCopySet(['c', 'b']);
  const yUz = setUnion(y, z);
  t.throws(() => setDisjointUnion(y, z), {
    message: /Sets must not have common elements: "b"/,
  });
  const xMy = setDisjointSubtract(x, y);
  t.throws(() => setDisjointUnion(y, z), {
    message: /Sets must not have common elements: "b"/,
  });
  const cy = setDisjointUnion(xMy, y);
  const yIz = setIntersection(y, z);

  t.false(setIsDisjoint(y, z));
  t.assert(setIsDisjoint(xMy, y));

  t.assert(setIsSuperset(x, y));
  const twoCohorts = [
    [exampleAlice, 'z'],
    [exampleBob, 'z'],
    [exampleCarol, 'a'],
  ];
  t.assert(
    setIsSuperset(makeCopySet(twoCohorts), makeCopySet(twoCohorts.slice(-1))),
    'superset with many items in one rank cohort (issue #2588)',
  );

  t.assert(matches(x, yUz));
  t.assert(matches(x, M.gt(y)));
  t.assert(matches(x, M.gt(z)));
  t.false(matches(y, M.gte(z)));
  t.false(matches(y, M.lte(z)));

  t.deepEqual(x, makeTagged('copySet', ['c', 'b', 'a']));
  t.deepEqual(x, yUz);
  t.deepEqual(x, cy);
  t.deepEqual(y, makeTagged('copySet', ['b', 'a']));
  t.deepEqual(z, makeTagged('copySet', ['c', 'b']));
  t.deepEqual(xMy, makeTagged('copySet', ['c']));
  t.deepEqual(yIz, makeTagged('copySet', ['b']));
});

test('setIsSuperset', async t => {
  await fc.assert(
    fc.property(
      fc.uniqueArray(arbKey, { comparator: keyEQ }),
      fc.infiniteStream(fc.boolean()),
      /**
       * @param {Key[]} arr an array of unique Key values
       * @param {Iterator<boolean>} keepSeq a sequence of booleans for filtering
       *   arr into a subset
       */
      (arr, keepSeq) => {
        // Filter out the subset and assert that setIsSuperset recognizes it as
        // such.
        const sub = arr.filter(() => keepSeq.next().value);
        setIsSuperset(makeCopySet(arr), makeCopySet(sub)) ||
          Fail`${q(sub)} must be a subset of ${q(arr)}`;
      },
    ),
  );

  // Ensure at least one ava assertion.
  t.pass();
});

test('matching', t => {
  const copySet = makeCopySet(['z', 'c', 'b', 'a']);
  const missingKey = makeCopySet(['z', 'c', 'b']);
  const extraKey = makeCopySet(['z', 'd', 'c', 'b', 'a']);

  const assertNoMatch = sets => {
    const [[label1, set1], [label2, set2]] = Object.entries(sets);
    t.is(
      matches(set1, set2),
      false,
      `${label1} specimen must not be matched by ${label2} pattern`,
    );
    t.is(
      matches(set2, set1),
      false,
      `${label2} specimen must not be matched by ${label1} pattern`,
    );
  };
  assertNoMatch({
    'non-empty': copySet,
    empty: makeCopySet([]),
  });
  assertNoMatch({ copySet, missingKey });
  assertNoMatch({ copySet, extraKey });

  t.true(matches(copySet, copySet), 'matches itself');
  t.true(
    matches(copySet, makeTagged('copySet', [...getCopySetKeys(copySet)])),
    'matches a manually-cloned pattern',
  );

  t.throws(
    () =>
      matches(
        copySet,
        makeTagged('copySet', [...getCopySetKeys(copySet)].reverse()),
      ),
    { message: /pattern expected/ },
    'key-reversed pattern is rejected',
  );
  t.is(
    matches(
      makeTagged('copySet', [...getCopySetKeys(copySet)].reverse()),
      copySet,
    ),
    false,
    "key-reversed specimen doesn't match",
  );
});
