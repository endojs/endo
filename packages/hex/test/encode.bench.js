/* eslint-disable no-bitwise, @endo/restrict-comparison-operands */
/* global globalThis */

// Benchmark: hex encoding strategies across digest-sized (32 B),
// bulk-medium (256 B), and large (1 MiB) inputs.  Engine-portable —
// runs under both V8 (Node) and XS via eshost.  See
// `test/run-benches.sh` for the multi-engine driver.
//
// Variants compared:
//   1. polyfill (shipped jsEncodeHex):
//      pre-allocated Array of nibble characters, two lookups per
//      byte from a 16-character alphabet string, joined at the end.
//   2. nibble-array-table:  alphabet as a 16-element Array.
//   3. nibble-null-object:  alphabet as a null-prototype object
//      keyed by nibble integer.
//   4. nibble-Map:  Map<nibble, char>.
//   5. byte-array-table:  256-element Array of two-character strings;
//      one lookup per byte.
//   6. byte-Map:  Map<byte, twoChar>; one lookup per byte.
//   7. arithmetic charcode:  computes char codes directly via
//      shift+offset and String.fromCharCode, no alphabet lookup.
//   8. native Uint8Array.prototype.toHex (when available; the shipped
//      `encodeHex` dispatches here).
//
// Run from `packages/hex/`:
//   node test/encode.bench.js                 (V8/Node)
//   xst test/encode.bench.js                  (XS direct, ESM)
//   ./test/run-benches.sh                      (rolls up + eshost)
//
// On engines without the native TC39 `Uint8Array.prototype.toHex`
// intrinsic, the native variant is skipped.

import { makeChaCha12 } from '@endo/chacha12';
import { bobsCoffee32 } from '@endo/random/seeds.js';
import { jsEncodeHex } from '../src/encode.js';

// Engine-portable nanosecond timer.  V8/Node prefers process.hrtime;
// fall back to Date.now() under XS and other engines.
const hasHrtime =
  typeof globalThis.process === 'object' &&
  globalThis.process !== null &&
  typeof globalThis.process.hrtime === 'function' &&
  typeof globalThis.process.hrtime.bigint === 'function';
const nowNs = hasHrtime
  ? () => Number(globalThis.process.hrtime.bigint())
  : () => Date.now() * 1_000_000;

const lower = '0123456789abcdef';

// Variant tables.

const nibbleArrayTable = lower.split('');

const nibbleNullObjectTable = (() => {
  const t = Object.create(null);
  for (let i = 0; i < 16; i += 1) t[i] = lower[i];
  return t;
})();

const nibbleMapTable = (() => {
  const m = new Map();
  for (let i = 0; i < 16; i += 1) m.set(i, lower[i]);
  return m;
})();

const byteArrayTable = (() => {
  const t = new Array(256);
  for (let b = 0; b < 256; b += 1) {
    t[b] = lower[b >>> 4] + lower[b & 0x0f];
  }
  return t;
})();

const byteMapTable = (() => {
  const m = new Map();
  for (let b = 0; b < 256; b += 1) {
    m.set(b, lower[b >>> 4] + lower[b & 0x0f]);
  }
  return m;
})();

// Variant encoders.

const encodeNibbleArray = bytes => {
  const chars = new Array(bytes.length * 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    const j = i * 2;
    chars[j] = nibbleArrayTable[b >>> 4];
    chars[j + 1] = nibbleArrayTable[b & 0x0f];
  }
  return chars.join('');
};

const encodeNibbleNullObject = bytes => {
  const chars = new Array(bytes.length * 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    const j = i * 2;
    chars[j] = nibbleNullObjectTable[b >>> 4];
    chars[j + 1] = nibbleNullObjectTable[b & 0x0f];
  }
  return chars.join('');
};

const encodeNibbleMap = bytes => {
  const chars = new Array(bytes.length * 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    const j = i * 2;
    chars[j] = nibbleMapTable.get(b >>> 4);
    chars[j + 1] = nibbleMapTable.get(b & 0x0f);
  }
  return chars.join('');
};

const encodeByteArray = bytes => {
  const chars = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    chars[i] = byteArrayTable[bytes[i]];
  }
  return chars.join('');
};

const encodeByteMap = bytes => {
  const chars = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    chars[i] = byteMapTable.get(bytes[i]);
  }
  return chars.join('');
};

