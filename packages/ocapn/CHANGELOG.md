# @endo/ocapn

## 1.1.0

### Minor Changes

- [#3256](https://github.com/endojs/endo/pull/3256) [`bdb9ddc`](https://github.com/endojs/endo/commit/bdb9ddc50d3aa9cef17b61a4d587a14a39142470) Thanks [@kriskowal](https://github.com/kriskowal)! - - Add a `framing` option to `makeTcpNetLayer` (`@endo/ocapn/netlayer/tcp-testing`). The default is `'syrup'`, which wraps each message in the `<length>:<payload>` framing implemented by `@endo/syrup-frame`. This is the framing the OCapN TCP-for-testing netlayer is moving toward (cf. the 2025-12-09 OCapN plenary, https://github.com/ocapn/ocapn/blob/main/meeting-minutes/2025-12-09.md), and is robust to TCP chunk boundaries that split a single OCapN message. Pass `framing: 'none'` to interoperate with the existing `ocapn/ocapn-test-suite` Python `testing_only_tcp` netlayer, which writes a syrup-encoded record with `sendall` and reads one back with `syrup.syrup_read` (no length prefix on the wire). The `'none'` option exists only for that suite's sake and goes away once the suite either adopts syrup framing or is retired.

- [#3192](https://github.com/endojs/endo/pull/3192) [`08b077d`](https://github.com/endojs/endo/commit/08b077d7a97be3dd28d7f424b7bf1742254b7c9d) Thanks [@kumavis](https://github.com/kumavis)! - Sync `@endo/ocapn` with [ocapn-test-suite](https://github.com/ocapn/ocapn-test-suite) at commit [74db78f08a40efba1e2b975d809374ff0e7acf60](https://github.com/ocapn/ocapn-test-suite/commit/74db78f08a40efba1e2b975d809374ff0e7acf60) (2026-02-25).
  - GC operations use list payloads (`exportPositions` / `wireDeltas`, `answerPositions`); wire labels `op:gc-exports` and `op:gc-answers`.
  - Remove `op:deliver-only`; fire-and-forget delivery uses `op:deliver` with `answerPosition` and `resolveMeDesc` set to `false`.
  - Codec refactors: `makeOcapnFalseForOptionalCodec` for optional `false` branches, homogeneous Syrup lists via `makeListCodecFromEntryCodec`, and related cleanup in operations and peer location hints.

  CI integration for the Python test suite is pinned to the same commit.

- [#3209](https://github.com/endojs/endo/pull/3209) [`20f9e21`](https://github.com/endojs/endo/commit/20f9e2123888e334ebe6e00cb84858afa4dcf242) Thanks [@kumavis](https://github.com/kumavis)! - - Add a WebSocket netlayer exported as `@endo/ocapn/netlayer/ws` (`makeWebSocketNetLayer`). Used for interop with Guile-Goblins peers and for any other transport that prefers a framed WebSocket over the raw TCP test netlayer.
  - Add `@endo/ocapn/netlayer/tcp-testing` to the package's `exports` map so consumers can import the existing test netlayer without reaching into `src/`.
  - The main entry (`@endo/ocapn`) now re-exports `makeClient` and the swissnum helpers `swissnumFromBytes` / `swissnumToBytes` so consumers don't need a deep `src/client/...` import for the common case.
  - `makeClient` accepts a new `logger` option; when omitted the existing console-based logger is used, so this is backwards-compatible.
  - The CapTP version-mismatch log on `start-session` now includes both the received and expected version strings.

### Patch Changes

- Updated dependencies [[`ad7a177`](https://github.com/endojs/endo/commit/ad7a177e84b08c74526ceb9b0ea15f3c81c06158), [`dd45f4a`](https://github.com/endojs/endo/commit/dd45f4a7ffcf9f8d6fb3aa23a5d22fe00beef8e8), [`45d06cd`](https://github.com/endojs/endo/commit/45d06cd1624241b371c3ccc2076138c42ee7bd80), [`38fe678`](https://github.com/endojs/endo/commit/38fe6787d8187ec6614fc8f2dcb5b08088cbb0d2)]:
  - @endo/hex@1.1.0
  - @endo/bytes@1.0.0
  - @endo/marshal@1.10.0
  - @endo/syrup-frame@0.1.1

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
