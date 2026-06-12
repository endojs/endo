# @endo/chacha12

## 1.0.0

### Major Changes

- [#3232](https://github.com/endojs/endo/pull/3232) [`3dee3aa`](https://github.com/endojs/endo/commit/3dee3aa7100a09e3b2c2e2e6ca75e34db91da9ea) Thanks [@kriskowal](https://github.com/kriskowal)! - Add `@endo/random`: a source-agnostic library of random sampling functions (`random`, `randomInt`, plus the underlying `randomUint8` / `randomUint16` / `randomUint24` / `randomUint32` / `randomUint53` readers).
  Each function accepts a `RandomSource`, which is simply a function `(out: Uint8Array) => void` matching the shape of `crypto.getRandomValues` (minus the return value).
  Names follow the TC39 [proposal-random-functions](https://tc39.es/proposal-random-functions/) translation `Random.method` -> `randomMethod`.
  Each sampler is its own module so consumers can import only what they use:

  ```js
  import { random } from '@endo/random/random.js';
  import { randomInt } from '@endo/random/int.js';
  ```

  The package also ships `@endo/random/seeds.js`, exporting the canonical `bobsCoffee32` 32-byte seed shared across Endo deterministic fuzz suites.

  Add `@endo/chacha12`: a pure-JavaScript ChaCha12 keystream.
  The factory `makeChaCha12(key)` returns a `ChaCha12Generator` record `{ next, getState, clone, fillRandomBytes }`.
  The `fillRandomBytes` method has the shape `(out: Uint8Array) => void`, conforming to `@endo/random`'s `RandomSource` and to `crypto.getRandomValues`-style ergonomics; it can be passed directly to the samplers.
  The remaining methods expose the keystream's internal state (snapshot via `getState`, independent copy via `clone`, signed-int32 pull via `next`) so the generator satisfies the [`pure-rand` v8 `RandomGenerator` interface](https://github.com/dubzzz/pure-rand/blob/v8.0.0/src/types/RandomGenerator.ts) structurally and can be used directly as a [`fast-check` v4 `randomType` parameter](https://fast-check.dev/docs/api/interfaces/Parameters/#randomtype).
  A companion `makeChaCha12FromState(state)` reconstructs a generator from a snapshot for deterministic resumption.

  The keystream is cross-checked against three published ChaCha12 test vectors from [`draft-strombergson-chacha-test-vectors-01`](https://datatracker.ietf.org/doc/html/draft-strombergson-chacha-test-vectors-01) (TC1, TC4, TC8).

  ChaCha12 is the 12-round variant of Daniel J. Bernstein's ChaCha family.
  The block function is identical to ChaCha20 modulo the round count (6 double-rounds vs 10), so the implementation, API, and harden discipline mirror the sibling 20-round implementation.
  ChaCha12 trades cryptographic margin for throughput; for deterministic test fixtures, property-based testing, and fuzzing the extra speed is generally the right tradeoff.
