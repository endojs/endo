/* eslint-disable no-bitwise, @endo/restrict-comparison-operands */
/* global process */

// Benchmark: decode paths.  Compares the lookup-table decoder (kept
// here for comparison; not shipped) against the shipped charcode-
// arithmetic decoder across small (32 B), medium (256 B), and large
// (1 MiB) inputs, plus a worst-case run that forces the error path on
// every call.
//
// Run with `node test/decode.bench.js` from `packages/hex/`.
// Generates a deterministic input and times each decoder across
// several iterations.

import { jsDecodeHex as shippedDecode } from '../src/decode.js';
// `_xorshift.js` is a copy of `packages/ocapn/test/_xorshift.js`; if
// either is updated, the other should be kept in sync, and ideally we
// should factor the PRNG out into a shared test helper.
import { XorShift } from './_xorshift.js';

const hexAlphabet = '0123456789abcdef';

// Reference table-based decoder, retained here for comparison.
const hexDigitTable = (() => {
  const table = new Array(256).fill(-1);
  for (let i = 0; i < 10; i += 1) table['0'.charCodeAt(0) + i] = i;
  for (let i = 0; i < 6; i += 1) {
    table['a'.charCodeAt(0) + i] = 10 + i;
    table['A'.charCodeAt(0) + i] = 10 + i;
  }
  return Object.freeze(table);
})();

/**
 * @param {string} string
 * @param {string} [name]
 * @returns {Uint8Array}
 */
const tableDecode = (string, name = '<unknown>') => {
  if (string.length % 2 !== 0) {
    throw Error(
      `Hex string must have an even length, got ${string.length} in string ${name}`,
    );
  }
  const bytes = new Uint8Array(string.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const hi = hexDigitTable[string.charCodeAt(i * 2)] ?? -1;
    const lo = hexDigitTable[string.charCodeAt(i * 2 + 1)] ?? -1;
    if (hi < 0 || lo < 0) {
      throw Error(
        `Invalid hex character at offset ${
          hi < 0 ? i * 2 : i * 2 + 1
        } of string ${name}`,
      );
    }
    bytes[i] = (hi << 4) | lo;
  }
  return bytes;
};

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

const encode = bytes => {
  const chars = new Array(bytes.length * 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    const j = i * 2;
    chars[j] = hexAlphabet[(b >>> 4) & 0x0f];
    chars[j + 1] = hexAlphabet[b & 0x0f];
  }
  return chars.join('');
};

/**
 * @param {string} label
 * @param {number} size   bytes processed per iteration (for throughput)
 * @param {number} iters
 * @param {() => unknown} fn
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
  const hex = encode(bytes);

  // Sanity check both decoders agree on clean input.
  const a = tableDecode(hex);
  const b = shippedDecode(hex);
  if (a.length !== b.length) throw Error('length mismatch');
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) throw Error(`mismatch at ${i}`);
  }

  console.log(`Input: ${size} bytes (${hex.length} hex chars), ${iters} iter`);
  time('table lookup decoder', size, iters, () => tableDecode(hex));
  time('shipped arithmetic decoder', size, iters, () => shippedDecode(hex));
  console.log('');
};

/**
 * Worst-case: every call throws at the first byte.  Measures the error
 * path, not the happy path.  Reports op/s rather than MiB/s since
 * throughput is meaningless for a throw-on-first-byte benchmark.
 *
 * @param {number} iters
 */
const runWorstCase = iters => {
  const bad = `gg${'aa'.repeat(31)}`;
  const swallow = () => {};
  const run = fn => {
    // Warm-up.
    try {
      fn();
    } catch (_) {
      swallow();
    }
    try {
      fn();
    } catch (_) {
      swallow();
    }
    const start = process.hrtime.bigint();
    for (let i = 0; i < iters; i += 1) {
      try {
        fn();
      } catch (_) {
        swallow();
      }
    }
    const elapsedNs = Number(process.hrtime.bigint() - start);
    return {
      perIterUs: elapsedNs / iters / 1e3,
      opsPerSec: iters / (elapsedNs / 1e9),
    };
  };
  console.log(`Worst case: 64-char string, first byte invalid, ${iters} iter`);
  const t = run(() => tableDecode(bad));
  console.log(
    `  ${'table lookup decoder'.padEnd(32)} ${t.perIterUs.toFixed(3).padStart(9)} us/iter  ` +
      `${(t.opsPerSec / 1e6).toFixed(2).padStart(7)} Mop/s`,
  );
  const s = run(() => shippedDecode(bad));
  console.log(
    `  ${'shipped arithmetic decoder'.padEnd(32)} ${s.perIterUs.toFixed(3).padStart(9)} us/iter  ` +
      `${(s.opsPerSec / 1e6).toFixed(2).padStart(7)} Mop/s`,
  );
  console.log('');
};

console.log(`Node ${process.versions.node}, V8 ${process.versions.v8}`);
console.log('');

// Small inputs: typical digest/signature sizes.
runSize(32, 200000);
runSize(256, 50000);
// Large input: 1 MiB.
runSize(1 << 20, 20);
runWorstCase(50000);
