// @ts-check
/* eslint no-bitwise: ["off"] */

// Local ChaCha20 keystream generator used only by the comparative
// benchmark in `random.bench.js`.  Mirrors `@endo/chacha12`'s
// `makeChaCha12` byte for byte except the inner loop runs 10
// double-rounds (20 rounds) instead of 6 (12 rounds); kept inline as
// a comparison baseline rather than as a published package.

import harden from '@endo/harden';

const ROUNDS = 20;
const BLOCK_SIZE = 64;

const C0 = 0x6170_7865;
const C1 = 0x3320_646e;
const C2 = 0x7962_2d32;
const C3 = 0x6b20_6574;

const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0;

const quarterRound = (state, a, b, c, d) => {
  let xa = state[a];
  let xb = state[b];
  let xc = state[c];
  let xd = state[d];
  xa = (xa + xb) >>> 0;
  xd = rotl(xd ^ xa, 16);
  xc = (xc + xd) >>> 0;
  xb = rotl(xb ^ xc, 12);
  xa = (xa + xb) >>> 0;
  xd = rotl(xd ^ xa, 8);
  xc = (xc + xd) >>> 0;
  xb = rotl(xb ^ xc, 7);
  state[a] = xa;
  state[b] = xb;
  state[c] = xc;
  state[d] = xd;
};

const WORKING = new Uint32Array(16);

const chacha20Block = (state, out) => {
  const working = WORKING;
  for (let i = 0; i < 16; i += 1) working[i] = state[i];
  for (let i = 0; i < ROUNDS; i += 2) {
    quarterRound(working, 0, 4, 8, 12);
    quarterRound(working, 1, 5, 9, 13);
    quarterRound(working, 2, 6, 10, 14);
    quarterRound(working, 3, 7, 11, 15);
    quarterRound(working, 0, 5, 10, 15);
    quarterRound(working, 1, 6, 11, 12);
    quarterRound(working, 2, 7, 8, 13);
    quarterRound(working, 3, 4, 9, 14);
  }
  // Match @endo/chacha12's shift-OR write strategy so the bench
  // compares the algorithms, not the byte-store strategies.
  for (let i = 0; i < 16; i += 1) {
    const v = (working[i] + state[i]) >>> 0;
    const off = i * 4;
    out[off] = v & 0xff;
    out[off + 1] = (v >>> 8) & 0xff;
    out[off + 2] = (v >>> 16) & 0xff;
    out[off + 3] = (v >>> 24) & 0xff;
  }
  for (let i = 0; i < 16; i += 1) working[i] = 0;
};

/**
 * Returns a `(out: Uint8Array) => void` keystream source: same shape
 * as `@endo/chacha12`'s `makeChaCha12`, so the bench can drive both
 * uniformly.  The allocation of `baseState` here is unavoidable: the
 * state array carries the keystream across calls and cannot live at
 * module scope without making the factory non-reentrant.
 *
 * @param {Uint8Array} key 32-byte key.
 * @returns {(out: Uint8Array) => void}
 */
export const makeChaCha20 = key => {
  if (!(key instanceof Uint8Array) || key.length !== 32) {
    throw TypeError('chacha20 key must be a 32-byte Uint8Array');
  }
  const baseState = new Uint32Array(16);
  baseState[0] = C0;
  baseState[1] = C1;
  baseState[2] = C2;
  baseState[3] = C3;
  for (let i = 0; i < 8; i += 1) {
    const off = i * 4;
    baseState[4 + i] =
      (key[off] |
        (key[off + 1] << 8) |
        (key[off + 2] << 16) |
        (key[off + 3] << 24)) >>>
      0;
  }
  const block = new Uint8Array(BLOCK_SIZE);
  let offset = BLOCK_SIZE;
  let counter = 0;
  const refill = () => {
    if (counter >= 0x1_0000_0000) {
      throw RangeError('chacha20 counter overflow');
    }
    baseState[12] = counter >>> 0;
    chacha20Block(baseState, block);
    counter += 1;
    offset = 0;
  };
  const fillRandomBytes = out => {
    if (!(out instanceof Uint8Array)) {
      throw TypeError('chacha20 source: out must be a Uint8Array');
    }
    let i = 0;
    const end = out.length;
    while (i < end) {
      if (offset >= BLOCK_SIZE) refill();
      const available = BLOCK_SIZE - offset;
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
harden(makeChaCha20);
