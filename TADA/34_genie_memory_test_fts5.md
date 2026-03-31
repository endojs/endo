# Work on @endo/genie tools

Working on `packages/genie/src/tools/memory.js`:

- [x] add a new `packages/genie/test/tools/memory-fts5.test.js`
  - should cover the new sqlite fts5 backend
  - similarly to the substring backend tests in `packages/genie/test/tools/memory.test.js`
  - covers: memorySet (create, overwrite, append, mkdir), memoryGet (full, range, errors),
    memorySearch with FTS5 (basic match, limit, empty results, line numbers),
    FTS5-specific features (Porter stemming, prefix queries, phrase queries,
    NOT/OR operators, auto prefix expansion, BM25 ranking),
    re-indexing on overwrite/append, invalid FTS5 fallback, path safety
  - note: ava runner has a pre-existing env issue (Node 22 compat); test logic
    verified via direct Node execution
