import test from '@endo/ses-ava/test.js';
import { passStyleOf } from '@endo/pass-style';

import { bytesEqual } from '../src/equals.js';
import { bytesFromText } from '../src/from-string.js';
import { bytesToText } from '../src/to-string.js';
import { concatBytes } from '../src/concat.js';
import { concatImmutables } from '../src/concat-immutables.js';
import { bytesToImmutable } from '../src/to-immutable.js';
import { bytesFromImmutable } from '../src/from-immutable.js';

test('concatBytes: empty input yields empty Uint8Array', t => {
  const result = concatBytes([]);
  t.true(result instanceof Uint8Array);
  t.is(result.length, 0);
});

test('concatBytes: single chunk preserves bytes', t => {
  const a = new Uint8Array([1, 2, 3]);
  const result = concatBytes([a]);
  t.deepEqual([...result], [1, 2, 3]);
});

test('concatBytes: many small chunks preserves order', t => {
  const chunks = [
    new Uint8Array([1]),
    new Uint8Array([2, 3]),
    new Uint8Array([4, 5, 6]),
    new Uint8Array([7]),
  ];
  const result = concatBytes(chunks);
  t.deepEqual([...result], [1, 2, 3, 4, 5, 6, 7]);
});

test('concatBytes: zero-length chunks interleaved with non-empty', t => {
  const chunks = [
    new Uint8Array([]),
    new Uint8Array([1, 2]),
    new Uint8Array([]),
    new Uint8Array([3]),
    new Uint8Array([]),
  ];
  const result = concatBytes(chunks);
  t.deepEqual([...result], [1, 2, 3]);
});

test('concatBytes: lengths around 64-byte boundaries', t => {
  // Catches any future SIMD optimization that assumes alignment.
  for (const len of [63, 64, 65, 127, 128, 129]) {
    const chunk = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      chunk[i] = i % 256;
    }
    const result = concatBytes([chunk, chunk]);
    t.is(result.length, len * 2);
    for (let i = 0; i < len; i += 1) {
      t.is(result[i], i % 256);
      t.is(result[i + len], i % 256);
    }
  }
});

test('concatBytes: huge chunk plus zero-length chunks', t => {
  const big = new Uint8Array(4096);
  for (let i = 0; i < big.length; i += 1) {
    big[i] = i % 256;
  }
  const result = concatBytes([new Uint8Array([]), big, new Uint8Array([])]);
  t.is(result.length, 4096);
  for (let i = 0; i < 4096; i += 1) {
    t.is(result[i], i % 256);
  }
});

test('bytesEqual: identical reference', t => {
  const a = new Uint8Array([1, 2, 3]);
  t.true(bytesEqual(a, a));
});

test('bytesEqual: identical contents different references', t => {
  const a = new Uint8Array([1, 2, 3]);
  const b = new Uint8Array([1, 2, 3]);
  t.true(bytesEqual(a, b));
});

test('bytesEqual: different lengths', t => {
  const a = new Uint8Array([1, 2, 3]);
  const b = new Uint8Array([1, 2]);
  t.false(bytesEqual(a, b));
});

test('bytesEqual: same prefix different suffix', t => {
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([1, 2, 3, 5]);
  t.false(bytesEqual(a, b));
});

test('bytesEqual: empty arrays compare equal', t => {
  t.true(bytesEqual(new Uint8Array(), new Uint8Array()));
});

test('bytesEqual: differs at first byte', t => {
  const a = new Uint8Array([0, 1, 2]);
  const b = new Uint8Array([1, 1, 2]);
  t.false(bytesEqual(a, b));
});

test('bytesFromText / bytesToText: empty string round-trip', t => {
  const bytes = bytesFromText('');
  t.is(bytes.length, 0);
  t.is(bytesToText(bytes), '');
});

test('bytesFromText / bytesToText: ASCII round-trip', t => {
  const original = 'Hello, world!';
  const bytes = bytesFromText(original);
  t.is(bytes.length, original.length);
  t.is(bytesToText(bytes), original);
});

test('bytesFromText: BMP multi-byte UTF-8', t => {
  // U+00E9 (eacute) encodes to two bytes; U+4E2D (Chinese 'middle')
  // encodes to three bytes.
  const bytes = bytesFromText('é中');
  t.deepEqual([...bytes], [0xc3, 0xa9, 0xe4, 0xb8, 0xad]);
  t.is(bytesToText(bytes), 'é中');
});

test('bytesFromText: non-BMP UTF-8 (surrogate pair)', t => {
  // U+1F600 (grinning face) requires a surrogate pair in UTF-16
  // and encodes to four bytes in UTF-8.
  const bytes = bytesFromText('\u{1F600}');
  t.deepEqual([...bytes], [0xf0, 0x9f, 0x98, 0x80]);
  t.is(bytesToText(bytes), '\u{1F600}');
});

test('bytesFromText and concatBytes compose: round-trip', t => {
  const parts = ['Hello, ', 'world', '!'];
  const chunks = parts.map(s => bytesFromText(s));
  const combined = concatBytes(chunks);
  t.is(bytesToText(combined), 'Hello, world!');
});

