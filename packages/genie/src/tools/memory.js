// @ts-check

/**
 * Memory Tools Module
 *
 * Provides get, set, and search tools for memory files.
 * All accessed paths must resolve under the configured root directory.
 *
 * File I/O is delegated to a {@link VFS} backend so that the tool
 * logic is decoupled from Node-specific APIs.  By default,
 * {@link makeNodeVFS} is used, but callers may supply any conforming
 * implementation.
 */

import {
  basename,
  dirname,
  join,
  relative,
  resolve,
} from 'path';

import { E } from '@endo/far';
import { M } from '@endo/patterns';

import { makeTool } from './common.js';
import { makeNodeVFS } from './vfs-node.js';

/** @import { VFS } from './vfs.js' */

/**
 * @typedef {object} SearchResult
 * @property {string} file
 * @property {number} line
 * @property {string} content
 */

/**
 * @typedef {object} SearchBackend
 * @property {(query: string, opts?: {limit?: number}) =>
 *   Promise<Array<SearchResult>>} search
 * @property {(filename: string, content: string) =>
 *   Promise<void>} index
 * @property {(filename: string) =>
 *   Promise<void>} remove
 * @property {() => AsyncIterable<string>} indexedPaths
 * @property {() => Promise<void>} [sync]
 */

/**
 * The `SearchBackend` interface guard for use with `makeExo`.
 */
const SearchBackendI = M.interface('SearchBackend', {
  search: M.callWhen(
    M.string(),
    M.splitRecord({}, { limit: M.number() }),
  ).returns(M.arrayOf(M.record())),
  index: M.callWhen(M.string(), M.string()).returns(M.undefined()),
  remove: M.callWhen(M.string()).returns(M.undefined()),
  indexedPaths: M.call().returns(M.any()),
  sync: M.callWhen().returns(M.undefined()),
});
harden(SearchBackendI);

/**
 * Async generator that takes a readable stream of raw chunks and yields
 * complete lines (without trailing newline characters).  A final partial
 * line (one not terminated by '\n') is yielded as well.
 *
 * @param {AsyncIterable<Uint8Array>} chunks - An async iterable of
 *   byte chunks (e.g. from a VFS read stream).
 * @yields {string} Individual lines from the stream.
 */
async function* streamLines(chunks) {
  const decoder = new TextDecoder();
  let tail = '';
  for await (const chunk of chunks) {
    const text = tail + decoder.decode(chunk, { stream: true });
    const parts = text.split('\n');
    // The last element is either '' (if chunk ended with \n) or a partial
    // line that must be carried over.
    tail = /** @type {string} */ (parts.pop());
    for (const line of parts) {
      yield line;
    }
  }
  // Flush the decoder.
  tail += decoder.decode();
  // Yield the final partial line if present.
  if (tail.length > 0) {
    yield tail;
  }
}

/**
 * Resolve `userPath` against `root` and assert the result stays under `root`.
 *
 * @param {string} root - The path supplied by the caller.
 * @param {string} userPath - The path supplied by the caller.
 * @returns {string} The resolved absolute path.
 */
const safePath = (root, userPath) => {
  if (userPath.includes('\0')) {
    throw new Error('Invalid path: null bytes not allowed');
  }
  const resolved = resolve(root, userPath);
  const rel = relative(root, resolved);
  // If the relative path starts with ".." or is absolute, it escapes the root.
  if (rel.startsWith('..') || resolve(rel) === rel) {
    throw new Error(
      `Invalid path: must resolve under root (${root})`,
    );
  }
  return resolved;
};

/**
 * Resolve a set of root paths into individual file paths by
 * expanding directories into their `.md` entries.
 *
 * @param {Iterable<string>} roots
 * @param {VFS} vfs
 * @yields {string} Absolute file paths.
 */
async function* expandPaths(roots, vfs) {
  for (const searchPath of roots) {
    try {
      const info = await vfs.stat(searchPath);
      if (info.type === 'file') {
        yield searchPath;
      } else if (info.type === 'directory') {
        for await (const entry of vfs.readdir(searchPath)) {
          if (entry.name.endsWith('.md')) {
            yield join(searchPath, entry.name);
          }
        }
      }
    } catch {
      // Path does not exist (yet); skip silently.
    }
  }
}

