// @ts-check

import test from '@endo/ses-ava/test.js';

import { random } from '../src/random.js';
import { makeSource, seedA, seedB, cloneSeed } from './_make-source.js';

test('random(source) yields values in [0, 1)', t => {
  const source = makeSource(cloneSeed(seedA));
  for (let i = 0; i < 1000; i += 1) {
    const x = random(source);
    t.true(Number.isFinite(x), 'finite');
    t.true(x >= 0, `x >= 0 (got ${x})`);
    t.true(x < 1, `x < 1 (got ${x})`);
  }
});

test('determinism: same seed produces same random() sequence', t => {
  const a = makeSource(cloneSeed(seedA));
  const b = makeSource(cloneSeed(seedA));
  for (let i = 0; i < 32; i += 1) {
    t.is(random(a), random(b), `random mismatch at index ${i}`);
  }
});

test('different seeds produce different random() sequences', t => {
  const a = makeSource(cloneSeed(seedA));
  const b = makeSource(cloneSeed(seedB));
  let differs = false;
  for (let i = 0; i < 8; i += 1) {
    if (random(a) !== random(b)) differs = true;
  }
  t.true(differs);
});

test('mean of 10000 random() samples is close to 0.5', t => {
  const source = makeSource(cloneSeed(seedA));
  const n = 10_000;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += random(source);
  const mean = sum / n;
  // True uniform stddev ~ sqrt(1/12) / sqrt(10000) ~= 0.00289.
  t.true(Math.abs(mean - 0.5) < 0.05, `mean=${mean}`);
});

// We expect random() to achieve a uniform distribution by scaling down
// randomUint53() output by exactly `2 ** -53`. We exercise the scaling at
// four distinct bit-pattern sources (one per test below): every bit set,
// every bit clear, the 52 lowest bits of the 53-bit integer set, and all 53
// bits set with the don't-care upper bits of the byte buffer cleared. The
// four sources pin both endpoints of the [0, 1) range and the midpoint, and
// demonstrate that the result is invariant under the 11 don't-care bits in
// the high octets of the 8-byte randomUint53 buffer (the implementation
// masks the upper 32 bits to 21, so bits 21..31 of the high half cannot
// influence the output).
//
// These tests are deliberately tight against the current randomUint53
// recipe (8 little-endian octets, high 11 bits of the upper half masked).
// The brittleness is a feature, not a bug: a refactor that changes how
// octets are folded into the 53-bit integer (different endianness,
// different consumption width, different mask shape) will trip these tests
// and force an explicit decision rather than silently changing the
// float-extraction behavior.

test('random() with all-bits-set source returns 1 - 2 ** -53', t => {
  /** @param {Uint8Array} out */
  const allSetSource = out => {
    for (let i = 0; i < out.length; i += 1) out[i] = 0xff;
  };
  t.is(random(allSetSource), 1 - 2 ** -53);
});

test('random() with all-bits-clear source returns 0', t => {
  /** @param {Uint8Array} out */
  const allClearSource = out => {
    for (let i = 0; i < out.length; i += 1) out[i] = 0x00;
  };
  t.is(random(allClearSource), 0);
});

test('random() with low-52-bits-set source returns 0.5 - 2 ** -53', t => {
  // Low 52 bits of the 53-bit integer set, bit 52 clear. With the
  // little-endian, low-32-then-high-21 recipe in randomUint53, the low
  // 32-bit half is bytes 0..3 and the high 21-bit half is bytes 4..7
  // masked to 0x1fffff. Setting bytes 0..5 fully (32 + 16 = 48 bits) and
  // byte 6 to 0x0f (4 more bits in positions 16..19 of the high half)
  // yields hi21 = 0x0fffff and lo = 0xffffffff, so the integer is
  // 2 ** 52 - 1 and the float is 0.5 - 2 ** -53.
  /** @param {Uint8Array} out */
  const lo52SetSource = out => {
    for (let i = 0; i < out.length; i += 1) out[i] = 0x00;
    for (let i = 0; i < 6; i += 1) out[i] = 0xff;
    if (out.length > 6) out[6] = 0x0f;
  };
  t.is(random(lo52SetSource), 0.5 - 2 ** -53);
});

test('random() with all-53-bits-set source returns 1 - 2 ** -53', t => {
  // All 53 bits of the 53-bit integer set, the 11 don't-care bits of the
  // 8-byte buffer (bits 21..31 of the high 32-bit half) clear. Byte 6's
  // low 5 bits contribute to hi21 and its high 3 bits do not; byte 7 is
  // entirely don't-care. Setting bytes 0..5 fully and byte 6 to 0x1f
  // (low 5 bits) with byte 7 clear yields hi21 = 0x1fffff and lo =
  // 0xffffffff, so the integer is 2 ** 53 - 1 and the float is
  // 1 - 2 ** -53. This source has the same float result as allSetSource
  // but a different byte pattern, which is precisely the don't-care-bit
  // invariance we want to lock in.
  /** @param {Uint8Array} out */
  const all53SetSource = out => {
    for (let i = 0; i < out.length; i += 1) out[i] = 0x00;
    for (let i = 0; i < 6; i += 1) out[i] = 0xff;
    if (out.length > 6) out[6] = 0x1f;
  };
  t.is(random(all53SetSource), 1 - 2 ** -53);
});

// Pinned golden vector: first random() outputs for a fixed seed.
// Computed from the implementation the day this test was authored.
// If a future change silently alters the keystream or the
// float-extraction recipe, this fails.
//
// These values come from running the pure-JavaScript path with
// seed = [0..31].  The keystream itself is independently exercised
// by the Strombergson ChaCha12 vector tests in
// `@endo/chacha12/test/chacha12.test.js`; this test pins the
// float-extraction recipe specifically.
test('golden vector: random() is deterministic for a fixed seed', t => {
  const source = makeSource(cloneSeed(seedA));
  const expected = [
    0.202_492_713_878_710_48, 0.028_544_973_487_591_55,
    0.210_785_924_224_731_08, 0.815_777_666_479_445_7,
  ];
  for (let i = 0; i < expected.length; i += 1) {
    t.is(random(source), expected[i], `random[${i}] matches golden`);
  }
});
