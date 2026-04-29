import test from '@endo/ses-ava/test.js';

import { encodeHex, decodeHex } from '../index.js';
import { jsEncodeHex } from '../src/encode.js';
import { jsDecodeHex } from '../src/decode.js';

test('round-trip across the full byte space', t => {
  const all = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    all[i] = i;
  }
  const hex = encodeHex(all);
  t.is(hex.length, 512);
  t.is(hex.slice(0, 6), '000102');
  t.is(hex.slice(-6), 'fdfeff');
  const back = decodeHex(hex);
  t.is(back.length, 256);
  for (let i = 0; i < 256; i += 1) {
    t.is(back[i], i);
  }
});

test('encodeHex emits lowercase', t => {
  t.is(encodeHex(new Uint8Array([0xb0, 0xb5, 0xc4, 0xfe])), 'b0b5c4fe');
});

test('decodeHex accepts both cases', t => {
  const lower = decodeHex('b0b5c4fe');
  const upper = decodeHex('B0B5C4FE');
  const mixed = decodeHex('B0b5C4fe');
  t.deepEqual([...lower], [0xb0, 0xb5, 0xc4, 0xfe]);
  t.deepEqual([...upper], [0xb0, 0xb5, 0xc4, 0xfe]);
  t.deepEqual([...mixed], [0xb0, 0xb5, 0xc4, 0xfe]);
});

test('empty input round-trip', t => {
  t.is(encodeHex(new Uint8Array([])), '');
  t.is(decodeHex('').length, 0);
});

test('decodeHex rejects odd-length input', t => {
  t.throws(() => decodeHex('a'), { message: /hex/i });
  t.throws(() => decodeHex('abc'), { message: /hex/i });
});

test('decodeHex rejects invalid characters', t => {
  t.throws(() => decodeHex('gg'), { message: /hex/i });
  t.throws(() => decodeHex('0z'), { message: /hex/i });
  t.throws(() => decodeHex(' 0a'), { message: /hex/i });
});

test('decodeHex embeds the provided name in error messages', t => {
  t.throws(() => decodeHex('a', 'myInput'), { message: /myInput/ });
  t.throws(() => decodeHex('gg', 'another'), { message: /another/ });
});

test('jsEncodeHex round-trips through jsDecodeHex', t => {
  const inputs = [
    new Uint8Array([]),
    new Uint8Array([0]),
    new Uint8Array([255]),
    new Uint8Array([1, 2, 3, 4, 5]),
    new Uint8Array([0xca, 0xfe]),
    new Uint8Array([0xb0, 0xb5, 0xc0, 0xff, 0xee, 0xfa, 0xca, 0xde]),
  ];
  for (const bytes of inputs) {
    const hex = jsEncodeHex(bytes);
    const back = jsDecodeHex(hex);
    t.deepEqual([...back], [...bytes]);
  }
});

test('dispatched and polyfill encode agree on clean inputs', t => {
  const inputs = [
    new Uint8Array([]),
    new Uint8Array([0, 1, 2]),
    new Uint8Array([0xb0, 0xb5, 0xc4, 0xfe]),
  ];
  for (const bytes of inputs) {
    t.is(encodeHex(bytes), jsEncodeHex(bytes));
  }
});

test('dispatched and polyfill decode agree on clean inputs', t => {
  const inputs = ['', '000102', 'b0b5c0ffeefacade', 'B0B5C4FE'];
  for (const hex of inputs) {
    t.deepEqual([...decodeHex(hex)], [...jsDecodeHex(hex)]);
  }
});

test('jsDecodeHex rejects non-ASCII and high-bit characters', t => {
  // Surrogate pair halves (emoji): charCodeAt units in 0xD800 to 0xDFFF.
  t.throws(() => jsDecodeHex('\u{1F600}\u{1F600}'), { message: /hex/i });
  // High-bit Latin-1 that would have been undefined in a 256-entry table.
  t.throws(() => jsDecodeHex('\u00ff\u00ff'), { message: /hex/i });
  // Null bytes are not hex digits.
  t.throws(() => jsDecodeHex('\u0000\u0000'), { message: /hex/i });
  // `@` (0x40) and backtick (0x60) sit adjacent to 'A' and 'a' and must
  // not slip through the `c | 0x20` lowercase fold.
  t.throws(() => jsDecodeHex('@@'), { message: /hex/i });
  t.throws(() => jsDecodeHex('``'), { message: /hex/i });
});

test('jsDecodeHex error offset points to the first bad nibble', t => {
  // High nibble invalid -> offset 0.
  const e1 = t.throws(() => jsDecodeHex('ga'));
  t.regex(/** @type {Error} */ (e1).message, /offset 0\b/);
  // Low nibble invalid -> offset 1.
  const e2 = t.throws(() => jsDecodeHex('ag'));
  t.regex(/** @type {Error} */ (e2).message, /offset 1\b/);
  // Second byte, high nibble -> offset 2.
  const e3 = t.throws(() => jsDecodeHex('aagg'));
  t.regex(/** @type {Error} */ (e3).message, /offset 2\b/);
});

test('decodeHex preserves offset diagnostic on native dispatch', t => {
  // Whether the native intrinsic is present or not, the error must
  // include the offset; the native path re-runs jsDecodeHex on throw.
  const e = t.throws(() => decodeHex('ag', 'myInput'));
  t.regex(/** @type {Error} */ (e).message, /offset 1\b/);
  t.regex(/** @type {Error} */ (e).message, /myInput/);
});
