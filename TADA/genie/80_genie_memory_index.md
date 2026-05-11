# Work on @endo/genie memory search index

Okay so working on `packages/genie/src/tools/memory.js`:

- currently the core of our search is simple substring occurrence
  as implemented by `searchInFiles`

- [x] research how we can use sqlite fts5 to build a search index

- [x] research how we can use vector embeddings to build a search index

- [x] plan how we'll need to accept a search interface abstraction
  passed to the `makeMemoryTools` constructor

Write up your research and plans here in this document, do not
modify the memory tool code yet.

---

## 1. SQLite FTS5 Research

### NPM Packages with FTS5 Support

| Package                  | Type                    | FTS5                      | Persistence    | SES Safe               |
|--------------------------|-------------------------|---------------------------|----------------|------------------------|
| `better-sqlite3`         | Native C++ addon        | Yes (default)             | File-backed    | No (needs worker)      |
| `sql.js-fts5`            | Pure WASM (Emscripten)  | Yes                       | In-memory only | Likely (needs testing) |
| `node-sqlite3-wasm`      | WASM with fs VFS        | Needs verification        | File-backed    | Likely (needs testing) |
| `node:sqlite` (Node 22+) | Built-in (experimental) | Depends on bundled SQLite | File-backed    | Unknown                |

**`better-sqlite3`** is fastest (native bindings, synchronous API) and FTS5 is
compiled in by default. Its C++ addon core won't break from frozen primordials,
but the JS wrapper layer may have patterns incompatible with hardened objects.
Must run outside the SES Compartment.

**`sql.js-fts5`** is a WASM build of SQLite with FTS5 compiled in. No native
compilation required. WASM runs in its own linear memory, separate from JS heap
objects, so primordial freezing shouldn't matter. Concern: the Emscripten glue
code may use `eval`, dynamic `Function()`, or global mutations that SES
disallows. Entire DB lives in memory — must manually serialize with
`db.export()` and write to disk.

**`node-sqlite3-wasm`** has WASM isolation benefits like sql.js but adds a VFS
that maps to Node.js `fs` for file-backed persistence. Best of both worlds if
FTS5 is compiled in (needs verification).

### How FTS5 Works

**Table creation:**

```sql
CREATE VIRTUAL TABLE memory_fts USING fts5(
  filename,
  content,
  tokenize = 'porter unicode61'
);
```

**Querying with BM25 ranking:**

```sql
SELECT *, rank FROM memory_fts
WHERE memory_fts MATCH 'search terms'
ORDER BY rank;
```

**Key query features:**

- Prefix queries: `'pref*'`
- Phrase matching: `'"exact phrase"'`
- Boolean operators: `'term1 AND term2'`, `'term1 OR term2'`,
  `'term1 NOT term2'`
- Column-specific: `'filename:notes'`
- BM25 with column weights:
  `bm25(memory_fts, 1.0, 10.0) AS score`

**Auxiliary functions:**

- `snippet(table, col, before, after, ellipsis, max_tokens)` —
  extract a fragment around the match
- `highlight(table, col, before, after)` — wrap matched terms
- `bm25(table, w1, w2, ...)` — relevance scoring with column weights
- Built-in `rank` column returns BM25 scores automatically

### Tokenizers

| Tokenizer   | Description                                                               | Best For                      |
|-------------|---------------------------------------------------------------------------|-------------------------------|
| `unicode61` | Default. Case-insensitive, removes diacritics, splits on non-alphanumeric | General text                  |
| `porter`    | Wrapper applying Porter stemming ("correction" → "correct")               | English content               |
| `trigram`   | Indexes all 3-char subsequences, enables substring matching               | Code search, partial matching |

For markdown memory files, `porter unicode61` is the best default — handles
English stemming, Unicode normalization, and case-insensitive matching.

### Performance

For a corpus of hundreds of markdown files (a few MB total):

- **Index build:** sub-second
- **Query latency:** sub-millisecond
- **Index size:** ~1-2x the original text size
- FTS5 is ~40% faster indexing and ~30% faster queries than FTS3/FTS4