test('bytesEqual on bytesFromText output: same input compares equal', t => {
  t.true(bytesEqual(bytesFromText('abc'), bytesFromText('abc')));
  t.false(bytesEqual(bytesFromText('abc'), bytesFromText('abd')));
});

test('bytesToImmutable: returns ArrayBuffer with byteArray passStyle', t => {
  const view = new Uint8Array([1, 2, 3, 4, 5]);
  const immutable = bytesToImmutable(view);
  t.true(immutable instanceof ArrayBuffer);
  t.is(immutable.byteLength, 5);
  // @ts-expect-error passStyleOf typing infers the wrong type for ArrayBuffer.
  t.is(passStyleOf(immutable), 'byteArray');
});

test('bytesToImmutable: empty input', t => {
  const immutable = bytesToImmutable(new Uint8Array(0));
  t.is(immutable.byteLength, 0);
});

test('bytesToImmutable: honors subarray byteOffset and byteLength', t => {
  const full = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  const window = full.subarray(2, 6); // [2, 3, 4, 5]
  const immutable = bytesToImmutable(window);
  t.is(immutable.byteLength, 4);
  t.deepEqual([...bytesFromImmutable(immutable)], [2, 3, 4, 5]);
});

test('bytesFromImmutable: copies bytes into a fresh Uint8Array', t => {
  const source = new Uint8Array([0, 1, 2, 0xff, 0x80, 0x00, 42, 100]);
  const immutable = bytesToImmutable(source);
  const result = bytesFromImmutable(immutable);
  t.true(result instanceof Uint8Array);
  t.is(result.length, source.length);
  t.deepEqual([...result], [...source]);
});

test('bytesFromImmutable: empty input', t => {
  const immutable = bytesToImmutable(new Uint8Array(0));
  const result = bytesFromImmutable(immutable);
  t.true(result instanceof Uint8Array);
  t.is(result.length, 0);
});

test('bytesToImmutable + bytesToText composition: UTF-8 round-trip', t => {
  const original = 'Hello, 你好 \u{1F600}';
  const immutable = bytesToImmutable(bytesFromText(original));
  t.is(bytesToText(bytesFromImmutable(immutable)), original);
});

test('bytesToImmutable + concatBytes composition: assemble from chunks', t => {
  const parts = ['<', 'test-record', '>'].map(s => bytesFromText(s));
  const combined = bytesToImmutable(concatBytes(parts));
  t.is(bytesToText(bytesFromImmutable(combined)), '<test-record>');
});

test('bytesToText: { fatal: true } accepts valid UTF-8', t => {
  const bytes = bytesFromText('Hello, 你好 \u{1F600}');
  t.is(bytesToText(bytes, { fatal: true }), 'Hello, 你好 \u{1F600}');
});

test('bytesToText: { fatal: true } throws on invalid UTF-8', t => {
  // 0xC3 begins a two-byte sequence; 0x28 is not a valid continuation byte.
  const invalid = new Uint8Array([0xc3, 0x28]);
  t.throws(() => bytesToText(invalid, { fatal: true }), {
    instanceOf: TypeError,
  });
});

test('bytesToText: default mode substitutes U+FFFD on invalid UTF-8', t => {
  const invalid = new Uint8Array([0xc3, 0x28]);
  // The default lenient decoder must not throw and emits U+FFFD for the
  // malformed lead byte.
  const result = bytesToText(invalid);
  t.true(result.includes('�'));
});

test('bytesToText: { fatal: false } also accepts valid UTF-8', t => {
  const bytes = bytesFromText('plain ASCII');
  t.is(bytesToText(bytes, { fatal: false }), 'plain ASCII');
});

test('concatImmutables: empty input yields empty immutable buffer', t => {
  const result = concatImmutables([]);
  t.true(result instanceof ArrayBuffer);
  t.is(result.byteLength, 0);
  // @ts-expect-error passStyleOf typing infers the wrong type for ArrayBuffer.
  t.is(passStyleOf(result), 'byteArray');
});

test('concatImmutables: concatenates multiple immutable buffers byte-for-byte', t => {
  const parts = [
    bytesToImmutable(new Uint8Array([1, 2, 3])),
    bytesToImmutable(new Uint8Array([])),
    bytesToImmutable(new Uint8Array([4])),
    bytesToImmutable(new Uint8Array([5, 6, 7, 8])),
  ];
  const result = concatImmutables(parts);
  t.is(result.byteLength, 8);
  t.deepEqual([...bytesFromImmutable(result)], [1, 2, 3, 4, 5, 6, 7, 8]);
  // @ts-expect-error passStyleOf typing infers the wrong type for ArrayBuffer.
  t.is(passStyleOf(result), 'byteArray');
});

test('concatImmutables: result is hardened', t => {
  const parts = [bytesToImmutable(new Uint8Array([42]))];
  const result = concatImmutables(parts);
  t.true(Object.isFrozen(result));
});
