import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
import { Far } from '@endo/pass-style';
import { makeCopySet, makeCopyBag } from '../src/keys/checkKey.js';
import {
  compareKeys,
  keyLT,
  keyLTE,
  keyGT,
  keyGTE,
} from '../src/keys/compareKeys.js';

test('compareKeys - identical primitives', t => {
  t.is(compareKeys(3, 3), 0);
  t.is(compareKeys('abc', 'abc'), 0);
  t.is(compareKeys(true, true), 0);
  t.is(compareKeys(null, null), 0);
  t.is(compareKeys(undefined, undefined), 0);
});

test('compareKeys - ordered primitives', t => {
  t.is(compareKeys(1, 2), -1);
  t.is(compareKeys(2, 1), 1);
  t.is(compareKeys('a', 'b'), -1);
});

test('compareKeys - different passStyles are incommensurate', t => {
  t.is(Number.isNaN(compareKeys(3, 'three')), true);
  t.is(Number.isNaN(compareKeys(null, undefined)), true);
});

test('compareKeys - NaN is incommensurate with non-NaN numbers', t => {
  // NaN compared with a non-NaN number should return NaN (incommensurate)
  t.is(Number.isNaN(compareKeys(NaN, 42)), true);
  t.is(Number.isNaN(compareKeys(42, NaN)), true);
});

test('compareKeys - NaN is equal to itself', t => {
  t.is(compareKeys(NaN, NaN), 0);
});

test('compareKeys - non-identical remotables are incommensurate', t => {
  const a = Far('a');
  const b = Far('b');
  t.is(compareKeys(a, a), 0);
  t.is(Number.isNaN(compareKeys(a, b)), true);
});

test('compareKeys - copyArrays ordered lexicographically', t => {
  t.is(compareKeys(harden([1, 2]), harden([1, 2])), 0);
  t.is(compareKeys(harden([1, 2]), harden([1, 3])), -1);
  t.is(compareKeys(harden([1, 3]), harden([1, 2])), 1);
});

test('compareKeys - copyRecords with incommensurate values', t => {
  // Records where one value is incommensurate (NaN from remotable comparison)
  const r1 = Far('r1');
  const r2 = Far('r2');
  // Records with different remotable values at the same key
  t.is(Number.isNaN(compareKeys(harden({ x: r1 }), harden({ x: r2 }))), true);
});

test('compareKeys - different tagged types are incommensurate', t => {
  const aSet = makeCopySet(harden([1, 2]));
  const aBag = makeCopyBag(
    harden([
      [1, 1n],
      [2, 1n],
    ]),
  );
  t.is(Number.isNaN(compareKeys(aSet, aBag)), true);
});

test('keyLT and keyGT', t => {
  t.true(keyLT(1, 2));
  t.false(keyLT(2, 1));
  t.false(keyLT(1, 1));
  t.true(keyGT(2, 1));
  t.false(keyGT(1, 2));
});

test('keyLTE and keyGTE', t => {
  t.true(keyLTE(1, 2));
  t.true(keyLTE(1, 1));
  t.false(keyLTE(2, 1));
  t.true(keyGTE(2, 1));
  t.true(keyGTE(1, 1));
  t.false(keyGTE(1, 2));
});
