// @ts-check
/* eslint-disable no-bitwise */

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
  0x428a_2f98, 0x7137_4491, 0xb5c0_fbcf, 0xe9b5_dba5, 0x3956_c25b, 0x59f1_11f1,
  0x923f_82a4, 0xab1c_5ed5, 0xd807_aa98, 0x1283_5b01, 0x2431_85be, 0x550c_7dc3,
  0x72be_5d74, 0x80de_b1fe, 0x9bdc_06a7, 0xc19b_f174, 0xe49b_69c1, 0xefbe_4786,
  0x0fc1_9dc6, 0x240c_a1cc, 0x2de9_2c6f, 0x4a74_84aa, 0x5cb0_a9dc, 0x76f9_88da,
  0x983e_5152, 0xa831_c66d, 0xb003_27c8, 0xbf59_7fc7, 0xc6e0_0bf3, 0xd5a7_9147,
  0x06ca_6351, 0x1429_2967, 0x27b7_0a85, 0x2e1b_2138, 0x4d2c_6dfc, 0x5338_0d13,
  0x650a_7354, 0x766a_0abb, 0x81c2_c92e, 0x9272_2c85, 0xa2bf_e8a1, 0xa81a_664b,
  0xc24b_8b70, 0xc76c_51a3, 0xd192_e819, 0xd699_0624, 0xf40e_3585, 0x106a_a070,
  0x19a4_c116, 0x1e37_6c08, 0x2748_774c, 0x34b0_bcb5, 0x391c_0cb3, 0x4ed8_aa4a,
  0x5b9c_ca4f, 0x682e_6ff3, 0x748f_82ee, 0x78a5_636f, 0x84c8_7814, 0x8cc7_0208,
  0x90be_fffa, 0xa450_6ceb, 0xbef9_a3f7, 0xc671_78f2,
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
    0x6a09_e667, 0xbb67_ae85, 0x3c6e_f372, 0xa54f_f53a, 0x510e_527f,
    0x9b05_688c, 0x1f83_d9ab, 0x5be0_cd19,
  ]);
  const paddedLength = (((data.length + 8) >> 6) + 1) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = data.length * 8;
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  view.setUint32(
    paddedLength - 8,
    Math.floor(bitLength / 0x1_0000_0000),
    false,
  );

  const w = new Uint32Array(64);
  for (let block = 0; block < paddedLength; block += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(block + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
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
 * @param {Uint8Array} bytes
 * @returns {string}
 */
const toHex = bytes => {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
};

/**
 * Encode a byte sequence using one of the encodings supported by
 * Node's `Buffer.toString(encoding)` and reachable from the
 * `@endo/endo-fs` consumers (currently `'base64'` and `'hex'`).
 *
 * @param {Uint8Array} bytes
 * @param {string} encoding
 * @returns {string}
 */
const encodeBytes = (bytes, encoding) => {
  if (encoding === 'base64') return toBase64(bytes);
  if (encoding === 'hex') return toHex(bytes);
  throw new Error(`Unsupported digest encoding: ${encoding}`);
};

/**
 * Minimal `crypto.createHash` replacement (SHA-256 only).
 *
 * Throws for any algorithm other than `'sha256'` so consumers that
 * silently expected MD5/SHA-1/etc. fail fast — `node:crypto`
 * likewise throws (`ERR_OSSL_EVP_UNSUPPORTED`) on unknown
 * algorithms rather than degrading to a different digest.
 *
 * @param {string} algorithm
 */
export const createHash = algorithm => {
  if (algorithm !== 'sha256') {
    throw new Error(
      `node-crypto-shim only supports 'sha256', got ${JSON.stringify(algorithm)}`,
    );
  }
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
     * Returns the raw digest bytes or, when an encoding is given,
     * a string. The bytes case returns a `Uint8Array` whose
     * `toString(encoding)` mimics Node's `Buffer` so callers
     * such as `@endo/endo-fs/src/shared/blobref.js` can do
     * `hashBytes.toString('base64')` and `h[i]` interchangeably.
     *
     * @param {string} [encoding]
     * @returns {Uint8Array | string}
     */
    digest(encoding) {
      const bytes = sha256(buffer);
      if (encoding !== undefined) {
        return encodeBytes(bytes, encoding);
      }
      // Override `toString` so the returned bytes are Buffer-like.
      // Without this, `bytes.toString('base64')` falls through to
      // `Uint8Array.prototype.toString`, which ignores its argument
      // and returns a comma-separated decimal listing.
      Object.defineProperty(bytes, 'toString', {
        value: (/** @type {string} */ enc) =>
          enc === undefined
            ? Uint8Array.prototype.toString.call(bytes)
            : encodeBytes(bytes, enc),
        writable: false,
        enumerable: false,
        configurable: false,
      });
      return bytes;
    },
  };
  return hasher;
};
harden(createHash);

export default harden({ createHash });
