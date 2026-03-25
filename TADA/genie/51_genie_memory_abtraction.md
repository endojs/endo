# Work on @endo/genie memory system

Okay so working on `packages/genie/src/tools/memory.js`, use the plan below to:
- [x] implement the `TODO` feedback left inline about further encapsulating the substring backend's file path handling
  - Moved `searchInFile`, `searchInFiles`, and `findMemoryPaths` out of `makeMemoryTools` and into `makeSubstringBackend`
  - `makeSubstringBackend` now accepts `(initPaths, vfs)` instead of `(paths, searcher)`
  - Backend owns an `indexedPaths` Set and expands directories via `expandPaths` internally
  - `index()` adds paths to the set; `remove()` deletes them
  - No more closure coupling between `makeMemoryTools` and the substring search logic
