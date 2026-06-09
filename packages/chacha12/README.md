# `@endo/chacha12`

`@endo/chacha12` is a small, pure-JavaScript implementation of the
ChaCha12 keystream: the 12-round variant of Daniel J. Bernstein's
ChaCha family.
Given a 32-byte key it produces a deterministic, statistically
high-quality stream of bytes suitable for deterministic test
fixtures, property-based testing, and fuzzing.

The package exposes two public entry points: `makeChaCha12` and
`makeChaCha12FromState`.

`makeChaCha12(key)` returns a `ChaCha12Generator` record with four
methods:

- `next()` returns a signed 32-bit integer in
  `[-0x80000000, 0x7fffffff]` (the next 4 keystream bytes interpreted
  little-endian) and advances the keystream by 4 bytes.
- `getState()` returns a serializable `readonly number[]` snapshot of
  the generator's full state.
  Pass it to `makeChaCha12FromState` to reconstruct an independent
  generator that produces the same subsequent keystream.
- `clone()` returns a fully independent generator at the same
  keystream position.
- `fillRandomBytes(out)` fills `out` with successive bytes of the
  keystream.
  This method matches `crypto.getRandomValues` (minus the return
  value) and conforms to `@endo/random`'s `RandomSource` type.

The `next` / `clone` / `getState` shape matches the `RandomGenerator`
contract that [`pure-rand`](https://github.com/dubzzz/pure-rand) v8
exposes (and that `fast-check@4` consumes via its `randomType`
parameter), so a `ChaCha12Generator` can plug directly into a
property-based test framework that expects a `pure-rand`-style
generator.

`makeChaCha12FromState(state)` reconstructs a generator from a state
snapshot returned by a previous `getState()` call.
See `@endo/chacha12-fast-check-test` for an integration test that
drives `fast-check`'s `RandomGenerator` adapter through this surface.

The ChaCha12 block function is identical to
[ChaCha20](https://datatracker.ietf.org/doc/html/rfc8439) modulo the
loop count: 6 double-rounds (12 rounds) instead of 10 (20 rounds).
The reduced round count trades cryptographic safety margin for speed.

For cipher use cases, prefer ChaCha20 or another 20-round
implementation.
ChaCha20 has a larger published security margin and remains the
cryptographer's first choice for cipher work.
ChaCha12 has no public attack that improves on brute force, but the
12-round version is best understood as a PRNG choice (a
throughput-vs-margin knob), not a cipher recommendation.

ChaCha12 (like ChaCha20) **must not be used to derive cryptographic
keys** when the seed is caller-supplied.
This package is a PRNG keystream, not a key-derivation function.

## Install

```sh
npm install @endo/chacha12
```

## Usage

```js
import { makeChaCha12, makeChaCha12FromState } from '@endo/chacha12';
import { random } from '@endo/random/random.js';
import { randomInt } from '@endo/random/int.js';

// Seed: 32-byte Uint8Array (ChaCha12 key).
const seed = new Uint8Array(32);
seed[0] = 0x42;

const gen = makeChaCha12(seed);

// Use the byte-fill entry point as a `RandomSource`.
const buffer = new Uint8Array(16);
gen.fillRandomBytes(buffer);

// Or pass `fillRandomBytes` to @endo/random samplers.
const { fillRandomBytes } = makeChaCha12(seed);
random(fillRandomBytes); // float in [0, 1)
randomInt(fillRandomBytes, 0, 99); // integer in [0, 99]

// Use the int32 entry point (matches pure-rand v8 RandomGenerator).
const v = gen.next(); // signed int32

// Snapshot and resume.
const snapshot = gen.getState();
const resumed = makeChaCha12FromState(snapshot);
// `resumed` produces the same subsequent keystream as `gen`.
```

The seed must be a 32-byte `Uint8Array`; `makeChaCha12` throws
`TypeError` on any other shape.
The returned generator and all of its methods are hardened with
`@endo/harden`.

## Bound on keystream length

A given source can produce at most 256 GiB of keystream; calls beyond
that throw `RangeError`.
In practice no test suite consumes anywhere close to this.

## Verification

The keystream is cross-checked against three published ChaCha12 test
vectors from
[`draft-strombergson-chacha-test-vectors-01`](https://datatracker.ietf.org/doc/html/draft-strombergson-chacha-test-vectors-01)
(TC1, TC4, TC8) by `test/chacha12.test.js`.
The sampling functions in `@endo/random` carry their own determinism
vectors.

## ChaCha12 vs ChaCha20

ChaCha12 is faster than ChaCha20 by roughly the ratio of round counts
(12 / 20 = 0.6), modulo per-call overhead.
The benchmark that measures both keystreams (and an `xorshift128+`
baseline) side by side lives in `@endo/random/test/random.bench.js`,
since it drives the keystreams through `@endo/random`'s sampler
functions.
See `BENCH.md` in this directory for a recent measurement.
