// @ts-check
/* eslint no-bitwise: ["off"] */

// Little-endian unsigned-integer readers over a `RandomSource`.  Used
// by `random()` and `randomInt()` to assemble fixed-width unsigned
// values from random bytes.  Names follow the `Uint8Array` /
// `Uint16Array` precedent: bit width is part of the function name.
//
// All readers share a single 8-byte `ArrayBuffer` at module scope.
// Each reader has its own pre-allocated zero-offset `Uint8Array` view
// (one per width) so the hot path never calls `subarray`; a previous
// experiment measured per-call `subarray(0, n)` at ~2.5x slower on the
// int paths under Node 22 / x64, attributed to both the per-call
// allocation and the non-zero-offset view confusing V8's element-kind
// specialization.  Pre-allocated zero-offset views avoid both.
//
// After each read, the reader zeroes the prefix it used so no
// random bytes linger in module state across calls (in particular
// across mixed-width call chains).  The zeroing cost was measured
// at <3% of the per-call total, which is below the security
// tradeoff threshold; we keep it.

import harden from '@endo/harden';

/** @import { RandomSource } from '../types.d.ts' */

const BUFFER = new ArrayBuffer(8);
const VIEW = new DataView(BUFFER);

const BUF1 = new Uint8Array(BUFFER, 0, 1);
const BUF2 = new Uint8Array(BUFFER, 0, 2);
const BUF3 = new Uint8Array(BUFFER, 0, 3);
const BUF4 = new Uint8Array(BUFFER, 0, 4);
const BUF8 = new Uint8Array(BUFFER, 0, 8);

/**
 * @param {RandomSource} source
 * @returns {number} unsigned 8-bit integer
 */
export const randomUint8 = source => {
  source(BUF1);
  const u = BUF1[0];
  BUF1[0] = 0;
  return u;
};
harden(randomUint8);

/**
 * @param {RandomSource} source
 * @returns {number} unsigned 16-bit integer
 */
export const randomUint16 = source => {
  source(BUF2);
  const u = VIEW.getUint16(0, true);
  BUF2[0] = 0;
  BUF2[1] = 0;
  return u;
};
harden(randomUint16);

/**
 * @param {RandomSource} source
 * @returns {number} unsigned 24-bit integer
 */
export const randomUint24 = source => {
  source(BUF3);
  // No native getUint24; combine 16-bit + 8-bit reads.
  const u = VIEW.getUint16(0, true) | (BUF3[2] << 16);
  BUF3[0] = 0;
  BUF3[1] = 0;
  BUF3[2] = 0;
  return u >>> 0;
};
harden(randomUint24);

/**
 * @param {RandomSource} source
 * @returns {number} unsigned 32-bit integer
 */
export const randomUint32 = source => {
  source(BUF4);
  const u = VIEW.getUint32(0, true);
  BUF4[0] = 0;
  BUF4[1] = 0;
  BUF4[2] = 0;
  BUF4[3] = 0;
  return u;
};
harden(randomUint32);

/**
 * Assembles an unsigned 53-bit integer from 8 bytes.  The high 11
 * bits of the upper 32-bit half are masked to 0 so the result is a
 * non-negative IEEE-754 safe integer.
 *
 * @param {RandomSource} source
 * @returns {number} unsigned 53-bit integer
 */
export const randomUint53 = source => {
  source(BUF8);
  const lo = VIEW.getUint32(0, true);
  const hi21 = VIEW.getUint32(4, true) & 0x1f_ffff;
  for (let i = 0; i < 8; i += 1) BUF8[i] = 0;
  return hi21 * 4_294_967_296 + lo;
};
harden(randomUint53);
