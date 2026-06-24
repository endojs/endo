// @ts-check

// Test helper: build a ChaCha12-backed `RandomSource`.

import { makeChaCha12 } from '@endo/chacha12';

const seedAll = (() => {
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) seed[i] = i;
  return seed;
})();

const seedRev = (() => {
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) seed[i] = 31 - i;
  return seed;
})();

/** @param {Uint8Array} seed */
export const makeSource = seed => makeChaCha12(seed).fillRandomBytes;

export const seedA = seedAll;
export const seedB = seedRev;

export const cloneSeed = s => Uint8Array.from(s);
