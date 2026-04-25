/* eslint-disable no-bitwise, @endo/restrict-comparison-operands */
/* global process */

// Benchmark: hex encoding strategies across digest-sized (32 B),
// bulk-medium (256 B), and large (1 MiB) inputs.  Compares:
//   - polyfill lowercase (jsEncodeHex)
//   - native Uint8Array.prototype.toHex (lowercase; shipped fast path)
//
// Run from `packages/hex/`:
//   node --js-base-64 test/encode.bench.js
// (The `--js-base-64` flag is only required on engines where the
// TC39 proposal-arraybuffer-base64 intrinsic is behind a flag, e.g.
// Node 24.  On engines where the intrinsic has shipped unconditionally
// the flag is unnecessary.  When the intrinsic is absent the
// native-based variants are skipped.)

import { jsEncodeHex } from '../src/encode.js';
// `_xorshift.js` is a copy of `packages/ocapn/test/_xorshift.js`; if
// either is updated, the other should be kept in sync, and ideally we
// should factor the PRNG out into a shared test helper.
import { XorShift } from './_xorshift.js';

const toHex = /** @type {any} */ (Uint8Array.prototype).toHex;
const nativeToHex =
  typeof toHex === 'function' ? /** @type {() => string} */ (toHex) : undefined;

// Deterministic PRNG, same seed shape as other Endo fuzz tests.
const defaultSeed = [0xb0b5c0ff, 0xeefacade, 0xb0b5c0ff, 0xeefacade];
const makeBytes = size => {
  const bytes = new Uint8Array(size);
  const prng = new XorShift(defaultSeed);
  for (let i = 0; i < size; i += 1) {
    bytes[i] = Math.floor(prng.random() * 256);
  }
  return bytes;
};

/**
 * @param {string} label
 * @param {number} size   bytes processed per iteration
 * @param {number} iters
 * @param {() => string} fn
 */
const time = (label, size, iters, fn) => {
  // Warm-up.
  fn();
  fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iters; i += 1) {
    fn();
  }
  const elapsedNs = Number(process.hrtime.bigint() - start);
  const perIterMs = elapsedNs / iters / 1e6;
  const mibPerSec = (size * iters) / (elapsedNs / 1e9) / (1 << 20);
  console.log(
    `  ${label.padEnd(32)} ${perIterMs.toFixed(4).padStart(9)} ms/iter  ` +
      `${mibPerSec.toFixed(1).padStart(7)} MiB/s`,
  );
};

/**
 * @param {number} size
 * @param {number} iters
 */
const runSize = (size, iters) => {
  const bytes = makeBytes(size);

  // Sanity-check polyfill and native agree on the lowercase output.
  const expected = jsEncodeHex(bytes);
  if (nativeToHex !== undefined) {
    const viaNative = nativeToHex.call(bytes);
    if (viaNative !== expected) {
      throw Error('native toHex mismatch');
    }
  }

  console.log(`Input: ${size} bytes (${size * 2} hex chars), ${iters} iter`);
  time('polyfill lowercase', size, iters, () => jsEncodeHex(bytes));
  if (nativeToHex !== undefined) {
    time('native lowercase', size, iters, () => nativeToHex.call(bytes));
  } else {
    console.log('  (native Uint8Array.prototype.toHex unavailable; skipped)');
  }
  console.log('');
};

console.log(
  `Node ${process.versions.node}, V8 ${process.versions.v8}, ` +
    `native toHex: ${nativeToHex !== undefined ? 'yes' : 'no'}`,
);
console.log('');

runSize(32, 200000);
runSize(256, 50000);
runSize(1 << 20, 20);