// Pure arithmetic: no alphabet table lookup at all.  For nibble n in
// 0..15:  charcode = n < 10 ? n + 48 : n + 87.
const encodeArithmetic = bytes => {
  const codes = new Uint16Array(bytes.length * 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    const hi = b >>> 4;
    const lo = b & 0x0f;
    const j = i * 2;
    codes[j] = hi < 10 ? hi + 48 : hi + 87;
    codes[j + 1] = lo < 10 ? lo + 48 : lo + 87;
  }
  // String.fromCharCode caps at ~65 535 args on V8 / XS; chunk to be
  // safe for 1 MiB inputs (= 2 097 152 codes).
  const chunk = 8192;
  let out = '';
  for (let i = 0; i < codes.length; i += chunk) {
    out += String.fromCharCode.apply(
      null,
      /** @type {any} */ (codes.subarray(i, Math.min(i + chunk, codes.length))),
    );
  }
  return out;
};

// Native dispatch.
const toHex = /** @type {any} */ (Uint8Array.prototype).toHex;
const nativeToHex =
  typeof toHex === 'function' ? /** @type {() => string} */ (toHex) : undefined;

// Deterministic PRNG: shared default seed across the hex/ocapn fuzz
// suites; see `@endo/random/seeds.js`.
const makeBytes = size => {
  const { fillRandomBytes } = makeChaCha12(bobsCoffee32);
  const out = new Uint8Array(size);
  fillRandomBytes(out);
  return out;
};

const time = (label, size, iters, fn) => {
  fn();
  fn();
  const start = nowNs();
  for (let i = 0; i < iters; i += 1) {
    fn();
  }
  const elapsedNs = nowNs() - start;
  const perIterUs = elapsedNs / iters / 1000;
  const mibPerSec = (size * iters) / (elapsedNs / 1e9) / (1 << 20);
  const left = `  ${label}`;
  // Pad without String.prototype.padEnd, which is engine-portable
  // but explicit padding keeps the output column-aligned across
  // engines that print floats slightly differently.
  const pad = (n, width) => {
    let s = String(n);
    while (s.length < width) s = ` ${s}`;
    return s;
  };
  console.log(
    `${left}${'                                '.slice(left.length)}${pad(perIterUs.toFixed(3), 11)} us/iter  ${pad(mibPerSec.toFixed(1), 8)} MiB/s`,
  );
};

const runSize = (size, iters) => {
  const bytes = makeBytes(size);

  // Sanity-check all polyfill variants agree on the same output.
  const expected = jsEncodeHex(bytes);
  /** @type {Array<[string, (bytes: Uint8Array) => string]>} */
  const variants = [
    ['nibble-array-table', encodeNibbleArray],
    ['nibble-null-object', encodeNibbleNullObject],
    ['nibble-Map', encodeNibbleMap],
    ['byte-array-table', encodeByteArray],
    ['byte-Map', encodeByteMap],
    ['arithmetic charcode', encodeArithmetic],
  ];
  for (const [name, fn] of variants) {
    const got = fn(bytes);
    if (got !== expected) throw Error(`${name} mismatch`);
  }
  if (nativeToHex !== undefined) {
    const viaNative = Reflect.apply(nativeToHex, bytes, []);
    if (viaNative !== expected) throw Error('native toHex mismatch');
  }

  console.log(`Input: ${size} bytes (${size * 2} hex chars), ${iters} iter`);
  time('polyfill (shipped)', size, iters, () => jsEncodeHex(bytes));
  for (const [name, fn] of variants) {
    time(name, size, iters, () => fn(bytes));
  }
  if (nativeToHex !== undefined) {
    time('native toHex', size, iters, () =>
      Reflect.apply(nativeToHex, bytes, []),
    );
  } else {
    console.log('  (native Uint8Array.prototype.toHex unavailable; skipped)');
  }
  console.log('');
};

const engineLine = (() => {
  const proc = globalThis.process;
  if (proc !== undefined && proc !== null && proc.versions !== undefined) {
    return `Node ${proc.versions.node}, V8 ${proc.versions.v8}`;
  }
  // XS exposes `globalThis.@`-style symbols; eshost's $262 if present.
  if (typeof globalThis.$262 === 'object') return 'eshost host';
  return 'unknown engine';
})();
console.log(
  `${engineLine}, native toHex: ${nativeToHex !== undefined ? 'yes' : 'no'}`,
);
console.log('');

runSize(32, 200_000);
runSize(256, 50_000);
runSize(1 << 20, 20);
