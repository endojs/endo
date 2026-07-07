/* eslint-disable no-bitwise */

// Benchmark: comparison of three seedable PRNGs across three
// workloads, all driven through `@endo/random`'s sampler functions:
//
//   1. Pulling 1 MiB of random bytes (filling a Uint8Array directly
//      via the source).
//   2. 1 000 000 `random(source)` calls.
//   3. 1 000 000 `randomInt(source, 0, 99)` calls.
//
// Implementations:
//
//   A. xorshift128+: the local copy in `_xorshift.js`, exposing a
//      `(out: Uint8Array) => void` source.
//   B. ChaCha20: local pure-JS ChaCha20 keystream in `_chacha20.js`,
//      same shape.
//   C. ChaCha12: `@endo/chacha12`'s `makeChaCha12`, same shape.
//
// All three sources implement the same function-shaped contract, so
// the bench drives them uniformly without per-source adapters.
//
// Run from `packages/random/`:
//   node test/random.bench.js
//
// The bench file is named `*.bench.js` (not `*.test.js`) so the
// ses-ava test runner ignores it.

import { makeChaCha12 } from '@endo/chacha12';

import { random } from '../src/random.js';
import { randomInt } from '../src/int.js';
import { makeChaCha20 } from './_chacha20.js';
import { makeXorShift } from './_xorshift.js';

// Engine-portable nanosecond timer.
const hasHrtime =
  typeof globalThis.process === 'object' &&
  globalThis.process !== null &&
  typeof globalThis.process.hrtime === 'function' &&
  typeof globalThis.process.hrtime.bigint === 'function';
const nowNs = hasHrtime
  ? () => Number(globalThis.process.hrtime.bigint())
  : () => Date.now() * 1_000_000;

const seedShort = [0xb0b5_c0ff, 0xeefa_cade, 0xb0b5_c0ff, 0xeefa_cade];
const seedBytes = (() => {
  const s = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) s[i] = i;
  return s;
})();

const time = (label, iters, fn) => {
  // Warm-up.
  fn();
  fn();
  const start = nowNs();
  for (let i = 0; i < iters; i += 1) fn();
  const elapsedNs = nowNs() - start;
  const totalSec = elapsedNs / 1e9;
  const perIterUs = elapsedNs / iters / 1000;
  return { label, totalSec, perIterUs, elapsedNs, iters };
};

const pad = (s, w) => {
  let out = String(s);
  while (out.length < w) out = ` ${out}`;
  return out;
};

const printRow = ({ label, totalSec, perIterUs }, extra) => {
  console.log(
    `  ${label}${' '.repeat(Math.max(1, 32 - label.length))}${pad(
      perIterUs.toFixed(3),
      11,
    )} us/iter   total ${pad(totalSec.toFixed(3), 6)} s${
      extra ? `   ${extra}` : ''
    }`,
  );
};

const runBench = () => {
  console.log(
    `Node ${globalThis.process?.versions?.node || '?'} on ${
      globalThis.process?.platform || '?'
    } / ${globalThis.process?.arch || '?'}`,
  );
  console.log('');

  // 1. Bulk bytes (1 MiB per call).
  console.log('Workload: fill 1 MiB, 8 iterations');
  const N = 1 << 20;
  const ITERS_BYTES = 8;
  const bulk = {};
  {
    const fillRandomBytes = makeXorShift([...seedShort]);
    const out = new Uint8Array(N);
    bulk.xorshift = time('xorshift128+', ITERS_BYTES, () =>
      fillRandomBytes(out),
    );
    printRow(
      bulk.xorshift,
      `${((ITERS_BYTES * N) / 1024 / 1024).toFixed(0)} MiB total`,
    );
  }
  {
    const fillRandomBytes = makeChaCha20(Uint8Array.from(seedBytes));
    const out = new Uint8Array(N);
    bulk.chacha20 = time('chacha20 (20 rounds)', ITERS_BYTES, () =>
      fillRandomBytes(out),
    );
    printRow(
      bulk.chacha20,
      `${((ITERS_BYTES * N) / 1024 / 1024).toFixed(0)} MiB total`,
    );
  }
  {
    const { fillRandomBytes } = makeChaCha12(Uint8Array.from(seedBytes));
    const out = new Uint8Array(N);
    bulk.chacha12 = time('chacha12 (12 rounds)', ITERS_BYTES, () =>
      fillRandomBytes(out),
    );
    printRow(
      bulk.chacha12,
      `${((ITERS_BYTES * N) / 1024 / 1024).toFixed(0)} MiB total`,
    );
  }
  console.log('');

  // 2. random() (1 000 000 calls).
  console.log('Workload: random() x 1 000 000');
  const ITERS_RANDOM = 1_000_000;
  {
    const source = makeXorShift([...seedShort]);
    printRow(
      time('xorshift128+', 1, () => {
        for (let i = 0; i < ITERS_RANDOM; i += 1) random(source);
      }),
    );
  }
  {
    const source = makeChaCha20(Uint8Array.from(seedBytes));
    printRow(
      time('chacha20 (20 rounds)', 1, () => {
        for (let i = 0; i < ITERS_RANDOM; i += 1) random(source);
      }),
    );
  }
  {
    const { fillRandomBytes: source } = makeChaCha12(
      Uint8Array.from(seedBytes),
    );
    printRow(
      time('chacha12 (12 rounds)', 1, () => {
        for (let i = 0; i < ITERS_RANDOM; i += 1) random(source);
      }),
    );
  }
  console.log('');

  // 3. randomInt(0, 99) (1 000 000 calls).
  console.log('Workload: randomInt(0, 99) x 1 000 000');
  const ITERS_INT = 1_000_000;
  {
    const source = makeXorShift([...seedShort]);
    printRow(
      time('xorshift128+', 1, () => {
        for (let i = 0; i < ITERS_INT; i += 1) randomInt(source, 0, 99);
      }),
    );
  }
  {
    const source = makeChaCha20(Uint8Array.from(seedBytes));
    printRow(
      time('chacha20 (20 rounds)', 1, () => {
        for (let i = 0; i < ITERS_INT; i += 1) randomInt(source, 0, 99);
      }),
    );
  }
  {
    const { fillRandomBytes: source } = makeChaCha12(
      Uint8Array.from(seedBytes),
    );
    printRow(
      time('chacha12 (12 rounds)', 1, () => {
        for (let i = 0; i < ITERS_INT; i += 1) randomInt(source, 0, 99);
      }),
    );
  }
  console.log('');

  // Summary: ChaCha12 throughput vs ChaCha20 on the bulk-bytes
  // workload.
  const totalBytes = ITERS_BYTES * N;
  const mbPerSec = ({ elapsedNs }) => totalBytes / 1e6 / (elapsedNs / 1e9);
  const nsPerByte = ({ elapsedNs }) => elapsedNs / totalBytes;
  console.log('Bulk throughput (1 MiB fills):');
  console.log(
    `  chacha20: ${mbPerSec(bulk.chacha20).toFixed(2)} MB/s   ${nsPerByte(
      bulk.chacha20,
    ).toFixed(2)} ns/byte`,
  );
  console.log(
    `  chacha12: ${mbPerSec(bulk.chacha12).toFixed(2)} MB/s   ${nsPerByte(
      bulk.chacha12,
    ).toFixed(2)} ns/byte`,
  );
  const speedup = bulk.chacha20.elapsedNs / bulk.chacha12.elapsedNs;
  console.log(
    `  chacha12 / chacha20 speedup: ${speedup.toFixed(2)}x  (${(
      (speedup - 1) *
      100
    ).toFixed(1)}% faster)`,
  );
  console.log('');
};

runBench();
