# @endo/ocapn

## 1.1.0

### Minor Changes

- [#3192](https://github.com/endojs/endo/pull/3192) [`08b077d`](https://github.com/endojs/endo/commit/08b077d7a97be3dd28d7f424b7bf1742254b7c9d) Thanks [@kumavis](https://github.com/kumavis)! - Sync `@endo/ocapn` with [ocapn-test-suite](https://github.com/ocapn/ocapn-test-suite) at commit [74db78f08a40efba1e2b975d809374ff0e7acf60](https://github.com/ocapn/ocapn-test-suite/commit/74db78f08a40efba1e2b975d809374ff0e7acf60) (2026-02-25).
  - GC operations use list payloads (`exportPositions` / `wireDeltas`, `answerPositions`); wire labels `op:gc-exports` and `op:gc-answers`.
  - Remove `op:deliver-only`; fire-and-forget delivery uses `op:deliver` with `answerPosition` and `resolveMeDesc` set to `false`.
  - Codec refactors: `makeOcapnFalseForOptionalCodec` for optional `false` branches, homogeneous Syrup lists via `makeListCodecFromEntryCodec`, and related cleanup in operations and peer location hints.

  CI integration for the Python test suite is pinned to the same commit.

## 1.0.0

### Major Changes

- [#3183](https://github.com/endojs/endo/pull/3183) [`279c0c4`](https://github.com/endojs/endo/commit/279c0c48b219f4b03af154e48e14e693b5806e90) Thanks [@kumavis](https://github.com/kumavis)! - Initial public release of `@endo/ocapn`. The package is no longer private and is now published to npm.

  Tested against the python test suite from 2026-01-06 https://github.com/ocapn/ocapn-test-suite/commits/f0273f21c5ee05a28785b51c231535124f28bca9

### Minor Changes

- [#3172](https://github.com/endojs/endo/pull/3172) [`6405b36`](https://github.com/endojs/endo/commit/6405b365a479a3bf65e5f1f65bf2c67b75667902) Thanks [@turadg](https://github.com/turadg)! - Parameterize CapTP slot types and improve TypeScript 6 conformance across the OCapN client surface. Compile-time type changes only; no runtime behavior changes.

### Patch Changes

- Updated dependencies [[`f65b000`](https://github.com/endojs/endo/commit/f65b0002324d38210d11000cff741c5c8dc83b60), [`d1d9625`](https://github.com/endojs/endo/commit/d1d96256f47c5209dfce3f3d52d3f222f266121a), [`88bc2b9`](https://github.com/endojs/endo/commit/88bc2b915d95326a3e911a9f8bf4571d948c44d8), [`e619205`](https://github.com/endojs/endo/commit/e6192056a5d7ff5acb084f6a58dca3663aa9943e), [`43165e5`](https://github.com/endojs/endo/commit/43165e584cfd6437c7f8edb8872ff81ed4415ed6), [`6ada52b`](https://github.com/endojs/endo/commit/6ada52b6e6fdb19508624a1c93bd4a65c60670dd)]:
  - @endo/eventual-send@1.5.0
  - @endo/promise-kit@1.2.1
  - @endo/pass-style@1.8.0
  - @endo/marshal@1.9.1
  - @endo/harden@1.1.0
  - @endo/nat@5.2.0

## [0.2.2](https://github.com/endojs/endo/compare/@endo/ocapn@0.2.1...@endo/ocapn@0.2.2) (2025-07-12)

**Note:** Version bump only for package @endo/ocapn

## [0.2.1](https://github.com/endojs/endo/compare/@endo/ocapn@0.2.0...@endo/ocapn@0.2.1) (2025-06-17)

**Note:** Version bump only for package @endo/ocapn

## 0.2.0 (2025-06-02)

### Features

- **ocapn:** Initial codecs for OCapN messages and Passable ([1439a1e](https://github.com/endojs/endo/commit/1439a1ef6070ffa3a85d994677ce9cbd89989bd0))
- **ocapn:** Introduce initial OCapN package ([290ca15](https://github.com/endojs/endo/commit/290ca150356f4d7626ab9241881adeb82eee84fc))
- **ocapn:** protect against invalid strings ([a84dd7f](https://github.com/endojs/endo/commit/a84dd7f128c9d34292a9d28de012a02fab0d5288))

### Bug Fixes

- **ocapn:** fix for tagged types and float64 0 found via new Passable fuzzing test ([00ca871](https://github.com/endojs/endo/commit/00ca8717c86a6663a99e4010a47debd658cc93dd))
- **ocapn:** improve input checking of syrup string test utils ([6551e4c](https://github.com/endojs/endo/commit/6551e4c9667d2c6ff90e7c94fe718771be05dacc))
- **ocapn:** passable structs must have ordered keys ([f2767c1](https://github.com/endojs/endo/commit/f2767c1745a8a2aebd14f6197695140ca1025060))
