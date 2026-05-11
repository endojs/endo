# Implement search index initialization in makeMemoryTools

Phase 0 prerequisite for genie tiered memory (from
`PLAN/genie_memory_implementation.md`).

## Problem

Search index initialization is a TODO at `memory.js:145`.
On startup, files in `watchPaths` are not indexed until the first
`memorySet` call.
This means `memorySearch` returns empty results for existing files
until something triggers a write.

## Tasks

- [x] In `makeMemoryTools`, traverse `watchPaths` on construction
  - Already implemented via `seedIndex()` which calls
    `expandPaths(initPaths, vfs)` and enqueues discovered files.
- [x] Index each discovered file via the search backend
  - `drainQueue()` reads each file and calls
    `E(searchBackend).index()` with the relative path and content.
- [x] Prune stale entries (files that no longer exist on disk)
  - `ensureWorker(priorPaths)` collects backend's `indexedPaths()`,
    then removes zombie entries remaining after the seed pass.
- [x] Expose an `indexing` promise so callers can await initial
  indexing if needed (e.g., before first search)
  - `makeMemoryTools` now returns `{ memoryGet, memorySet,
    memorySearch, indexing }` where `indexing` is the `seeding`
    promise.

## What changed

- `src/tools/memory.js` — added `indexing: seeding` to the return
  value of `makeMemoryTools`; added `@returns` JSDoc.
- `test/tools/memory.test.js` — added three startup-indexing tests:
  pre-existing MEMORY.md, pre-existing memory/ dir files, and
  indexing-resolves-with-no-files.
- `test/tools/memory-fts5.test.js` — added three startup-indexing
  tests: pre-existing MEMORY.md, pre-existing memory/ dir files, and
  stale-entry pruning.

## Note

Tests could not be run due to pre-existing /tmp inode exhaustion
(~107K stale `TestIntegration_StartRebase_Squash*` directories).
The code was verified manually via `node --import @endo/init/debug.js`.

## Context

- `src/tools/memory.js` — `makeMemoryTools` factory
- `src/tools/fts5-backend.js` — SQLite FTS5 backend with
  `index()` and `sync()` methods
- The FTS5 backend already supports indexing arbitrary paths;
  the gap is that nobody calls it at startup

## References

- `PLAN/genie_memory_implementation.md` § Phase 0
- `PLAN/genie_memory_overview.md`