/**
 * Create memory tools (memoryGet, memorySet, memorySearch) that enforce a
 * common path-root traversal limit.
 *
 * @param {object} [options]
 * @param {string} [options.root] - Root directory that all paths must resolve
 *   under. Defaults to `process.cwd()`.
 * @param {string[]} [options.watchPaths] - memory file paths to index and watch
 * @param {SearchBackend} [options.searchBackend] - Pluggable search backend.
 *   When provided, `memorySearch` delegates to `E(searchBackend).search()`
 *   and `memorySet` calls `E(searchBackend).index()` to keep the index
 *   in sync.  When omitted, the built-in substring search is used.
 * @param {VFS} [options.vfs] - Virtual filesystem backend.  Defaults to
 *   a Node.js `fs`-backed implementation.
 */
const makeMemoryTools = (options = {}) => {
  const {
    root = process.cwd(),
    watchPaths = ['MEMORY.md', 'memory'],
    vfs = makeNodeVFS(),
    searchBackend = makeSubstringBackend(vfs, resolve(root)),
  } = options;

  const resolvedRoot = resolve(root);

  // -- Index queue and worker --------------------------------------------------
  // The index queue holds absolute file paths awaiting (re-)indexing.
  // The worker drains the queue one entry at a time and feeds content
  // to the search backend.  `indexing` resolves once the queue is
  // fully drained (including zombie-path culling after the initial
  // seed pass).

  /** @type {string[]} */
  const indexQueue = [];

  /** @type {Promise<void> | null} */
  let indexing = null;

  /** @type {((value: void) => void) | null} */
  let resolveIndexing = null;

  /**
   * Process the index queue one entry at a time, feeding each file's
   * content to the search backend.  Returns the set of paths that
   * were successfully indexed (used for zombie culling).
   *
   * @param {Set<string>} priorPaths - Previously indexed paths to
   *   prune from as live paths are encountered.
   * @returns {Promise<void>}
   */
  const drainQueue = async (priorPaths) => {
    while (indexQueue.length > 0) {
      const filePath = /** @type {string} */ (indexQueue.shift());
      try {
        const content = await vfs.readFile(filePath);
        // Derive the relative path for backend storage.
        const relPath = relative(resolvedRoot, filePath);
        await E(searchBackend).index(relPath, content);
        priorPaths.delete(relPath);
      } catch {
        // File may have been removed between enqueue and index; skip.
      }
    }
  };

  /**
   * Ensure the index worker is running.  If it is already active the
   * existing `indexing` promise is returned; otherwise a new worker
   * cycle is started.
   *
   * @param {Set<string>} [priorPaths] - When provided (initial seed),
   *   zombie paths remaining in this set are removed from the backend
   *   after the queue is drained.
   * @returns {Promise<void>}
   */
  const ensureWorker = (priorPaths = new Set()) => {
    if (indexing) {
      return indexing;
    }
    indexing = new Promise(res => {
      resolveIndexing = res;
    });
    const run = async () => {
      await drainQueue(priorPaths);
      // Cull zombie paths — entries the backend knew about that no
      // longer exist on disk.
      for (const zombie of priorPaths) {
        await E(searchBackend).remove(zombie);
      }
      const done = resolveIndexing;
      indexing = null;
      resolveIndexing = null;
      if (done) {
        done(undefined);
      }
    };
    void run();
    return /** @type {Promise<void>} */ (indexing);
  };

  // -- Initialization: seed the index from watchPaths -------------------------
  const initPaths = watchPaths.map(p => safePath(resolvedRoot, p));

  /**
   * Collect all prior indexed paths from the backend and discover all
   * live files under the configured watch roots, then kick off the
   * index worker.
   */
  const seedIndex = async () => {
    // Collect prior indexed paths from the backend (may be empty on
    // first run).
    /** @type {Set<string>} */
    const priorPaths = new Set();
    const priorIter = await E(searchBackend).indexedPaths();
    for await (const p of priorIter) {
      priorPaths.add(p);
    }

    // Discover live files and enqueue them.
    for await (const filePath of expandPaths(initPaths, vfs)) {
      indexQueue.push(filePath);
    }

    // Start (or join) the worker — priorPaths will be pruned as live
    // files are indexed, and any remaining entries are zombies.
    await ensureWorker(priorPaths);
  };

  // Fire-and-forget; memorySearch will await `indexing` if needed.
  const seeding = seedIndex();

  const memoryGet = makeTool('memoryGet', {
    help: function*() {
      yield 'Reads specific lines from a memory file (MEMORY.md or memory/*.md).';
      yield '';
      yield 'Use after memorySearch to read the relevant lines it found.';
      yield 'For reading regular project files, use readFile instead.';
      yield '';
      yield '**Parameters:**';
      yield '- `path`: Path to memory file (required)';
      yield '- `from`: Starting line number (optional, default: 1)';
      yield '- `lines`: Number of lines to fetch (optional)';
      yield '';
      yield '**Example:**';
      yield '```';
      yield 'memoryGet({ path: "MEMORY.md", from: 1, lines: 20 })';
      yield '```';
    },

    schema: M.call(
      M.splitRecord(
        { path: M.string() },
        { from: M.number(), lines: M.number() },
      ),
    ).returns(
      M.splitRecord(
        { success: M.boolean(), path: M.string(), content: M.string() },
        { from: M.number(), lines: M.number() },
      ),
    ),

    /**
     * @param {object} opts
     * @param {string} opts.path
     * @param {number} [opts.from]
     * @param {number} [opts.lines]
     * @returns {Promise<{success: boolean, path: string, content: string, from?: number, lines?: number}>}
     */
    async execute({ path, from = 1, lines }) {
      const fullPath = safePath(resolvedRoot, path);
      const collected = [];

      try {
        const stream = vfs.createReadStream(fullPath);
        const fromIndex = from - 1; // Convert to 0-based index
        const toIndex = lines !== undefined ? fromIndex + lines : Infinity;

        if (fromIndex < 0) {
          throw new Error(`Invalid range: from=${from}`);
        }

        let lineNum = 0;
        let totalLines = 0;
        for await (const line of streamLines(stream)) {
          totalLines = lineNum + 1;
          if (lineNum >= fromIndex && lineNum < toIndex) {
            collected.push(line);
          }
          lineNum += 1;
        }

        if (fromIndex >= totalLines) {
          throw new Error(`Invalid range: from=${from}, total=${totalLines}`,);
        }
      } catch (err) {
        if (err?.code === 'ENOENT') {
          throw new Error(`File not found: ${path}`);
        }
        throw err;
      }

      return {
        success: true,
        path,
        from,
        lines,
        content: collected.join('\n'),
      };
    },
  });

  const memorySet = makeTool('memorySet', {
    help: function*() {
      yield 'Saves content to a memory file (MEMORY.md or memory/*.md).';
      yield '';
      yield 'Use to persist notes, preferences, and decisions across sessions.';
      yield 'For writing regular project files, use writeFile instead.';
      yield '';
      yield '**Parameters:**';
      yield '- `path`: Path to memory file (required)';
      yield '- `content`: Content to write (required)';
      yield '- `append`: Add to end of file instead of overwriting (optional, default: false)';
      yield '';
      yield '**Example:**';
      yield '```';
      yield 'memorySet({ path: "memory/notes.md", content: "# Notes\\n", append: true })';
      yield '```';
    },

    schema: M.call(
      M.splitRecord(
        { path: M.string(), content: M.string() },
        { append: M.boolean() },
      ),
    ).returns({
      success: M.boolean(),
      path: M.string(),
      bytesWritten: M.number(),
    }),

    /**
     * @param {object} opts
     * @param {string} opts.path
     * @param {string} opts.content
     * @param {boolean} [opts.append]
     * @returns {Promise<{success: boolean, path: string, bytesWritten: number}>}
     */
    async execute({ path, content, append = false }) {
      const fullPath = safePath(resolvedRoot, path);
      const dir = dirname(fullPath);

      try {
        await vfs.mkdir(dir, { recursive: true });
        if (append) {
          // VFS has no appendFile — read existing content and concatenate.
          let existing = '';
          try {
            existing = await vfs.readFile(fullPath);
          } catch {
            // File may not exist yet; start from empty.
          }
          await vfs.writeFile(fullPath, existing + content);
        } else {
          await vfs.writeFile(fullPath, content);
        }
      } catch (err) {
        throw new Error(`Failed to write memory file: ${err.message}`,);
      }

      // Keep the search index in sync via the index queue.
      indexQueue.push(fullPath);
      ensureWorker();

      return {
        success: true,
        path,
        bytesWritten: new TextEncoder().encode(content).byteLength,
      };
    },
  });

  const memorySearch = makeTool('memorySearch', {
    help: function*() {
      yield 'Searches memory files (MEMORY.md and memory/*.md) for matching text.';
      yield '';
      yield 'Use to recall past notes, preferences, or decisions.';
      yield 'To search regular project files, use bash with grep instead.';
      yield '';
      yield '**Parameters:**';
      yield '- `query`: Text to search for (required)';
      yield '- `limit`: Maximum number of results (optional, default: 5)';
      yield '';
      yield '**Example:**';
      yield '```';
      yield 'memorySearch({ query: "user preferences", limit: 3 })';
      yield '```';
    },

    schema: M.call(
      M.splitRecord(
        { query: M.string() },
        { limit: M.number(), waitForIndex: M.boolean() },
      ),
    ).returns({
      success: M.boolean(),
      query: M.string(),
      limit: M.number(),
      results: M.arrayOf(M.record()),
    }),

    /**
     * @param {object} opts
     * @param {string} opts.query
     * @param {number} [opts.limit]
     * @param {boolean} [opts.waitForIndex] - When `true` (the default),
     *   waits for any pending index operations to complete before
     *   executing the search.  Set to `false` to search immediately
     *   against whatever state the index is in.
     * @returns {Promise<{success: boolean, query: string, limit: number, results: Array<{file: string, line: number, content: string}>}>}
     */
    async execute({ query, limit = 5, waitForIndex = true }) {
      if (waitForIndex) {
        // Wait for the initial seed pass to finish, then for any
        // in-flight index worker cycle.
        await seeding;
        if (indexing) {
          await indexing;
        }
      }
      const results = await E(searchBackend).search(query, { limit });
      return { success: true, query, limit, results };
    },
  });

  return harden({ memoryGet, memorySet, memorySearch });
};
harden(makeMemoryTools);

