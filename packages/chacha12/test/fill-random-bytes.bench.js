/* eslint-disable no-bitwise, @endo/restrict-comparison-operands, no-fallthrough, default-case, no-plusplus, no-continue */
/* global process */

// Benchmark: candidate inner-loop variants for the byte copy in
// `fillRandomBytes` (`packages/chacha12/src/chacha12.js`).
// The current implementation copies keystream bytes one at a time:
//
//   for (let k = 0; k < n; k += 1) out[i + k] = block[offset + k];
//
// Candidates:
//
//   `current`: byte-by-byte for-loop (the live code).
//   `duff8`  : 8-way unrolled Duff's-device with a switch-fallthrough head.
//   `set`    : `out.set(block.subarray(offset, offset + n), i)`.
//   `unroll4`: 4-way unrolled body with a byte-by-byte tail.
//   `hybrid32`: byte-by-byte under 32 bytes, `set` otherwise.
//
// Both the inner copy in isolation and the integrated `fillRandomBytes`
// path are measured per variant so the numbers reflect the real call
// site (block refill, offset bookkeeping, and the inner copy together).
//
// Run from `packages/chacha12/`:
//   node test/fill-random-bytes.bench.js

import { BLOCK_SIZE, chacha12Block, chacha12State } from '../src/chacha12.js';

const nowNs = () => Number(process.hrtime.bigint());

const seedBytes = Uint8Array.from({ length: 32 }, (_, i) => i);

// Each variant copies `n` bytes from `block[offset..]` into `out[i..]`.
// These are isolated functions so the loop can be microbenchmarked
// outside the full fillRandomBytes path.

const copyCurrent = (out, i, block, offset, n) => {
  for (let k = 0; k < n; k += 1) out[i + k] = block[offset + k];
};

const copyDuff8 = (out, i, block, offset, n) => {
  let k = n;
  let oi = i;
  let bi = offset;
  const r = k % 8;
  switch (r) {
    case 7:
      out[oi++] = block[bi++];
    case 6:
      out[oi++] = block[bi++];
    case 5:
      out[oi++] = block[bi++];
    case 4:
      out[oi++] = block[bi++];
    case 3:
      out[oi++] = block[bi++];
    case 2:
      out[oi++] = block[bi++];
    case 1:
      out[oi++] = block[bi++];
    case 0:
  }
  k -= r;
  while (k > 0) {
    out[oi + 0] = block[bi + 0];
    out[oi + 1] = block[bi + 1];
    out[oi + 2] = block[bi + 2];
    out[oi + 3] = block[bi + 3];
    out[oi + 4] = block[bi + 4];
    out[oi + 5] = block[bi + 5];
    out[oi + 6] = block[bi + 6];
    out[oi + 7] = block[bi + 7];
    oi += 8;
    bi += 8;
    k -= 8;
  }
};

const copySet = (out, i, block, offset, n) => {
  out.set(block.subarray(offset, offset + n), i);
};

const copyUnroll4 = (out, i, block, offset, n) => {
  const limit = n - (n % 4);
  let k = 0;
  while (k < limit) {
    out[i + k + 0] = block[offset + k + 0];
    out[i + k + 1] = block[offset + k + 1];
    out[i + k + 2] = block[offset + k + 2];
    out[i + k + 3] = block[offset + k + 3];
    k += 4;
  }
  while (k < n) {
    out[i + k] = block[offset + k];
    k += 1;
  }
};

const HYBRID_THRESHOLD = 32;
const copyHybrid = (out, i, block, offset, n) => {
  if (n >= HYBRID_THRESHOLD) {
    out.set(block.subarray(offset, offset + n), i);
  } else {
    for (let k = 0; k < n; k += 1) out[i + k] = block[offset + k];
  }
};

const VARIANTS = [
  { name: 'current', fn: copyCurrent },
  { name: 'duff8', fn: copyDuff8 },
  { name: 'set', fn: copySet },
  { name: 'unroll4', fn: copyUnroll4 },
  { name: 'hybrid32', fn: copyHybrid },
];

// Sanity check: every variant must produce identical bytes to current.
const sanityCheck = () => {
  const block = Uint8Array.from(
    { length: BLOCK_SIZE },
    (_, i) => (i * 31 + 7) & 0xff,
  );

  const shapes = [];
  for (let n = 0; n <= 64; n += 1) {
    for (const offset of [0, 1, 7, 8, 15, 16, 31, 33, 63]) {
      if (offset + n > BLOCK_SIZE) continue;
      for (const i of [0, 1, 7, 8, 17, 33]) {
        shapes.push({ offset, n, i });
      }
    }
  }

  const baselineOut = new Uint8Array(128);
  const candidateOut = new Uint8Array(128);

  for (const { offset, n, i } of shapes) {
    baselineOut.fill(0xa5);
    copyCurrent(baselineOut, i, block, offset, n);
    for (const { name, fn } of VARIANTS) {
      candidateOut.fill(0xa5);
      fn(candidateOut, i, block, offset, n);
      for (let k = 0; k < 128; k += 1) {
        if (baselineOut[k] !== candidateOut[k]) {
          throw Error(
            `variant ${name} disagreed at byte ${k} for shape ` +
              `offset=${offset} n=${n} i=${i}: baseline=${baselineOut[k]} ` +
              `candidate=${candidateOut[k]}`,
          );
        }
      }
    }
  }
};

