# `@endo/random`

`@endo/random` is a small, source-agnostic library of random sampling functions.
Each sampler is its own module so consumers can import only what they need:

```js
import { random } from '@endo/random/random.js';
import { randomInt } from '@endo/random/int.js';
```

Every sampler accepts a `RandomSource` as its first argument.
A `RandomSource` is simply a function `(out: Uint8Array) => void` that fills the supplied buffer with random bytes.
The shape mirrors `crypto.getRandomValues` (minus the return value) so that the canonical browser/Node entropy source and a `@endo/chacha12`-backed source returned by `makeChaCha12(seed)` are both directly usable as sampler arguments.

Names follow the TC39 [proposal-random-functions](https://tc39.es/proposal-random-functions/) (Stage 1) translation `Random.method` -> `randomMethod`.

| TC39 proposal        | `@endo/random`              |
| -------------------- | --------------------------- |
| `Random.random()`    | `random(source)`            |
| `Random.int(lo, hi)` | `randomInt(source, lo, hi)` |

## Install

```sh
npm install @endo/random
```

## `RandomSource` interface

```ts
type RandomSource = (out: Uint8Array) => void;
```

A `RandomSource` writes random bytes into `out`.
Implementations MUST mutate the buffer in place and MUST NOT retain the buffer reference after the call returns.
Block-stream PRNGs such as `@endo/chacha12` provide this shape via the `fillRandomBytes` method on the `ChaCha12Generator` returned by `makeChaCha12(seed)`, internally managing block buffering.

## Subpath exports

| Path                     | Exports                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `@endo/random`           | `random`, `randomInt`, `randomUint8`, `randomUint16`, `randomUint24`, `randomUint32`, `randomUint53` |
| `@endo/random/random.js` | `random`                                                                                             |
| `@endo/random/int.js`    | `randomInt`                                                                                          |
| `@endo/random/uint.js`   | `randomUint8`, `randomUint16`, `randomUint24`, `randomUint32`, `randomUint53`                        |
| `@endo/random/seeds.js`  | `bobsCoffee32` (canonical 32-byte fuzz seed)                                                         |

For an integration test that drives `@endo/chacha12` directly through `fast-check`'s `randomType` parameter (matching the `pure-rand@8` `RandomGenerator` contract), see the sibling [`@endo/chacha12-fast-check-test`](../chacha12-fast-check-test/) package.

## Determinism

`random` ensures that each respective returned value from streams with the same seed is equal across runs and engines by internally constructing a 53-bit integer and dividing it by `2 ** 53` (which avoids engine-dependent rounding).

`randomInt(source, lo, hi)` uses range-aware rejection sampling: single-byte draws for ranges up to 128 (or exactly 256), two-byte draws up to 32768, and so on.
The per-draw reject probability `p` never exceeds 0.5, and consecutive draws are independent, so the probability of needing more than `k` draws is `p ** k` (decays exponentially) and the probability of an unbounded reject sequence is 0 in the limit.
The expected number of draws per call is `1 / (1 - p)`, bounded by 2.

Different `RandomSource` implementations consume bytes at different rates, so the sequence of sampled values is determined by the seed _together with_ the source choice.
Switching backends produces a different stream.

## Hardening

Every exported function is hardened with `@endo/harden` and is safe to invoke from a SES vat or compartment.
The samplers are pure functions over their `source` argument; module state is limited to a single 8-byte scratch buffer that is zeroed after each call.
