// @ts-check

import test from '@endo/ses-ava/test.js';

import { randomInt } from '../src/int.js';
import { makeSource, seedA, cloneSeed } from './_make-source.js';

test('randomInt(source, lo, hi) yields integers in the closed interval', t => {
  const source = makeSource(cloneSeed(seedA));
  for (let i = 0; i < 1000; i += 1) {
    const x = randomInt(source, -7, 11);
    t.true(Number.isInteger(x), `integer (got ${x})`);
    t.true(x >= -7 && x <= 11, `in [-7, 11] (got ${x})`);
  }
});

test('randomInt(source, lo, hi) covers both endpoints', t => {
  const source = makeSource(cloneSeed(seedA));
  let sawLo = false;
  let sawHi = false;
  for (let i = 0; i < 5000 && !(sawLo && sawHi); i += 1) {
    const x = randomInt(source, 0, 3);
    if (x === 0) sawLo = true;
    if (x === 3) sawHi = true;
  }
  t.true(sawLo, 'observed lo endpoint');
  t.true(sawHi, 'observed hi endpoint');
});

test('randomInt with lo === hi returns lo', t => {
  const source = makeSource(cloneSeed(seedA));
  for (let i = 0; i < 8; i += 1) {
    t.is(randomInt(source, 7, 7), 7);
  }
});

test('randomInt rejects non-integer / inverted bounds', t => {
  const source = makeSource(cloneSeed(seedA));
  t.throws(() => randomInt(source, 1.5, 10), { instanceOf: TypeError });
  t.throws(() => randomInt(source, 0, 10.5), { instanceOf: TypeError });
  t.throws(() => randomInt(source, /** @type {any} */ ('x'), 10), {
    instanceOf: TypeError,
  });
  t.throws(() => randomInt(source, 10, 5), { instanceOf: RangeError });
});

test('randomInt rejects unsafe range', t => {
  const source = makeSource(cloneSeed(seedA));
  t.throws(() => randomInt(source, -(2 ** 53), 2 ** 53), {
    instanceOf: RangeError,
  });
});

test('determinism: same seed produces same randomInt sequence', t => {
  const a = makeSource(cloneSeed(seedA));
  const b = makeSource(cloneSeed(seedA));
  for (let i = 0; i < 32; i += 1) {
    t.is(randomInt(a, 0, 999), randomInt(b, 0, 999));
  }
});

/** @typedef {import('../types.d.ts').RandomSource} RandomSource */

// Build a counting wrapper around a `RandomSource`.  Tracks the
// total number of bytes drawn so far so tests can assert how many
// keystream bytes a sampler consumed.
/** @param {RandomSource} inner */
const makeCountingSource = inner => {
  let bytes = 0;
  /** @type {RandomSource} */
  const wrapped = out => {
    inner(out);
    bytes += out.length;
  };
  return {
    source: wrapped,
    bytes: () => bytes,
    reset: () => {
      bytes = 0;
    },
  };
};

// Range-aware rejection sampling: each tier of the draw-width
// staircase covers a specific range domain.  This test exercises the
// boundaries: single-byte (range <= 128 and exact 256), two-byte (up
// to 32768 and exact 65536), three-byte (up to 8388608), four-byte
// (up to 2^31 and exact 2^32), and the 53-bit slow path (range >
// 2^32).  Each branch produces values in the requested closed
// interval.
test('randomInt covers expected ranges across draw widths', t => {
  const source = makeSource(cloneSeed(seedA));
  // single-byte path with reject set
  for (let i = 0; i < 100; i += 1) {
    const x = randomInt(source, 0, 99);
    t.true(x >= 0 && x <= 99);
  }
  // single-byte path, exact power of two — no rejection
  for (let i = 0; i < 100; i += 1) {
    const x = randomInt(source, 0, 255);
    t.true(x >= 0 && x <= 255);
  }
  // two-byte path
  for (let i = 0; i < 100; i += 1) {
    const x = randomInt(source, 0, 9999);
    t.true(x >= 0 && x <= 9999);
  }
  // three-byte path: range 1_000_000 sits in (2 ** 16, 2 ** 23]
  for (let i = 0; i < 100; i += 1) {
    const x = randomInt(source, 0, 999_999);
    t.true(x >= 0 && x <= 999_999);
  }
  // four-byte path: range 2 ** 30 sits in (2 ** 23, 2 ** 31]
  const HI32 = 0x4000_0000;
  for (let i = 0; i < 50; i += 1) {
    const x = randomInt(source, 0, HI32 - 1);
    t.true(x >= 0 && x < HI32);
  }
  // 53-bit slow path: range > 2 ** 32
  const HI53_LO = -(2 ** 40);
  const HI53_HI = 2 ** 40;
  for (let i = 0; i < 50; i += 1) {
    const x = randomInt(source, HI53_LO, HI53_HI);
    t.true(x >= HI53_LO && x <= HI53_HI);
    t.true(Number.isSafeInteger(x));
  }
});