### Incremental Update Strategy

Use a **regular FTS table** (stores its own copy of content) with
mtime-based invalidation:

```sql
CREATE TABLE memory_meta(
  filename TEXT PRIMARY KEY,
  mtime REAL NOT NULL
);

CREATE VIRTUAL TABLE memory_fts USING fts5(
  filename,
  content,
  tokenize = 'porter unicode61'
);
```

On search:
1. Compare current file `mtime` against stored `mtime`.
2. Re-index only changed files (DELETE old + INSERT new).
3. Periodically run
   `INSERT INTO memory_fts(memory_fts) VALUES('optimize')` to merge
   b-tree segments.

Alternatively, a **contentless table** (`content=''`) stores only the
index and returns only rowids — content is read from the filesystem.
Smallest disk footprint but cannot `DELETE`, only special
`'delete'` commands.

---

## 2. Vector Embeddings Research

### Embedding Models (Local/Offline)

Primary option: **Transformers.js** (`@huggingface/transformers`)
runs ONNX-optimized models in Node.js via `onnxruntime-node`.

| Model                            | Dims | Size (ONNX) | Max Tokens | Notes                                                |
|----------------------------------|------|-------------|------------|------------------------------------------------------|
| `Xenova/all-MiniLM-L6-v2`        | 384  | ~22 MB      | 256        | Best speed/quality for short text. ~14k sent/sec CPU |
| `Xenova/bge-small-en-v1.5`       | 384  | ~33 MB      | 512        | Better for longer chunks                             |
| `nomic-ai/nomic-embed-text-v1.5` | 768  | ~130 MB     | 8192       | Handles long documents                               |
| `Xenova/all-mpnet-base-v2`       | 768  | ~110 MB     | 384        | Higher accuracy (~88% STS-B)                         |

**`all-MiniLM-L6-v2`** is the best fit for memory files.
The 256-token limit is adequate for notes (~200 words per chunk).
22 MB model is small enough to bundle.

**Dependency cost:** `onnxruntime-node` is ~720 MB uncompressed.
This is significant.
Fallback: subprocess calling `ollama` or a lightweight embedding
server could replace it.

### Vector Storage Options

| Option              | Type                      | Pros                                                | Cons                                         |
|---------------------|---------------------------|-----------------------------------------------------|----------------------------------------------|
| **sqlite-vec**      | SQLite extension (pure C) | Single-file DB, SQL joins, transactional, zero deps | Brute-force (fine for <10k vectors)          |
| hnswlib-node        | Native C++ addon          | Sub-ms queries, ANN search                          | Native compilation, no metadata storage      |
| Vectra              | Pure JavaScript           | Zero native deps                                    | Loads full index in memory, limited features |
| Manual cosine in JS | No deps                   | Full control                                        | Must load all vectors into JS                |

**`sqlite-vec`** is the best fit.
For hundreds of files (a few thousand chunks), brute-force search is
fast enough (microseconds).
With 384-dim float32 vectors and 5,000 chunks, the vector table is
~7.5 MB.

```sql
CREATE VIRTUAL TABLE vec_chunks USING vec0(
  chunk_id INTEGER PRIMARY KEY,
  embedding float[384]
);
```

KNN query:

```sql
SELECT c.file_path, c.content, v.distance
FROM vec_chunks v
JOIN chunks c ON c.id = v.chunk_id
WHERE v.embedding MATCH ?
ORDER BY v.distance
LIMIT 10
```

### Indexing Pipeline

