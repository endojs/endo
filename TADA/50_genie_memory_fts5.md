# Work on @endo/genie memory system

- [x] Implement `FTS5Backend`
  - SQLite FTS5 via `better-sqlite3`
  - Porter-stemmed, BM25-ranked full-text search.
  - Supports prefix queries, phrases, boolean operators.
  - Run it in the genie `main.js` unconfined worker alongside its agent harness
  - Added `src/tools/fts5-backend.js` with `makeFTS5Backend()`
  - Wired into `main.js` `buildTools()` with memory tools
  - Added `better-sqlite3` dependency + native build config
  - Tests in `test/fts5-backend.test.js`
