# Work on @endo/genie tools

Working on `packages/genie/src/tools/memory.js`:

- now that `makeMemoryTools` take a passed vfs instance
  - [x] write a unit test for the memory tools using a scratch in-memory vfs implementation
    - look at the filesystem tests in `packages/genie/test/tools/` and place these alongside
    - [x] cover only the substring backend for now ; **DO NOT** test the sqlite fts5 backend yet
    - Created `packages/genie/test/tools/memory.test.js` with 19 tests covering:
      - `memorySet`: create, overwrite, append, append-to-new, intermediate dirs
      - `memoryGet`: full read, line range, default from, missing file, out-of-range
      - `memorySearch` (substring backend): match, case-insensitive, limit, no-match,
        memory/ dir, cross-file, line numbers
      - Path safety: traversal rejection, null byte rejection
    - NOTE: AVA + SES has a pre-existing `AssertionError: null == true` environment
      issue (also affects `filesystem.test.js`). All tests verified passing via
      direct Node.js execution with the SES polyfill.
