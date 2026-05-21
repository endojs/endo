// @ts-check
/* eslint-disable no-bitwise */
/* global btoa */

// Browser stand-in for the slice of `node:crypto` reachable from
// `@endo/endo-fs` (`src/shared/blobref.js` and `src/from-mount.js`).
// Vite aliases `node:crypto` to this module for the chat bundle.
//
// A real SHA-256 is implemented here rather than a placeholder so
// the explorer's content-addressed read cache (`withCachedReads`)
// keys blobs on a collision-resistant digest — a weaker hash could
// serve one file's bytes for another.

import harden from '@endo/harden';

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * @param {number} x
 * @param {number} n
 * @returns {number}
 */
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/**
 * Compute the SHA-256 digest of a byte sequence.
 *
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
const sha256 = data => {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const paddedLength = (((data.length + 8) >> 6) + 1) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = data.length * 8;
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);

  const w = new Uint32Array(64);
  for (let block = 0; block < paddedLength; block += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(block + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 =
        rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];
    for (let i = 0; i < 64; i += 1) {
      const bigS1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + bigS1 + ch + K[i] + w[i]) | 0;
      const bigS0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (bigS0 + maj) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i += 1) {
    outView.setUint32(i * 4, h[i] >>> 0, false);
  }
  return out;
};

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
const toBase64 = bytes => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

/**
 * Minimal `crypto.createHash` replacement (SHA-256 only).
 *
 * @param {string} [_algorithm]
 */
export const createHash = _algorithm => {
  let buffer = new Uint8Array(0);
  const hasher = {
    /**
     * @param {Uint8Array | string} chunk
     */
    update(chunk) {
      const next =
        typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk;
      const merged = new Uint8Array(buffer.length + next.length);
      merged.set(buffer);
      merged.set(next, buffer.length);
      buffer = merged;
      return hasher;
    },
    /**
     * Returns the raw digest bytes (indexable, as `node:crypto`
     * callers expect) or, when an encoding is given, a string.
     *
     * @param {string} [encoding]
     * @returns {Uint8Array | string}
     */
    digest(encoding) {
      const bytes = sha256(buffer);
      return encoding === undefined ? bytes : toBase64(bytes);
    },
  };
  return hasher;
};
harden(createHash);

export default harden({ createHash });