// Inner-copy microbenchmark.
//
// For each (variant, n) we fill a 4 KiB source block buffer with
// deterministic bytes, allocate a destination buffer the size of the
// workload, and do `iters` calls to the variant, rotating offset
// within the block and i within the output buffer to avoid degenerate
// cache patterns.
const benchInner = (variant, n, iters) => {
  const block = Uint8Array.from(
    { length: 4096 },
    (_, i) => (i * 17 + 3) & 0xff,
  );
  const dst = new Uint8Array(Math.max(4096, n * 64));
  const dstSpan = dst.length - n;
  const blockSpan = block.length - n;
  // Two warm-up calls.
  variant.fn(dst, 0, block, 0, n);
  variant.fn(dst, 0, block, 0, n);

  const start = nowNs();
  let dstOff = 0;
  let blockOff = 0;
  for (let k = 0; k < iters; k += 1) {
    variant.fn(dst, dstOff, block, blockOff, n);
    dstOff = (dstOff + n) % (dstSpan + 1);
    blockOff = (blockOff + n) % (blockSpan + 1);
  }
  const elapsedNs = nowNs() - start;
  return { elapsedNs, perCallNs: elapsedNs / iters };
};

// Integrated fillRandomBytes microbenchmark.
//
// Rebuilds a fillRandomBytes loop that mirrors the live `chacha12.js`
// implementation byte-for-byte, except the inner copy is parameterized
// on the variant.  Each filler maintains its own (block, offset,
// baseState, counter), refilling via `chacha12Block`.  Variant
// comparison here reflects the real integrated cost.
const makeFillerFromVariant = copyFn => {
  const baseState = chacha12State(seedBytes);
  const block = new Uint8Array(BLOCK_SIZE);
  let counter = 0;
  let offset = BLOCK_SIZE;
  const refill = () => {
    baseState[12] = counter >>> 0;
    chacha12Block(baseState, block);
    counter += 1;
    offset = 0;
  };
  return out => {
    let i = 0;
    const end = out.length;
    while (i < end) {
      if (offset >= BLOCK_SIZE) refill();
      const available = BLOCK_SIZE - offset;
      const want = end - i;
      const n = available < want ? available : want;
      copyFn(out, i, block, offset, n);
      offset += n;
      i += n;
    }
  };
};

const benchIntegrated = (variant, n, iters) => {
  const filler = makeFillerFromVariant(variant.fn);
  const out = new Uint8Array(n);
  filler(out);
  filler(out);
  const start = nowNs();
  for (let k = 0; k < iters; k += 1) filler(out);
  const elapsedNs = nowNs() - start;
  return { elapsedNs, perCallNs: elapsedNs / iters };
};

const pad = (s, w) => String(s).padStart(w);

const runBench = () => {
  console.log(
    `Node ${process.versions.node} on ${process.platform} / ${process.arch}`,
  );
  console.log('');

  console.log('Sanity check ...');
  sanityCheck();
  console.log('  all variants byte-identical to current.');
  console.log('');

  // Workloads, in (n, iters) pairs.  Tiny fills get more iters to
  // push past timer granularity; large fills get fewer to keep
  // wall-clock reasonable.
  const workloads = [
    { name: 'tiny n=1', n: 1, iters: 5_000_000 },
    { name: 'tiny n=4', n: 4, iters: 5_000_000 },
    { name: 'tiny n=16', n: 16, iters: 5_000_000 },
    { name: 'medium n=64 (one block)', n: 64, iters: 2_000_000 },
    { name: 'large n=1024', n: 1024, iters: 200_000 },
    { name: 'large n=4096', n: 4096, iters: 100_000 },
  ];

  for (const wl of workloads) {
    console.log(`Workload: ${wl.name}, ${wl.iters} iters`);
    const baseline = benchInner(VARIANTS[0], wl.n, wl.iters);
    for (const variant of VARIANTS) {
      const result = benchInner(variant, wl.n, wl.iters);
      const ratio = result.elapsedNs / baseline.elapsedNs;
      console.log(
        `  ${variant.name.padEnd(12)}${pad(result.perCallNs.toFixed(2), 8)} ns/call   ` +
          `total ${pad((result.elapsedNs / 1e6).toFixed(2), 8)} ms   ` +
          `${pad(ratio.toFixed(2), 5)}x vs current`,
      );
    }
    console.log('');
  }

  // Integrated full-fill timing per variant.
  for (const wl of workloads) {
    console.log(`Integrated fillRandomBytes: ${wl.name}`);
    const itersInt = Math.min(wl.iters, 1_000_000);
    const baseline = benchIntegrated(VARIANTS[0], wl.n, itersInt);
    for (const variant of VARIANTS) {
      const r = benchIntegrated(variant, wl.n, itersInt);
      const ratio = r.elapsedNs / baseline.elapsedNs;
      console.log(
        `  int.${variant.name.padEnd(12)}${pad(r.perCallNs.toFixed(2), 8)} ns/call   ${pad(
          ratio.toFixed(2),
          5,
        )}x vs current`,
      );
    }
    console.log('');
  }
};

runBench();
