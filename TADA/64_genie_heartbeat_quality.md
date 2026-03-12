# Genie heartbeat module quality cleanup

The heartbeat module (`packages/genie/src/heartbeat/index.js`) has
several quality issues that predate the Phase 1 memory work but should
be fixed before the heartbeat is relied on for reflector wiring.

Issues identified in `TADA/62_genie_memory_phase1_review.md` item 4:

- [x] Add `// @ts-check` at the top of the file
- [x] Add `harden()` calls on all exports (`HeartbeatStatus`,
  `makeHeartbeatEvent` return value, `makeWorkspaceLock` return value,
  `makeHeartbeatRunner` return value, `HEARTBEAT_OK_TOKEN`)
- [x] Fix typo: `OpenFileHandle` does not exist in `fs/promises`;
  should be `open` (returns a `FileHandle`). Affects both
  `getLastLine` and `hasContent`
- [x] Fix typo: `' readline'` has a leading space in the import
  string (line 115)
- [x] Fix variable shadowing in `start()`: `const firstDelay =
  await firstDelay()` shadows the outer `firstDelay` function
  — renamed function to `computeFirstDelay`, local to `initialDelay`
- [x] Fix variable shadowing in `inActiveHours()`: `const start`
  shadows the outer `start` method
  — renamed to `rangeStart` / `rangeEnd`
- [x] Fix variable shadowing in `runOnce()`: `const start =
  Date.now()` shadows the outer `start` method
  — renamed to `runStart`
- [x] The `runOnceInternal` return is `[response, status]` array but
  `runOnce` accesses `timedResult.data.response` and
  `timedResult.data.status` as if it were an object -- fix mismatch
  — now destructures: `const [response, status] = timedResult.data`
- [x] Add JSDoc `@typedef` for `HeartbeatRunner` (referenced in
  `@returns` but never defined)
- [x] Add proper `@import` tags for any referenced types
  — added `@typedef` for `HeartbeatEvent` and `HeartbeatRunner`
  at module level; used inline `@type` casts for `NodeJS.ErrnoException`
  on catch variables