1. **Chunk markdown** — split on headings (##, ###) as natural
   section boundaries.
   ~200 tokens per chunk, 20-50 token overlap.
   For short files (< 200 tokens), embed whole file.
2. **Generate embeddings** — batch through Transformers.js pipeline
   (32 chunks at a time).
3. **Store** — chunk metadata in regular table, embeddings in vec0
   virtual table, wrapped in a transaction.
4. **Query** — embed query string, KNN search against vec0, join
   with metadata.
5. **Incremental reindex** — track file mtime, only re-embed
   changed files.

### Local vs API-Based Embeddings

| Factor           | Local (MiniLM)         | API (OpenAI)         |
|------------------|------------------------|----------------------|
| Model size       | 22 MB + 720 MB runtime | 0 (cloud)            |
| Indexing speed   | ~14k sent/sec CPU      | ~500ms per request   |
| Query latency    | 10-50ms                | 500ms p90            |
| Accuracy (STS-B) | 84-85%                 | ~92% (3-large)       |
| Cost             | Free                   | ~$0.03 for 8k chunks |
| Offline          | Yes                    | No                   |
| Privacy          | Full local             | Data sent to API     |

Local inference is strongly preferred for personal notes: offline
capability, consistent latency, and privacy outweigh the accuracy gap.

---

## 3. SES / Hardened JavaScript Compatibility

This is the most critical constraint.

### The Two Worker Execution Paths

From `packages/daemon/src/worker.js`:

1. **`makeUnconfined`** — uses native `import()`, runs outside any
   SES Compartment.
   This is the escape hatch for native modules.
2. **`makeBundle`** — runs through `importBundle` inside a
   Compartment with limited endowments (`E`, `Far`, `makeExo`, `M`,
   `TextEncoder`, `TextDecoder`, `URL`, `console`, `assert`).

### Module Compatibility Under SES

- **onnxruntime-node:** Native C++ addon.
  Cannot run inside a SES Compartment.
  May mutate built-in prototypes during init.
  **Must run in an unconfined worker or subprocess.**

- **better-sqlite3:** Native C++ addon.
  Same constraints as onnxruntime-node.
  C++ core works post-lockdown, but JS wrapper may conflict.
  **Must run outside the SES Compartment.**

- **sqlite-vec:** Loaded as a SQLite extension (C shared library)
  into better-sqlite3's SQLite instance.
  Does not interact with JS prototypes.
  **Compatible as long as better-sqlite3 is loaded outside SES.**

- **Transformers.js:** Pure JS wrapper depends on onnxruntime-node.
  JS wrapper may touch frozen prototypes.
  **Likely incompatible with SES Compartment without shims.**

- **sql.js-fts5:** WASM + Emscripten glue.
  WASM isolation is good, but Emscripten glue code may use `eval` or
  dynamic `Function()` which SES disallows.
  **Needs testing.**

### Recommended Architecture

Run the search subsystem as an **unconfined plugin** in the Endo
daemon, mirroring how `web-server-node.js` works:

```
[SES Compartment: Guest/Agent code]
  |
  | E(searchIndex).query("find notes about X")
  | E(searchIndex).reindex("memory/notes.md", content)
  |
  v
[Unconfined Worker: search-index-node.js]
  - import('@huggingface/transformers')
  - import('better-sqlite3')
  - import('sqlite-vec')
  - Exposes Far/makeExo interface back to SES world
```

The unconfined worker uses native `import()` which runs in the
Node.js module system outside the Compartment sandbox.
SES lockdown has already occurred in the worker process, but native
addons loaded post-lockdown generally work because they operate at
the C/C++ level below the frozen JS prototype chain.

**Fallback:** If post-lockdown import fails, spawn a separate Node.js
process without SES for embedding/search work.

---

## 4. Search Interface Abstraction Plan

### Goal

Replace the hardcoded `searchInFiles` function in `makeMemoryTools`
with a pluggable search backend, passed via the options object.

### Interface Shape

```js
/**
 * @typedef {object} SearchBackend
 * @property {(query: string, opts?: {limit?: number}) =>
 *   Promise<Array<SearchResult>>} search
 * @property {(filename: string, content: string) =>
 *   Promise<void>} index
 * @property {(filename: string) =>
 *   Promise<void>} remove
 * @property {() => Promise<void>} [sync]
 */
```

The `SearchBackend` would be a Far reference (remotable) when
running in a separate worker, or a local object for in-process
backends.

### How `makeMemoryTools` Changes

```js
const makeMemoryTools = (options = {}) => {
  const {
    root = process.cwd(),
    searchBackend,    // <-- new optional parameter
  } = options;

  // ... existing safePath, memoryGet, memorySet unchanged ...

  const memorySearch = makeTool('memorySearch', {
    // ...
    async execute({ query, limit = 5 }) {
      if (searchBackend) {
        // Delegate to the pluggable backend
        const results = await E(searchBackend).search(query, { limit });
        return { success: true, query, limit, results };
      }
      // Fall back to existing substring search
      const results = [];
      for await (const result of searchInFiles(searchPaths, query)) {
        results.push(result);
        if (results.length >= limit) break;
      }
      return { success: true, query, limit, results };
    },
  });

  // ... also hook memorySet to call searchBackend.index() ...
};
```

### Keeping the Index in Sync

When `memorySet` writes a file, it should also update the search
index:

```js
async execute({ path, content, append = false }) {
  // ... existing write logic ...

  // Update search index if backend is present
  if (searchBackend) {
    const fullContent = append
      ? await fs.readFile(fullPath, 'utf-8')
      : content;
    await E(searchBackend).index(path, fullContent);
  }

  return { success: true, path, bytesWritten };
}
```

A `sync()` method on the backend would handle bulk reindexing on
startup (walk all memory files, check mtimes, re-index stale ones).

### Backend Implementations

Three backends, progressively more capable:

1. **Substring backend** (current behavior, default) —
   `searchInFiles` wrapped in the `SearchBackend` interface.
   Zero dependencies. Ships as the fallback.

2. **FTS5 backend** —
   SQLite FTS5 via better-sqlite3 or sql.js-fts5.
   Porter-stemmed, BM25-ranked full-text search.
   Supports prefix queries, phrases, boolean operators.
   Runs in an unconfined worker.

3. **Vector backend** —
   Transformers.js embeddings + sqlite-vec storage.
   Semantic similarity search.
   Can combine with FTS5 for hybrid ranking
   (keyword match + semantic similarity).
   Runs in an unconfined worker.

### Guard / Schema

The `SearchBackend` would be defined as an `M.interface()`:

```js
const SearchBackendI = M.interface('SearchBackend', {
  search: M.callWhen(
    M.string(),
    M.splitRecord({}, { limit: M.number() }),
  ).returns(M.arrayOf(M.record())),
  index: M.callWhen(M.string(), M.string()).returns(M.undefined()),
  remove: M.callWhen(M.string()).returns(M.undefined()),
  sync: M.callWhen().returns(M.undefined()),
});
```

### Recommended Implementation Order

1. Define the `SearchBackend` interface and refactor
   `makeMemoryTools` to accept it.
2. Wrap current `searchInFiles` as a `SubstringBackend` so
   existing behavior is preserved.
3. Implement `FTS5Backend` — this is the highest-value improvement
   (stemming, ranking, phrases) with the least dependency cost.
4. Implement `VectorBackend` as an optional upgrade when the
   ~720 MB onnxruntime-node dependency is acceptable.
5. Consider a **hybrid backend** that runs both FTS5 and vector
   search, merging/reranking results.

---

## 5. Summary

| Approach                     | Value Add                               | Dependency Cost               | SES Strategy               |
|------------------------------|-----------------------------------------|-------------------------------|----------------------------|
| FTS5 (better-sqlite3)        | Stemming, BM25 ranking, phrases, prefix | ~8 MB (better-sqlite3)        | Unconfined worker          |
| FTS5 (sql.js-fts5)           | Same as above                           | ~5 MB (WASM)                  | May work in-process (test) |
| Vector (MiniLM + sqlite-vec) | Semantic similarity                     | ~750 MB (onnxruntime + model) | Unconfined worker          |
| Hybrid (FTS5 + Vector)       | Best of both                            | ~755 MB                       | Unconfined worker          |

**Recommendation:**
- Start with FTS5 via better-sqlite3 in an unconfined worker.
- This gives the biggest search quality improvement (stemming, ranking, phrase
  matching) with minimal dependency cost.
- Vector search can be layered on later as an optional upgrade.
