/* eslint-disable no-bitwise, @endo/restrict-comparison-operands */
/* global globalThis */

// Benchmark: decode paths.  Compares several table-based decoders
// against the shipped charcode-arithmetic decoder across small (32 B),
// medium (256 B), and large (1 MiB) inputs, plus a worst-case run that
// forces the error path on every call.  Engine-portable: runs under
// both V8 (Node) and XS via eshost; see `test/run-benches.sh`.
//
// Run from `packages/hex/`:
//   node test/decode.bench.js                 (V8/Node)
//   xst test/decode.bench.js                  (XS direct, ESM)
//   ./test/run-benches.sh                      (rolls up + eshost)

import { jsDecodeHex as shippedDecode } from '../src/decode.js';
// `_xorshift.js` is a copy of `packages/ocapn/test/_xorshift.js`; if
// either is updated, the other should be kept in sync, and ideally we
// should factor the PRNG out into a shared test helper.
import { XorShift } from './_xorshift.js';

const hexAlphabet = '0123456789abcdef';

// Reference table-based decoders, retained here for comparison
// against the shipped charcode-arithmetic implementation.  We try
// several table flavors because each engine optimizes lookup
// differently, and reviewers often reach for "but did you try a
// Map / null-proto object?" as the obvious alternative.

// (a) Array indexed by char-code, with sentinel -1 for non-hex codes.
const hexDigitArrayTable = (() => {
  const table = new Array(256).fill(-1);
  for (let i = 0; i < 10; i += 1) table['0'.charCodeAt(0) + i] = i;
  for (let i = 0; i < 6; i += 1) {
    table['a'.charCodeAt(0) + i] = 10 + i;
    table['A'.charCodeAt(0) + i] = 10 + i;
  }
  return Object.freeze(table);
})();

// (b) Null-prototype object keyed by character.
const hexDigitObjectTable = (() => {
  const table = Object.create(null);
  '0123456789'.split('').forEach((c, i) => {
    table[c] = i;
  });
  '0123456789abcdef'
    .slice(10)
    .split('')
    .forEach((c, i) => {
      table[c] = 10 + i;
    });
  '0123456789ABCDEF'
    .slice(10)
    .split('')
    .forEach((c, i) => {
      table[c] = 10 + i;
    });
  return Object.freeze(table);
})();

// (c) Map keyed by character.
const hexDigitMapTable = (() => {
  const m = new Map();
  for (let i = 0; i < 10; i += 1) m.set(String(i), i);
  '0123456789abcdef'
    .slice(10)
    .split('')
    .forEach((c, i) => m.set(c, 10 + i));
  '0123456789ABCDEF'
    .slice(10)
    .split('')
    .forEach((c, i) => m.set(c, 10 + i));
  return m;
})();

// (d) Map keyed by char *pair* (256 byte pairs of high+low nibbles)
//     mapped to byte values, so each iteration does a single lookup.
const hexBytePairMapTable = (() => {
  const lower = '0123456789abcdef';
  const upper = '0123456789ABCDEF';
  const m = new Map();
  for (let hi = 0; hi < 16; hi += 1) {
    for (let lo = 0; lo < 16; lo += 1) {
      const v = (hi << 4) | lo;
      m.set(lower[hi] + lower[lo], v);
      m.set(upper[hi] + upper[lo], v);
      m.set(lower[hi] + upper[lo], v);
      m.set(upper[hi] + lower[lo], v);
    }
  }
  return m;
})();

const oddLength = (string, name) => {
  if (string.length % 2 !== 0) {
    throw Error(
      `Hex string must have an even length, got ${string.length} in string ${name}`,
    );
  }
};

const invalidAt = (offset, name) => {
  throw Error(`Invalid hex character at offset ${offset} of string ${name}`);
};

/**
 * Array-table decoder.
 *
 * @param {string} string
 * @param {string} [name]
 * @returns {Uint8Array}
 */
const arrayTableDecode = (string, name = '<unknown>') => {
  oddLength(string, name);
  const bytes = new Uint8Array(string.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const hi = hexDigitArrayTable[string.charCodeAt(i * 2)] ?? -1;
    const lo = hexDigitArrayTable[string.charCodeAt(i * 2 + 1)] ?? -1;
    if (hi < 0 || lo < 0) invalidAt(hi < 0 ? i * 2 : i * 2 + 1, name);
    bytes[i] = (hi << 4) | lo;
  }
  return bytes;
};

/**
 * Null-prototype object table decoder.
 *
 * @param {string} string
 * @param {string} [name]
 * @returns {Uint8Array}
 */
