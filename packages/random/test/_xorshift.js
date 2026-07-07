// @ts-check
/* eslint-disable no-bitwise */

// xorshift128+ baseline used only by the comparative bench in
// `random.bench.js`.  Wraps the underlying 64-bit-int generator in a
// `(out: Uint8Array) => void` filling function so the bench can drive
// xorshift, ChaCha20, and ChaCha12 through the same source contract.
//
// Underlying 64-bit core forked from
// https://github.com/AndreasMadsen/xorshift/blob/d60ca9ca341957a9824908f733f30ce4592c9af4/xorshift.js

import harden from '@endo/harden';

/**
 * Underlying 64-bit xorshift128+ state.
 *
 * @param {number[]} seed "128-bit" integer, composed of 4x32-bit
 * integers in big endian order.
 */
const makeCore = seed => {
  if (!Array.isArray(seed) || seed.length !== 4) {
    throw TypeError('seed must be an array with 4 numbers');
  }
  let state0U = seed[0] | 0;
  let state0L = seed[1] | 0;
  let state1U = seed[2] | 0;
  let state1L = seed[3] | 0;

  /** @returns {[number, number]} */
  const randomint = () => {
    let s1U = state0U;
    let s1L = state0L;
    const s0U = state1U;
    const s0L = state1L;

    const sumL = (s0L >>> 0) + (s1L >>> 0);
    const resU = (s0U + s1U + ((sumL / 2) >>> 31)) >>> 0;
    const resL = sumL >>> 0;

    state0U = s0U;
    state0L = s0L;

    let t1U = 0;
    let t1L = 0;
    let t2U = 0;
    let t2L = 0;

    const a1 = 23;
    const m1 = 0xffff_ffff << (32 - a1);
    t1U = (s1U << a1) | ((s1L & m1) >>> (32 - a1));
    t1L = s1L << a1;
    s1U ^= t1U;
    s1L ^= t1L;

    t1U = s1U ^ s0U;
    t1L = s1L ^ s0L;
    const a2 = 18;
    const m2 = 0xffff_ffff >>> (32 - a2);
    t2U = s1U >>> a2;
    t2L = (s1L >>> a2) | ((s1U & m2) << (32 - a2));
    t1U ^= t2U;
    t1L ^= t2L;
    const a3 = 5;
    const m3 = 0xffff_ffff >>> (32 - a3);
    t2U = s0U >>> a3;
    t2L = (s0L >>> a3) | ((s0U & m3) << (32 - a3));
    t1U ^= t2U;
    t1L ^= t2L;

    state1U = t1U;
    state1L = t1L;

    return [resU, resL];
  };

  return { randomint };
};

/**
 * Returns a `(out: Uint8Array) => void` source backed by xorshift128+.
 * Each 8-byte chunk consumes one 64-bit draw; trailing partial chunks
 * use only as many bytes as needed and discard the rest.
 *
 * @param {number[]} seed
 * @returns {(out: Uint8Array) => void}
 */
export const makeXorShift = seed => {
  const core = makeCore(seed);
  const block = new Uint8Array(8);
  const view = new DataView(block.buffer);
  let offset = 8;
  const refill = () => {
    const [u, l] = core.randomint();
    view.setUint32(0, u >>> 0, true);
    view.setUint32(4, l >>> 0, true);
    offset = 0;
  };
  const fillRandomBytes = out => {
    if (!(out instanceof Uint8Array)) {
      throw TypeError('xorshift source: out must be a Uint8Array');
    }
    let i = 0;
    const end = out.length;
    while (i < end) {
      if (offset >= 8) refill();
      const available = 8 - offset;
      const want = end - i;
      const n = available < want ? available : want;
      for (let k = 0; k < n; k += 1) {
        out[i + k] = block[offset + k];
      }
      offset += n;
      i += n;
    }
  };
  return harden(fillRandomBytes);
};
harden(makeXorShift);
