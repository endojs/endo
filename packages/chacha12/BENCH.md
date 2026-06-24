# `@endo/chacha12` benchmark report

Two measurement campaigns, both on the same workstation:

1. [**ChaCha12 vs ChaCha20 throughput**](#chacha12-vs-chacha20-throughput)
   with a `xorshift128+` baseline.
   Drives the keystream through `@endo/random`'s sampler functions.
   Harness: `packages/random/test/random.bench.js`.
2. [**`fillRandomBytes` inner-loop comparison**](#fillrandombytes-inner-loop-comparison)
   measuring the byte-copy alternatives (current byte-by-byte loop vs
   Duff-device unroll vs `Uint8Array.set` vs hybrids).
   Harness: `packages/chacha12/test/fill-random-bytes.bench.js`.

## Test bed

Both campaigns ran on the same machine, so the test-bed table applies
to both unless a section below overrides it.

| Field | Value                                            |
| ----- | ------------------------------------------------ |
| CPU   | AMD Ryzen AI MAX+ 395 w/ Radeon 8060S (32 vCPU)  |
| RAM   | 128 GiB                                          |
| OS    | Linux 6.14 (Ubuntu 24.04)                        |
| Node  | 22.22.2                                          |
| Arch  | x64                                              |

The test bed is a developer workstation, not an isolated performance
lab.
Absolute numbers carry meaningful noise (±15% on the bulk-bytes
workload across 10 runs; about ±1% on the inner-loop bench, larger
for the smallest n where per-call timer overhead dominates).
Variant-vs-baseline ratios are the more stable comparison since both
share warm-up, allocation, and call-site shape.

Each measurement includes two warm-up calls before the timed loop.
Numbers below are the **median of 10 independent runs** (each
re-launching the Node process).

## ChaCha12 vs ChaCha20 throughput

Harness: `packages/random/test/random.bench.js`.

### Methodology

Three workloads, run back-to-back within each process invocation,
via the samplers in `@endo/random`:

1. **Bulk bytes**: the source is invoked directly as `source(out)`
   with a 1 MiB pre-allocated `Uint8Array`, 8 times (8 MiB total
   per source).
2. **`random(source)`**: 1 000 000 calls, single timed loop.
3. **`randomInt(source, 0, 99)`**: 1 000 000 calls, single timed
   loop.

The ChaCha20 keystream used here is bundled as
`packages/random/test/_chacha20.js`: the same algorithm referenced
by the test vectors, inlined as a comparison baseline.
Both ChaCha20 and ChaCha12 expose the `(out: Uint8Array) => void`
shape that `@endo/random`'s samplers consume directly.

### Results

#### Bulk bytes (1 MiB per call, 8 calls = 8 MiB)

| PRNG         | us/iter (median) | MB/s (median) | ns/byte (median) |
| ------------ | ---------------: | ------------: | ---------------: |
| xorshift128+ |             1507 |           696 |             1.44 |
| ChaCha20     |             5530 |           190 |             5.27 |
| ChaCha12     |             3726 |           281 |             3.55 |

ChaCha12 / ChaCha20 speedup: **median 1.48x** across 10 runs
(range 1.39–2.07x; the high end is a single noisy chacha20 run,
the bottom-quartile speedup was still 1.43x).

#### `random()` (1 million calls)

| PRNG         | total us (median) | ns/call (median) |
| ------------ | ----------------: | ---------------: |
| xorshift128+ |             17216 |             17.2 |
| ChaCha20     |             45355 |             45.4 |
| ChaCha12     |             35123 |             35.1 |

ChaCha12 / ChaCha20 speedup: **1.29x**.
This is the cleanest measurement: a single hot loop with no
per-iteration allocation.
`random()` now drives a range-aware staircase that reads only as many
keystream bytes as the target precision needs, so xorshift no longer
benefits from the old single-word fast path and chacha pays for
proportionally fewer keystream bytes per call.

#### `int(0, 99)` (1 million calls)

| PRNG         | total us (median) | ns/call (median) |
| ------------ | ----------------: | ---------------: |
| xorshift128+ |             11097 |             11.1 |
| ChaCha20     |             15650 |             15.6 |
| ChaCha12     |             14277 |             14.3 |

ChaCha12 / ChaCha20 speedup: **1.10x**.
With `@endo/random`'s range-aware rejection sampling,
`randomInt(0, 99)` reads exactly **one** keystream byte per draw (not
four), so the chacha implementations no longer round-trip through
`random()` or pull a four-byte word.
The per-call cost is dominated by the rejection-sampling envelope
(state, mask, and reject-loop), which is shared across all three
sources, and the chacha12-vs-chacha20 gap correspondingly narrows.

### Interpretation

ChaCha12 is roughly **1.5x faster** than ChaCha20 on the
keystream-bound bulk workload, **~1.3x** on `random()`, and **~1.1x**
on `randomInt(0, 99)` in pure-JavaScript on this Node 22 / x64
workstation.
The naive expectation from round-count alone would be 20 / 12 = 1.67x;
the realized bulk speedup is lower because per-block fixed costs
(state initialization, final state-add and little-endian write,
output buffering) are identical between the two and dilute the
savings on the inner loop.
The sampler workloads narrow the gap further because the per-call
envelope (range-aware staircase for `random()`, mask-and-reject for
`randomInt`) is shared across all sources and amortizes the keystream
difference.

For a **PRNG** (not a cipher) the choice between ChaCha12 and
ChaCha20 is essentially a security-margin-vs-throughput knob.
Bernstein's original analysis (the eSTREAM submission) introduced
ChaCha8 / ChaCha12 / ChaCha20 as a graded family.
ChaCha12 retains a comfortable margin against the best published
attacks (no public attack improves over brute force on the full
12-round version) and has been used in performance-sensitive
contexts.
This package is **not** a cryptographic-cipher recommendation; when
the seed is caller-supplied and the consumer is a deterministic test
harness, the extra rounds in ChaCha20 buy nothing useful and the
throughput wins.

For cipher use cases, prefer a 20-round implementation; for
deterministic test fixtures, property-based testing, fuzzing, and
simulation `@endo/chacha12` is the better tradeoff.

## fillRandomBytes inner-loop comparison

Harness: `packages/chacha12/test/fill-random-bytes.bench.js`.
Re-run with `node test/fill-random-bytes.bench.js` from
`packages/chacha12/`.

This campaign measures the byte-copy inner loop in `fillRandomBytes`
against four alternatives and a hybrid.
Every variant is byte-identity-checked against the current
implementation across ~1500 `(offset, n, i)` shapes covering all
block-boundary positions.

### Variants

- **current**: `for (let k = 0; k < n; k += 1) out[i + k] = block[offset + k];`
  (the live code).
- **duff8**: 8-way unrolled body with switch-fallthrough head for the
  trailing 1-7 bytes (the classic Duff shape).
- **set**: `out.set(block.subarray(offset, offset + n), i)` — defers
  to the JIT's typed-array memmove.
- **unroll4**: 4-way unrolled body with byte-by-byte tail.
- **copywin**: same as `set` (sanity probe; included to confirm the
  `set` numbers are not a fluke).
- **hybrid32**: byte-by-byte for `n < 32`, else `set` — the obvious
  "best of both" candidate.

### Results: inner copy in isolation (median ns/call)

| variant  | tiny n=1     | tiny n=4     | tiny n=16    | medium n=64  | large n=1024  | large n=4096   |
|----------|-------------:|-------------:|-------------:|-------------:|--------------:|---------------:|
| current  | 3.84 (1.00x) | 6.53 (1.00x) | 13.66 (1.00x)| 43.25 (1.00x)| 638.86 (1.00x)| 2504.28 (1.00x)|
| duff8    | 5.04 (1.31x) | 8.43 (1.29x) | 11.00 (0.81x)| 30.03 (0.69x)| 407.45 (0.64x)| 1616.34 (0.65x)|
| set      | 22.05 (5.74x)| 22.30 (3.41x)| 22.21 (1.63x)| 22.23 (0.51x)|  29.12 (0.05x)|   51.53 (0.02x)|
| unroll4  | 5.22 (1.36x) | 6.36 (0.97x) | 12.59 (0.92x)| 39.34 (0.91x)| 581.74 (0.91x)| 2282.56 (0.91x)|
| copywin  | 22.03 (5.74x)| 22.39 (3.43x)| 22.26 (1.63x)| 22.30 (0.52x)|  28.55 (0.04x)|   49.69 (0.02x)|
| hybrid32 | 4.75 (1.24x) | 6.52 (1.00x) | 14.11 (1.03x)| 23.45 (0.54x)|  30.38 (0.05x)|   52.23 (0.02x)|

### Results: integrated `fillRandomBytes` (median ns/call)

This includes the surrounding `chacha12Block` / refill / offset
bookkeeping, which is what callers actually pay.

| variant  | tiny n=1      | tiny n=4      | tiny n=16     | medium n=64   | large n=1024     | large n=4096      |
|----------|--------------:|--------------:|--------------:|--------------:|-----------------:|------------------:|
| current  |  8.09 (1.00x) | 18.75 (1.00x) | 53.45 (1.00x) | 200.72 (1.00x)| 3158.74 (1.00x)  | 12775.90 (1.00x)  |
| duff8    | 10.89 (1.35x) | 20.44 (1.09x) | 51.13 (0.96x) | 185.99 (0.93x)| 2986.53 (0.95x)  | 11858.69 (0.93x)  |
| set      | 26.69 (3.30x) | 34.87 (1.86x) | 66.58 (1.25x) | 183.94 (0.92x)| 2935.79 (0.93x)  | 11776.74 (0.92x)  |
| unroll4  |  9.62 (1.19x) | 18.70 (1.00x) | 52.56 (0.98x) | 196.21 (0.98x)| 3128.11 (0.99x)  | 12501.76 (0.98x)  |
| copywin  | 26.48 (3.27x) | 34.71 (1.85x) | 66.08 (1.24x) | 182.93 (0.91x)| 2924.05 (0.93x)  | 11744.19 (0.92x)  |
| hybrid32 |  9.27 (1.14x) | 18.58 (0.99x) | 53.59 (1.00x) | 184.24 (0.92x)| 2951.88 (0.93x)  | 11828.48 (0.93x)  |

### Verdict

**Keep current; do not ship a change.**

Two reasons.

First, the inner-copy microbench numbers are spectacular for `set`
(50x faster on n=4096) and impressive for Duff (1.55x faster on
n=4096), but the *integrated* numbers, which is what real callers
pay, show only a 7-9% improvement on bulk fills.
The byte-copy is not the bottleneck; `chacha12Block` (12 rounds of
quarter-round arithmetic plus the LE write at the end) is.
A 50x win on a 5% subroutine is a 4% wall-clock win, which is what we
see.

Second, `set` and Duff both regress meaningfully on the smallest
workloads.
The integrated `set` is **3.30x slower on n=1** (8.09 → 26.69 ns) and
**1.86x slower on n=4** (18.75 → 34.87 ns).
The n=4 case is real traffic: the `next()` slow path falls back to
`fillRandomBytes(buf)` with a 4-byte buffer whenever a 32-bit read
crosses a block boundary, which on average happens 1 in 16 calls when
block-aligned.
Duff is less bad (1.35x on n=1) but still regresses on the small end.

The `hybrid32` variant (byte-copy below the threshold, `set` above)
avoids the small-fill cliff and matches `set` at large fills; its
integrated win on bulk is 7-9%, with a residual ~1.14x regression on
n=1 from the threshold branch itself.
That is the candidate worth shipping if any of these is.

But the recommendation is **keep current** because:

1. The 7-9% bulk-fill win is on a workload (`fillRandomBytes(out)`
   with `out.length >= 64`) that is measurable but not the typical
   PRNG use case here; `pure-rand`-style consumers go through `next()`
   4 bytes at a time, not bulk.
2. Adding a perf-only branch with a magic threshold introduces a
   maintenance surface and a "why 32" question that does not pay back
   in user-visible time.
3. If a future caller ever does want bulk-fill throughput, the bench
   file is now in-tree and the obvious one-line change with the
   integrated numbers above is on file.

`unroll4` is a wash (within noise on every workload).
`copywin` matches `set` exactly, confirming the `set` numbers.
