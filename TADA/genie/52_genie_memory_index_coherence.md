# Work on @endo/genie memory search index

Okay so working on `packages/genie/src/tools/memory.js`:

- [x] evolve and refactor memory tool integration with search backend
  - all of the TODO notes between lines 138 and 162
  - [x] **HOWEVER** only update the `memorySet` and `memorySearch` tools if
    what I'm asking for makes sense, the core thing that must be done is the
    search backend initialization, and zombie path culling

## Completed

All five original TODOs have been implemented:

1. **Stop passing `initPaths` to `makeSubstringBackend`** — the
   backend now takes `(vfs, root)` instead; path discovery is handled
   by `expandPaths` + `seedIndex` in `makeMemoryTools`.
2. **`indexedPaths()` on `SearchBackend`** — added to the typedef,
   the `SearchBackendI` interface guard, and both the substring and
   FTS5 backends.
3. **Search-context initialization** — `seedIndex()` discovers live
   files under `watchPaths`, collects prior indexed paths from the
   backend, and enqueues everything for (re-)indexing.
4. **Index queue + worker + zombie culling** — `drainQueue` processes
   the queue one entry at a time; `ensureWorker` manages the
   `indexing` promise and culls zombie paths after the queue drains.
5. **`memorySet` / `memorySearch` integration** — `memorySet`
   appends to `indexQueue` and calls `ensureWorker()`; `memorySearch`
   awaits `seeding` and `indexing` (controllable via `waitForIndex`
   parameter).

Verified with a manual SES-lockdown integration test — all assertions
pass.  The ava test harness has a pre-existing SES/ava 7
compatibility issue (`null == true` assertion in ava worker main)
that is unrelated to these changes.

