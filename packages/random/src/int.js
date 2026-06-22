// @ts-check
/* eslint no-bitwise: ["off"] */

import harden from '@endo/harden';

import {
  randomUint8,
  randomUint16,
  randomUint24,
  randomUint32,
  randomUint53,
} from './uint.js';

/** @import { RandomSource } from '../types.d.ts' */

/**
 * Returns a uniformly distributed integer in the closed interval
 * `[lo, hi]`.  Both bounds must be safe integers and `lo <= hi`.
 * `hi - lo + 1` must also be a safe integer.
 *
 * The sampler reads the fewest bytes necessary to either match the
 * requested range or cover at least two full repetitions of it,
 * discarding draws beyond the last full repetition to eliminate
 * modulo bias.  The per-draw reject probability `p` never exceeds
 * 0.5, and consecutive draws are independent, so the probability
 * of needing more than `k` draws is `p ** k` and the probability
 * of an unbounded reject sequence is 0 in the limit.  The expected
 * number of draws per call is `1 / (1 - p)`, bounded by 2.
 *
 * @param {RandomSource} source
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export const randomInt = (source, lo, hi) => {
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
    throw TypeError('randomInt: lo and hi must be integers');
  }
  if (lo > hi) {
    throw RangeError(`randomInt: lo (${lo}) must be <= hi (${hi})`);
  }
  const range = hi - lo + 1;
  if (!Number.isSafeInteger(range)) {
    throw RangeError(
      `randomInt: range hi - lo + 1 (${range}) must be a safe integer`,
    );
  }

  // Pick the smallest draw width that covers `range` with a reject
  // fraction below 0.5, and compute the corresponding `limit` (the
  // largest multiple of `range` not exceeding the draw width's
  // capacity).  Draws in `[limit, capacity)` are rejected.
  //
  // Why the staircase rather than always using the widest draw?
  // The narrow tiers conserve keystream bytes: `randomInt(0, 99)`
  // reads one byte per draw instead of eight.  For test fixtures and
  // fuzzing this is largely incidental, but the widths also bound
  // the *worst-case* reject fraction.  Always using a single fixed
  // width (e.g. 32 bits) leaves a pathological window: `randomInt(0,
  // 2 ** 31)` would have its limit fall at `2 ** 31 + 1` repetitions,
  // discarding nearly half of all draws.  Stepping up the width when
  // the range crosses a power-of-two ceiling caps the reject
  // fraction at 0.5 across the entire safe-integer domain.  The
  // `range === capacity` short-circuits avoid an off-by-one in the
  // exact-power case where `capacity % range === 0`.
  let draw;
  let limit;
  if (range === 0x100 || range <= 0x80) {
    draw = randomUint8;
    limit = 0x100 - (0x100 % range);
  } else if (range === 0x1_0000 || range <= 0x8000) {
    draw = randomUint16;
    limit = 0x1_0000 - (0x1_0000 % range);
  } else if (range === 0x100_0000 || range <= 0x80_0000) {
    draw = randomUint24;
    limit = 0x100_0000 - (0x100_0000 % range);
  } else if (range === 0x1_0000_0000 || range <= 0x8000_0000) {
    draw = randomUint32;
    limit = 0x1_0000_0000 - (0x1_0000_0000 % range);
  } else {
    draw = randomUint53;
    limit = Math.floor(9_007_199_254_740_992 / range) * range;
  }

  for (;;) {
    const u = draw(source);
    if (u < limit) {
      return lo + (u % range);
    }
  }
};
harden(randomInt);
