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

import { basename, dirname, join, relative, resolve } from 'path';

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
 * Create memory tools (memoryGet, memorySet, memorySearch) that enforce a
 * common path-root traversal limit.
 *
 * @param {object} [options]
 * @param {string} [options.root] - Root directory that all paths must resolve
 *   under. Defaults to `process.cwd()`.
 * @param {SearchBackend} [options.searchBackend] - Pluggable search backend.
 *   When provided, `memorySearch` delegates to `E(searchBackend).search()`
 *   and `memorySet` calls `E(searchBackend).index()` to keep the index
 *   in sync.  When omitted, the built-in substring search is used.
 * @param {VFS} [options.vfs] - Virtual filesystem backend.  Defaults to
 *   a Node.js `fs`-backed implementation.
 */
const makeMemoryTools = (options = {}) => {
  const { root = process.cwd(), vfs = makeNodeVFS() } = options;
  const resolvedRoot = resolve(root);

  /**
   * Search a single file for lines matching `query` (case-insensitive).
   * Reads the file as a stream to avoid buffering the entire contents.
   *
   * @param {string} filePath - Absolute path to search.
   * @param {string} query    - Case-insensitive substring to match.
   * @returns {AsyncGenerator<SearchResult>}
   */
  async function* searchInFile(filePath, query) {
    const queryLower = query.toLowerCase();
    try {
      const stream = vfs.createReadStream(filePath);
      let lineNum = 0;
      for await (const line of streamLines(stream)) {
        lineNum += 1;
        if (line.toLowerCase().includes(queryLower)) {
          yield {
            file: basename(filePath),
            line: lineNum,
            content: line.trim(),
          };
        }
      }
    } catch {}
  }

  /**
   * @param {string[]} searchPaths - Absolute paths to search.
   * @param {string} query         - Case-insensitive substring to match.
   */
  async function* searchInFiles(searchPaths, query) {
    for await (const searchPath of findMemoryPaths(...searchPaths)) {
      yield* searchInFile(searchPath, query);
    }
  }

  /**
   * @param {Array<string>} searchPaths
   */
  async function* findMemoryPaths(...searchPaths) {
    for (const searchPath of searchPaths) {
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
      } catch {}
    }
  }

  // Default to the built-in substring backend when none is provided.
  const {
    searchBackend = makeSubstringBackend(
      [join(resolvedRoot, 'MEMORY.md'), join(resolvedRoot, 'memory')],
      searchInFiles,
    ),
  } = options;

  /**
   * Resolve `userPath` against `resolvedRoot` and assert the result stays under `resolvedRoot`.
   *
   * @param {string} userPath - The path supplied by the caller.
   * @returns {string} The resolved absolute path.
   */
  const safePath = userPath => {
    if (userPath.includes('\0')) {
      throw new Error('Invalid path: null bytes not allowed');
    }
    const resolved = resolve(resolvedRoot, userPath);
    const rel = relative(resolvedRoot, resolved);
    // If the relative path starts with ".." or is absolute, it escapes the root.
    if (rel.startsWith('..') || resolve(rel) === rel) {
      throw new Error(
        `Invalid path: must resolve under root (${resolvedRoot})`,
      );
    }
    return resolved;
  };

  const memoryGet = makeTool('memoryGet', {
    help: function* () {
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
      const fullPath = safePath(path);
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
          throw new Error(`Invalid range: from=${from}, total=${totalLines}`);
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
    help: function* () {
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
      const fullPath = safePath(path);
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
        throw new Error(`Failed to write memory file: ${err.message}`);
      }

      // Keep the search index in sync.
      const fullContent = append ? await vfs.readFile(fullPath) : content;
      await E(searchBackend).index(path, fullContent);

      return {
        success: true,
        path,
        bytesWritten: new TextEncoder().encode(content).byteLength,
      };
    },
  });

  const memorySearch = makeTool('memorySearch', {
    help: function* () {
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
      M.splitRecord({ query: M.string() }, { limit: M.number() }),
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
     * @returns {Promise<{success: boolean, query: string, limit: number, results: Array<{file: string, line: number, content: string}>}>}
     */
    async execute({ query, limit = 5 }) {
      const results = await E(searchBackend).search(query, { limit });
      return { success: true, query, limit, results };
    },
  });

  return harden({ memoryGet, memorySet, memorySearch });
};
harden(makeMemoryTools);

/**
 * Wrap the built-in `searchInFiles` logic as a `SearchBackend`.
 *
 * This is a zero-dependency, in-process backend that preserves the
 * original substring-matching behaviour.  Pass it as `searchBackend`
 * to `makeMemoryTools` when you want the default search but still
 * want to go through the `SearchBackend` interface (e.g. for testing
 * or uniform dispatch).
 *
 * @param {string[]} paths - Absolute paths (files or directories) to
 *   search within.
 * @param {(paths: string[], query: string) =>
 *   AsyncGenerator<SearchResult>} searcher - The search implementation
 *   to delegate to (typically `searchInFiles` from the enclosing
 *   `makeMemoryTools` closure).
 * @returns {SearchBackend}
 */
const makeSubstringBackend = (paths, searcher) => {
  return harden({
    /**
     * @param {string} query
     * @param {object} [opts]
     * @param {number} [opts.limit]
     * @returns {Promise<Array<SearchResult>>}
     */
    async search(query, opts = {}) {
      const { limit = Infinity } = opts;
      /** @type {Array<SearchResult>} */
      const results = [];
      for await (const result of searcher(paths, query)) {
        results.push(result);
        if (results.length >= limit) {
          break;
        }
      }
      return results;
    },

    /**
     * No-op — the substring backend searches files directly on each
     * query, so there is no separate index to maintain.
     *
     * @param {string} _filename
     * @param {string} _content
     */
    async index(_filename, _content) {},

    /**
     * No-op — nothing to remove from a live-file scanner.
     *
     * @param {string} _filename
     */
    async remove(_filename) {},

    /** No-op — no persistent index to sync. */
    async sync() {},
  });
};
harden(makeSubstringBackend);

export { makeMemoryTools, makeSubstringBackend, SearchBackendI };