/**
 * In-process substring-matching `SearchBackend`.
 *
 * File-path discovery and streaming I/O are fully encapsulated: the
 * backend owns a list of indexed paths and reads files through the
 * supplied {@link VFS} during each search.  Callers interact only
 * through the `SearchBackend` interface.
 *
 * Indexed filenames are stored as relative paths (as provided by the
 * caller), but resolved against `root` when reading file contents
 * during search.
 *
 * @param {VFS} vfs - Virtual filesystem used to read files during
 *   search.
 * @param {string} root - Absolute path used to resolve relative
 *   filenames when reading during search.
 * @returns {SearchBackend}
 */
const makeSubstringBackend = (vfs, root) => {
  /**
   * Search a single file for lines matching `query`
   * (case-insensitive).  Reads the file as a stream to avoid
   * buffering the entire contents.
   *
   * @param {string} relPath - Relative path (as stored in the index).
   * @param {string} absPath - Absolute path to read.
   * @param {string} queryLower - Lower-cased query string.
   * @yields {SearchResult}
   */
  async function* searchInFile(relPath, absPath, queryLower) {
    try {
      const stream = vfs.createReadStream(absPath);
      let lineNum = 0;
      for await (const line of streamLines(stream)) {
        lineNum += 1;
        if (line.toLowerCase().includes(queryLower)) {
          yield {
            file: basename(relPath),
            line: lineNum,
            content: line.trim(),
          };
        }
      }
    } catch {
      // File unreadable or missing; skip silently.
    }
  }

  /** @type {Set<string>} */
  const paths = new Set();

  return harden({
    /**
     * @param {string} query
     * @param {object} [opts]
     * @param {number} [opts.limit]
     * @returns {Promise<Array<SearchResult>>}
     */
    async search(query, opts = {}) {
      const { limit = Infinity } = opts;
      const queryLower = query.toLowerCase();
      /** @type {Array<SearchResult>} */
      const results = [];
      for (const relPath of paths) {
        const absPath = resolve(root, relPath);
        for await (const result of searchInFile(relPath, absPath, queryLower)) {
          results.push(result);
          if (results.length >= limit) {
            return results;
          }
        }
      }
      return results;
    },

    /**
     * Record `filename` in the set of indexed paths.
     *
     * The substring backend reads files on each query, so we only
     * need to track *which* paths to search — no content is stored.
     *
     * @param {string} filename
     * @param {string} _content
     */
    async index(filename, _content) {
      paths.add(filename);
    },

    /**
     * Remove `filename` from the set of indexed paths.
     *
     * @param {string} filename
     */
    async remove(filename) {
      paths.delete(filename);
    },

    /**
     * Yield all currently indexed path strings.
     *
     * @returns {AsyncIterable<string>}
     */
    // eslint-disable-next-line require-yield
    async *indexedPaths() {
      for (const p of paths) {
        yield p;
      }
    },

    /** No-op — no persistent index to sync. */
    async sync() {},
  });
};
harden(makeSubstringBackend);

export { makeMemoryTools, makeSubstringBackend, SearchBackendI };
