# Work on @endo/genie tools

Okay so working on `packages/genie/src/tools/`:

- [x] unify the `memory-get.js`, `memory-search-core.js`, and `memory-search.js` modules
  - Created `memory.js` with a unified `makeMemoryTools(options)` factory
    following the `makeFileTools` pattern from `filesystem.js`.
  - Added `memorySet` tool (write/append to memory files) — the missing
    complement to `memoryGet`.
  - Shared `safePath()` and `assertCleanContent()` helpers enforce
    path-root traversal limits and injection prevention across all three tools.
  - `searchMemory()` core logic inlined as a module-level helper
    (no longer a separate export).
  - Updated `index.js` to export `makeMemoryTools` instead of the old
    individual `memoryGet` / `memorySearch` exports.
  - Old files (`memory-get.js`, `memory-search-core.js`, `memory-search.js`)
    can be removed once downstream consumers are verified.