const objectTableDecode = (string, name = '<unknown>') => {
  oddLength(string, name);
  const bytes = new Uint8Array(string.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const hi = hexDigitObjectTable[string[i * 2]];
    const lo = hexDigitObjectTable[string[i * 2 + 1]];
    if (hi === undefined || lo === undefined) {
      invalidAt(hi === undefined ? i * 2 : i * 2 + 1, name);
    }
    bytes[i] = (hi << 4) | lo;
  }
  return bytes;
};

/**
 * Single-character `Map` decoder.
 *
 * @param {string} string
 * @param {string} [name]
 * @returns {Uint8Array}
 */
const mapTableDecode = (string, name = '<unknown>') => {
  oddLength(string, name);
  const bytes = new Uint8Array(string.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const hi = hexDigitMapTable.get(string[i * 2]);
    const lo = hexDigitMapTable.get(string[i * 2 + 1]);
    if (hi === undefined || lo === undefined) {
      invalidAt(hi === undefined ? i * 2 : i * 2 + 1, name);
    }
    bytes[i] = (hi << 4) | lo;
  }
  return bytes;
};

/**
 * Pair-keyed `Map` decoder: looks up two characters at a time so each
 * iteration is one lookup and one store.
 *
 * @param {string} string
 * @param {string} [name]
 * @returns {Uint8Array}
 */
const pairMapTableDecode = (string, name = '<unknown>') => {
  oddLength(string, name);
  const bytes = new Uint8Array(string.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const v = hexBytePairMapTable.get(string.slice(i * 2, i * 2 + 2));
    if (v === undefined) invalidAt(i * 2, name);
    bytes[i] = v;
  }
  return bytes;
};

// Default reference for the rest of the file (sanity-check on clean
// input, worst-case throw path).
const tableDecode = arrayTableDecode;

// Deterministic PRNG, same seed shape as other Endo fuzz tests.
// eslint-disable-next-line unicorn/numeric-separators-style -- mnemonic seed (BOBSCOFF EEFACADE)
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

const padR = (s, width) => {
  while (s.length < width) s += ' ';
  return s;
};
const padL = (s, width) => {
  while (s.length < width) s = ` ${s}`;
  return s;
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
  const start = nowNs();
  for (let i = 0; i < iters; i += 1) {
    fn();
  }
  const elapsedNs = nowNs() - start;
  const perIterUs = elapsedNs / iters / 1000;
  const mibPerSec = (size * iters) / (elapsedNs / 1e9) / (1 << 20);
  console.log(
    `  ${padR(label, 30)} ${padL(perIterUs.toFixed(3), 11)} us/iter  ${padL(mibPerSec.toFixed(1), 8)} MiB/s`,
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
  time('array-table decoder', size, iters, () => arrayTableDecode(hex));
  time('null-proto-object decoder', size, iters, () => objectTableDecode(hex));
  time('Map<char> decoder', size, iters, () => mapTableDecode(hex));
  time('Map<char-pair> decoder', size, iters, () => pairMapTableDecode(hex));
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
    const start = nowNs();
    for (let i = 0; i < iters; i += 1) {
      try {
        fn();
      } catch (_) {
        swallow();
      }
    }
    const elapsedNs = nowNs() - start;
    return {
      perIterUs: elapsedNs / iters / 1000,
      opsPerSec: iters / (elapsedNs / 1e9),
    };
  };
  console.log(`Worst case: 64-char string, first byte invalid, ${iters} iter`);
  /** @type {Array<[string, (s: string, name?: string) => Uint8Array]>} */
  const variants = [
    ['array-table decoder', arrayTableDecode],
    ['null-proto-object decoder', objectTableDecode],
    ['Map<char> decoder', mapTableDecode],
    ['Map<char-pair> decoder', pairMapTableDecode],
    ['shipped arithmetic decoder', shippedDecode],
  ];
  for (const [name, fn] of variants) {
    const r = run(() => fn(bad));
    console.log(
      `  ${padR(name, 30)} ${padL(r.perIterUs.toFixed(3), 11)} us/iter  ${padL((r.opsPerSec / 1e6).toFixed(2), 8)} Mop/s`,
    );
  }
  console.log('');
};

const engineLine = (() => {
  const proc = globalThis.process;
  if (proc !== undefined && proc !== null && proc.versions !== undefined) {
    return `Node ${proc.versions.node}, V8 ${proc.versions.v8}`;
  }
  return 'unknown engine';
})();
console.log(engineLine);
console.log('');

// Small inputs: typical digest/signature sizes.
runSize(32, 200_000);
runSize(256, 50_000);
// Large input: 1 MiB.
runSize(1 << 20, 20);
runWorstCase(50_000);
