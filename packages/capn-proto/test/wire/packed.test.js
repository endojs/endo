// @ts-nocheck
import test from '@endo/ses-ava/test.js';
import { pack, unpack } from '../../src/wire/packed.js';

const word = bytes => {
  if (bytes.length !== 8) throw Error('word must be 8 bytes');
  return new Uint8Array(bytes);
};

const concat = (...arrs) => {
  let total = 0;
  for (const a of arrs) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
};

const u8eq = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
};

test('pack/unpack: empty input', t => {
  const packed = pack(new Uint8Array(0));
  t.is(packed.byteLength, 0);
  t.is(unpack(packed).byteLength, 0);
});

test('pack: single zero word emits two-byte run', t => {
  const u = word([0, 0, 0, 0, 0, 0, 0, 0]);
  const p = new Uint8Array(pack(u));
  // tag=0x00, runCount=0 (one word total)
  t.deepEqual(Array.from(p), [0x00, 0x00]);
  const back = new Uint8Array(unpack(p));
  t.true(u8eq(back, u));
});

test('pack: run of N zero words encoded as one tag + count', t => {
  const u = new Uint8Array(8 * 5); // 5 zero words
  const p = new Uint8Array(pack(u));
  // tag=0x00, count=4 (4 additional zero words)
  t.deepEqual(Array.from(p), [0x00, 0x04]);
  t.true(u8eq(new Uint8Array(unpack(p)), u));
});

test('pack: full nonzero word emits 0xff + 8 bytes + 0 count', t => {
  const u = word([1, 2, 3, 4, 5, 6, 7, 8]);
  const p = new Uint8Array(pack(u));
  // tag=0xff, then 8 raw bytes, then 0 (no literal run follows)
  t.deepEqual(Array.from(p), [0xff, 1, 2, 3, 4, 5, 6, 7, 8, 0x00]);
  t.true(u8eq(new Uint8Array(unpack(p)), u));
});

test('pack: mixed word emits tag + only the non-zero bytes', t => {
  const u = word([0, 0xab, 0, 0xcd, 0, 0, 0xef, 0]);
  const p = new Uint8Array(pack(u));
  // bits set at positions 1, 3, 6 → tag = 0b01001010 = 0x4a
  t.deepEqual(Array.from(p), [0x4a, 0xab, 0xcd, 0xef]);
  t.true(u8eq(new Uint8Array(unpack(p)), u));
});

test('round-trip: zero / mixed / full / zero pattern', t => {
  const u = concat(
    word([0, 0, 0, 0, 0, 0, 0, 0]),
    word([0, 1, 2, 0, 0, 3, 0, 4]),
    word([1, 2, 3, 4, 5, 6, 7, 8]),
    word([0, 0, 0, 0, 0, 0, 0, 0]),
    word([0, 0, 0, 0, 0, 0, 0, 0]),
  );
  const p = pack(u);
  const back = new Uint8Array(unpack(p));
  t.true(u8eq(back, u), 'round-trip preserves bytes');
  t.true(p.byteLength < u.byteLength, 'packed is smaller');
});

test('pack rejects non-multiple-of-8 input', t => {
  t.throws(() => pack(new Uint8Array(7)));
});

test('unpack throws on truncated zero-run header', t => {
  // tag=0 followed by no count byte
  t.throws(() => unpack(new Uint8Array([0])));
});

test('unpack throws on truncated mixed word', t => {
  // tag=0x01 (one byte expected) but no payload
  t.throws(() => unpack(new Uint8Array([0x01])));
});

test('round-trip: large random buffer is byte-identical', t => {
  // 1024 words = 8192 bytes. Pseudo-random with many zero runs.
  const n = 1024;
  const u = new Uint8Array(n * 8);
  // Sprinkle non-zero bytes at deterministic positions.
  for (let i = 0; i < n * 8; i += 13) {
    u[i] = (i * 31) & 0xff;
  }
  const p = pack(u);
  const back = new Uint8Array(unpack(p));
  t.true(u8eq(back, u));
});
