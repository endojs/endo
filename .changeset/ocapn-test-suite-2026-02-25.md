---
'@endo/ocapn': minor
---

Sync `@endo/ocapn` with [ocapn-test-suite](https://github.com/ocapn/ocapn-test-suite) at commit [74db78f08a40efba1e2b975d809374ff0e7acf60](https://github.com/ocapn/ocapn-test-suite/commit/74db78f08a40efba1e2b975d809374ff0e7acf60) (2026-02-25).

- GC operations use list payloads (`exportPositions` / `wireDeltas`, `answerPositions`); wire labels `op:gc-exports` and `op:gc-answers`.
- Remove `op:deliver-only`; fire-and-forget delivery uses `op:deliver` with `answerPosition` and `resolveMeDesc` set to `false`.
- Codec refactors: `makeOcapnFalseForOptionalCodec` for optional `false` branches, homogeneous Syrup lists via `makeListCodecFromEntryCodec`, and related cleanup in operations and peer location hints.

CI integration for the Python test suite is pinned to the same commit.
