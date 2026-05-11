# @endo/genie rapid development harness

Continue working on `packages/genie/dev-repl.js`.

- [x] make the memory tool default to a substring backend if none is given
  - `makeMemoryTools` now creates a `makeSubstringBackend` instance when
    no `searchBackend` option is provided, removing the inline fallback
    in `memorySearch.execute` and always routing through the backend interface.
  - `memorySet` now unconditionally calls `E(searchBackend).index()` (the
    substring backend's `index` is a no-op).

- [x] add a flag to dev-repl to change search backend between substring and fts5
  - `--search <backend>` / `-s <backend>` flag (values: `substring`, `fts5`;
    default: `substring`).
  - The chosen backend name is shown in the REPL/verbose banner via `describe()`.