// Byte-count expectations: each tier of the staircase reads a
// specific number of bytes per draw.  When the range is an exact
// power of two (or 256/65536/...) every draw is accepted; the
// per-call byte count is the draw width exactly.  These assertions
// pin the staircase classification, so a regression that bumps a
// range into the wrong tier (and thus over-reads keystream bytes per
// call) fails this test rather than silently degrading throughput.
test('randomInt reads the expected number of bytes per draw width', t => {
  const expectations = [
    { lo: 0, hi: 0xff, bytesPerDraw: 1, label: '8-bit (exact 256)' },
    {
      lo: 0,
      hi: 0x7f,
      bytesPerDraw: 1,
      label: '8-bit (range 128, no rejection)',
    },
    { lo: 0, hi: 0xffff, bytesPerDraw: 2, label: '16-bit (exact 65536)' },
    {
      lo: 0,
      hi: 0x7fff,
      bytesPerDraw: 2,
      label: '16-bit (range 32768, no rejection)',
    },
    { lo: 0, hi: 0xff_ffff, bytesPerDraw: 3, label: '24-bit (exact 16M)' },
    {
      lo: 0,
      hi: 0x7f_ffff,
      bytesPerDraw: 3,
      label: '24-bit (range 2^23, no rejection)',
    },
    { lo: 0, hi: 0xffff_ffff, bytesPerDraw: 4, label: '32-bit (exact 2^32)' },
    {
      lo: 0,
      hi: 0x7fff_ffff,
      bytesPerDraw: 4,
      label: '32-bit (range 2^31, no rejection)',
    },
    {
      lo: -(2 ** 40),
      hi: 2 ** 40 - 1,
      bytesPerDraw: 8,
      label: '53-bit slow path (range 2^41, no rejection)',
    },
  ];
  for (const { lo, hi, bytesPerDraw, label } of expectations) {
    const counted = makeCountingSource(makeSource(cloneSeed(seedA)));
    const draws = 32;
    for (let i = 0; i < draws; i += 1) {
      randomInt(counted.source, lo, hi);
    }
    // No rejection on these ranges, so byte count is exact.
    t.is(
      counted.bytes(),
      draws * bytesPerDraw,
      `${label}: ${draws} draws should read ${draws * bytesPerDraw} bytes`,
    );
  }
});

// When the range forces rejection, the byte count is at least
// `draws * bytesPerDraw` (every draw reads its width) but may be
// higher when the source returns a value above the acceptance limit.
// We assert the lower bound and a reasonable upper bound derived
// from the staircase's reject-fraction cap of 0.5.
test('randomInt with rejection reads at least the draw width per call', t => {
  // Range 100: 1-byte staircase, reject set is [200, 256), so
  // reject fraction 56/256 ~ 0.22.
  const counted = makeCountingSource(makeSource(cloneSeed(seedA)));
  const draws = 1000;
  for (let i = 0; i < draws; i += 1) {
    randomInt(counted.source, 0, 99);
  }
  t.true(
    counted.bytes() >= draws,
    `at least ${draws} bytes for ${draws} 1-byte draws`,
  );
  // The staircase caps the reject fraction at 0.5, so expected
  // bytes <= 2 * draws.  Allow a generous margin for stochastic
  // tail behavior in the seeded sequence.
  t.true(
    counted.bytes() <= draws * 4,
    `should not exceed 4x byte count, got ${counted.bytes()} bytes`,
  );
});
