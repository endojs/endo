# Work on @endo/genie memory system

Okay so working on `packages/genie/src/tools/memory.js`, use the plan below to:
1. [x] Define the `SearchBackend` interface and refactor `makeMemoryTools` to accept it.
2. [x] Wrap current `searchInFiles` as a `SubstringBackend` so existing behavior is preserved.

## Search Interface Abstraction Plan

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
