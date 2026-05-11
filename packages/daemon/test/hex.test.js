import test from '@endo/ses-ava/prepare-endo.js';

import { toHex, fromHex } from '../src/hex.js';

test('toHex converts bytes to lowercase hex string', t => {
  t.is(toHex(new Uint8Array([0x00, 0xff, 0x0a, 0xbc])), '00ff0abc');
});

test('toHex handles empty array', t => {
  t.is(toHex(new Uint8Array([])), '');
});

test('fromHex converts hex string to bytes', t => {
  t.deepEqual(fromHex('00ff0abc'), new Uint8Array([0x00, 0xff, 0x0a, 0xbc]));
});

test('fromHex handles empty string', t => {
  t.deepEqual(fromHex(''), new Uint8Array([]));
});

test('toHex and fromHex round-trip', t => {
  const original = new Uint8Array([1, 2, 3, 255, 128, 0]);
  t.deepEqual(fromHex(toHex(original)), original);
});
