// @ts-check

import test from '@endo/ses-ava/test.js';
import { compareByteArrays } from '../../src/syrup/compare.js';

test('equal', t => {
  const left = new Uint8Array([1, 2, 3]);
  const right = new Uint8Array([1, 2, 3]);
  t.is(compareByteArrays(left, right), 0);
});

test('left longer', t => {
  const left = new Uint8Array([1, 2, 3, 4]);
  const right = new Uint8Array([1, 2, 3]);
  t.is(compareByteArrays(left, right), 1);
});

test('right longer', t => {
  const left = new Uint8Array([1, 2, 3]);
  const right = new Uint8Array([1, 2, 3, 4]);
  t.is(compareByteArrays(left, right), -1);
});
