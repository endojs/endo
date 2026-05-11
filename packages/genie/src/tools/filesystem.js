// @ts-check
/* global process */
/* eslint-disable no-continue, camelcase */

/**
 * Filesystem Tools Module
 *
 * Provides read, write, edit, remove, and stat file tools with path-root
 * enforcement.
 * All accessed paths must resolve under the configured root directory.
 *
 * File I/O is delegated to a {@link VFS} backend so that the tool
 * logic is decoupled from Node-specific APIs.  By default,
 * {@link makeNodeVFS} is used, but callers may supply any conforming
 * implementation.
 */

import { resolve, dirname, relative, basename } from 'path';
import harden from '@endo/harden';
import { M } from '@endo/patterns';

import { makeTool } from './common.js';
import { makeNodeVFS } from './vfs-node.js';

/** @import { VFS } from './vfs.js' */

/** @type {number} */
const DEFAULT_MAX_READ_BYTES = 100 * 1024 * 1024; // 100 MiB

/**
 * @typedef {object} FileToolsOptions
 * @property {string} [root] - Root directory that all paths must resolve
 *   under. Defaults to `process.cwd()`.
 * @property {number} [maxReadBytes] - Maximum number of bytes a single
 *   readFile call may return.  Defaults to 100 MiB.
 * @property {VFS} [vfs] - Virtual filesystem backend.  Defaults to
 *   a Node.js `fs`-backed implementation.
 */

/**
 * Resolve `userPath` against `root` and assert the result stays under `root`.
 *
 * @param {string} userPath - The path supplied by the caller.
 * @param {string} root     - The root directory all paths must stay within.
 * @returns {string} The resolved absolute path.
 */
const safePath = (userPath, root) => {
  if (userPath.includes('\0')) {
    throw new Error('Invalid path: null bytes not allowed');
  }
  const resolved = resolve(root, userPath);
  const rel = relative(root, resolved);
  // If the relative path starts with ".." or is absolute, it escapes the root.
  if (rel.startsWith('..') || resolve(rel) === rel) {
    throw new Error(`Invalid path: must resolve under root (${root})`);
  }
  return resolved;
};

/**
 * Compute the byte length of a UTF-8 string without relying on
 * Node's `Buffer`.
 *
 * @param {string} str
 * @returns {number}
 */
const utf8ByteLength = str => new TextEncoder().encode(str).byteLength;

/**
 * Create file-system tools (readFile, writeFile, editFile) that enforce a
 * common path-root traversal limit.
 *
 * @param {FileToolsOptions} [options]
 */
const makeFileTools = (options = {}) => {
  const {
    root = process.cwd(),
    maxReadBytes = DEFAULT_MAX_READ_BYTES,
    vfs = makeNodeVFS(),
  } = options;
  const resolvedRoot = resolve(root);

  const readFile = makeTool('readFile', {
    *help() {
      yield 'Reads the text content of a single FILE. Cannot read directories.';
      yield '';
      yield 'IMPORTANT: This tool only works on files, NOT directories.';
      yield 'To see what is inside a directory, use listDirectory instead.';
      yield '';
      yield '**Parameters:**';
      yield '- `path`: Path to a file (required). Must be a file, not a directory.';
      yield '- `offset`: Starting byte offset (optional)';
      yield '- `limit`: Maximum bytes to read (optional)';
      yield '';
      yield '**Example:**';
      yield '```';
      yield 'readFile({ path: "README.md" })';
      yield '```';
    },

    schema: M.call(
      M.splitRecord(
        { path: M.string() },
        { offset: M.number(), limit: M.number() },
      ),
    ).returns(
      M.splitRecord(
        {
          success: M.boolean(),
          path: M.string(),
          content: M.string(),
          bytesRead: M.number(),
        },
        { offset: M.number(), limit: M.number() },
      ),
    ),

    /**
     * @param {object} opts
     * @param {string} opts.path
     * @param {number} [opts.offset]
     * @param {number} [opts.limit]
     * @returns {Promise<{success: boolean, path: string, content: string, bytesRead: number, offset?: number, limit?: number}>}
     */
    async execute({ path, offset = 0, limit = maxReadBytes }) {
      await Promise.resolve();

      if (limit > maxReadBytes) {
        throw new Error(
          `Limit exceeds platform max read limit of ${maxReadBytes} bytes`,
        );
      }

      const fullPath = safePath(path, resolvedRoot);

      try {
        // Check file size up-front so we can enforce the platform limit
        // and validate the offset without reading the whole file.
        const { size: fileSize } = await vfs.stat(fullPath);
        if (offset >= fileSize && fileSize > 0) {
          throw new Error('Offset exceeds file size');
        }

        // Determine how many bytes we will actually read.
        const bytesToRead = Math.min(limit, fileSize - offset);

        // Stream only the requested byte range via the VFS.
        const stream = vfs.createReadStream(fullPath, {
          start: offset,
          end: offset + bytesToRead - 1, // `end` is inclusive
        });

        /** @type {Uint8Array[]} */
        const chunks = [];
        let totalBytes = 0;
        for await (const chunk of stream) {
          chunks.push(chunk);
          totalBytes += chunk.byteLength;
        }

        // Decode the collected bytes to a UTF-8 string.
        const decoder = new TextDecoder();
        const content =
          chunks.length === 1
            ? decoder.decode(chunks[0])
            : decoder.decode(
                (() => {
                  const merged = new Uint8Array(totalBytes);
                  let pos = 0;
                  for (const c of chunks) {
                    merged.set(c, pos);
                    pos += c.byteLength;
                  }
                  return merged;
                })(),
              );

        return {
          success: true,
          path,
          offset,
          limit,
          content,
          bytesRead: totalBytes,
        };
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
          throw new Error(`File not found: ${path}`);
        }
        throw err;
      }
    },
  });

  const writeFile = makeTool('writeFile', {
    *help() {
      yield 'Creates or completely overwrites a file with new content.';
      yield '';
      yield 'Use writeFile to create new files or fully replace file content.';
      yield 'To change only part of an existing file, use editFile instead.';
      yield '';
      yield '**Parameters:**';
      yield '- `path`: Path to file (required)';
      yield '- `content`: Full content to write (required)';
      yield '';
      yield '**Example:**';
      yield '```';
      yield 'writeFile({ path: "test.txt", content: "Hello World" })';
      yield '```';
    },

    schema: M.call({ path: M.string(), content: M.string() }).returns({
      success: M.boolean(),
      path: M.string(),
      bytesWritten: M.number(),
    }),

    /**
     * @param {object} opts
     * @param {string} opts.path
     * @param {string} opts.content
     * @returns {Promise<{success: boolean, path: string, bytesWritten: number}>}
     */
    async execute({ path, content }) {
      await Promise.resolve();

      const fullPath = safePath(path, resolvedRoot);

      try {
        const dir = dirname(fullPath);
        await vfs.mkdir(dir, { recursive: true });
        await vfs.writeFile(fullPath, content);

        return {
          success: true,
          path,
          bytesWritten: utf8ByteLength(content),
        };
      } catch (err) {
        throw new Error(
          `Failed to write file: ${/** @type {Error} */ (err).message}`,
        );
      }
    },
  });

  // -- editFile --------------------------------------------------------------

  const editFile = makeTool('editFile', {
    *help() {
      yield 'Replaces a specific string in an existing file with a new string.';
      yield '';
      yield 'Use editFile when you need to change part of a file.';
      yield 'Read the file first with readFile to find the exact text to replace.';
      yield 'To create a new file or fully rewrite one, use writeFile instead.';
      yield '';
      yield '**Parameters:**';
      yield '- `path`: Path to file (required)';
      yield '- `old_string`: Exact string to find and replace (required)';
      yield '- `new_string`: Replacement string (required)';
      yield '- `replace_all`: Replace all occurrences (optional, default: false)';
      yield '';
      yield '**Example:**';
      yield '```';
      yield 'editFile({ path: "README.md", old_string: "old text", new_string: "new text" })';
      yield '```';
    },

    schema: M.call(
      M.splitRecord(
        { path: M.string(), old_string: M.string(), new_string: M.string() },
        { replace_all: M.boolean() },
      ),
    ).returns({
      success: M.boolean(),
      path: M.string(),
      replaced: M.boolean(),
      count: M.number(),
    }),

    /**
     * @param {object} opts
     * @param {string} opts.path
     * @param {string} opts.old_string
     * @param {string} opts.new_string
     * @param {boolean} [opts.replace_all]
     * @returns {Promise<{success: boolean, path: string, replaced: boolean, count: number}>}
     */
    async execute({ path, old_string, new_string, replace_all = false }) {
      await Promise.resolve();

      const fullPath = safePath(path, resolvedRoot);

      try {
        const before = await vfs.readFile(fullPath);

        let updated;
        if (replace_all) {
          updated = before.replaceAll(old_string, new_string);
        } else {
          const index = before.indexOf(old_string);
          if (index === -1) {
            throw new Error(`old_string not found in file`);
          }
          updated =
            before.substring(0, index) +
            new_string +
            before.substring(index + old_string.length);
        }

        await vfs.writeFile(fullPath, updated);

        const replaced = updated !== before;
        const count = updated.split(new_string).length - 1;

        return {
          success: true,
          path,
          replaced,
          count,
        };
      } catch (err) {
        throw new Error(
          `Failed to edit file: ${/** @type {Error} */ (err).message}`,
        );
      }
    },
  });

  // -- removeFile ------------------------------------------------------------

  const removeFile = makeTool('removeFile', {
    *help() {
      yield 'Deletes a single file. Cannot remove directories.';
      yield '';
      yield 'To remove a directory, use removeDirectory instead.';
      yield '';
      yield '**Parameters:**';
      yield '- `path`: Path to the file to delete (required)';
      yield '';
      yield '**Example:**';
      yield '```';
      yield 'removeFile({ path: "tmp/scratch.txt" })';
      yield '```';
    },

    schema: M.call({ path: M.string() }).returns({
      success: M.boolean(),
      path: M.string(),
    }),

    /**
     * @param {object} opts
     * @param {string} opts.path
     * @returns {Promise<{success: boolean, path: string}>}
     */
    async execute({ path }) {
      await Promise.resolve();

      const fullPath = safePath(path, resolvedRoot);

      try {
        await vfs.unlink(fullPath);
        return { success: true, path };
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
          throw new Error(`File not found: ${path}`);
        }
        throw new Error(
          `Failed to remove file: ${/** @type {Error} */ (err).message}`,
        );
      }
    },
  });

  // -- stat -----------------------------------------------------------------

  const stat = makeTool('stat', {
    *help() {
      yield 'Checks if a path exists and returns its type (file or directory) and size.';
      yield '';
      yield 'Use stat to find out whether a path is a file or a directory before';
      yield 'deciding whether to use readFile or listDirectory.';
      yield '';
      yield '**Parameters:**';
      yield '- `path`: Path to file or directory (required)';
      yield '';
      yield '**Returns:** `{ success, path, type, size, modified }`';
      yield '  - `type` is one of: "file", "directory", "symlink", "other"';
      yield '';
      yield '**Example:**';
      yield '```';
      yield 'stat({ path: "src" })  // returns type: "directory"';
      yield '```';
    },

    schema: M.call({ path: M.string() }).returns({
      success: M.boolean(),
      path: M.string(),
      type: M.string(),
      size: M.number(),
      modified: M.string(),
    }),

    /**
     * @param {object} opts
     * @param {string} opts.path
     * @returns {Promise<{success: boolean, path: string, type: string, size: number, modified: string}>}
     */
    async execute({ path }) {
      await Promise.resolve();

      const fullPath = safePath(path, resolvedRoot);

      try {
        const info = await vfs.stat(fullPath);

        return {
          success: true,
          path,
          type: info.type,
          size: info.size,
          modified: info.mtime,
        };
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
          throw new Error(`Path not found: ${path}`);
        }
        throw new Error(
          `Failed to stat path: ${/** @type {Error} */ (err).message}`,
        );
      }
    },
  });

  // -- listDirectory --------------------------------------------------------

  const listDirectory = makeTool('listDirectory', {
    *help() {
      yield 'Lists the files and subdirectories inside a directory.';
      yield '';
      yield 'Use this tool to explore what is inside a folder.';
      yield 'This is the correct tool when you want to see directory contents.';
      yield 'Do NOT use readFile on a directory — use listDirectory instead.';
      yield '';
      yield '**Parameters:**';
      yield '- `path`: Directory path to list (required)';
      yield '- `recursive`: Include nested contents (optional, default: false)';
      yield '- `glob`: Filter by pattern, e.g. "*.js" (optional)';
      yield '';
      yield '**Returns:** `{ success, path, entries: [{ name, type, size }] }`';
      yield '';
      yield '**Examples:**';
      yield '```';
      yield 'listDirectory({ path: "." })              // list current directory';
      yield 'listDirectory({ path: "src" })             // list src/ folder';
      yield 'listDirectory({ path: "src", glob: "*.js" })  // only .js files';
      yield '```';
    },

    schema: M.call(
      M.splitRecord(
        { path: M.string() },
        { recursive: M.boolean(), glob: M.string() },
      ),
    ).returns({
      success: M.boolean(),
      path: M.string(),
      entries: M.arrayOf(
        M.splitRecord({ name: M.string(), type: M.string(), size: M.number() }),
      ),
    }),

    /**
     * @param {object} opts
     * @param {string} opts.path
     * @param {boolean} [opts.recursive]
     * @param {string} [opts.glob]
     * @returns {Promise<{success: boolean, path: string, entries: Array<{name: string, type: string, size: number}>}>}
     */
    async execute({ path, recursive = false, glob: globPattern }) {
      await Promise.resolve();

      const fullPath = safePath(path, resolvedRoot);

      try {
        /** @type {RegExp | undefined} */
        let re;
        if (globPattern) {
          // Convert simple glob to regex: * -> [^/]*, ? -> [^/], ** -> .*
          const escaped = globPattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '\0')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '[^/]')
            .replace(/\0/g, '.*');
          re = new RegExp(`^${escaped}$`);
        }

        /** @type {Array<{name: string, type: string, size: number}>} */
        const entries = [];

        for await (const entry of vfs.readdir(fullPath, { recursive })) {
          if (re && !re.test(basename(entry.name)) && !re.test(entry.name)) {
            continue;
          }

          entries.push({
            name: entry.name,
            type: entry.type,
            size: entry.size,
          });
        }

        return { success: true, path, entries };
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
          throw new Error(`Directory not found: ${path}`);
        }
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOTDIR') {
          throw new Error(`Not a directory: ${path}`);
        }
        throw new Error(
          `Failed to list directory: ${/** @type {Error} */ (err).message}`,
        );
      }
    },
  });

  // -- makeDirectory --------------------------------------------------------

  const makeDirectory = makeTool('makeDirectory', {
    *help() {
      yield 'Creates a new directory (folder).';
      yield '';
      yield '**Parameters:**';
      yield '- `path`: Directory path to create (required)';
      yield '- `recursive`: Also create parent directories if missing (optional, default: false)';
      yield '';
      yield '**Example:**';
      yield '```';
      yield 'makeDirectory({ path: "src/utils", recursive: true })';
      yield '```';
    },

    schema: M.call(
      M.splitRecord({ path: M.string() }, { recursive: M.boolean() }),
    ).returns({
      success: M.boolean(),
      path: M.string(),
      created: M.boolean(),
    }),

    /**
     * @param {object} opts
     * @param {string} opts.path
     * @param {boolean} [opts.recursive]
     * @returns {Promise<{success: boolean, path: string, created: boolean}>}
     */
    async execute({ path, recursive: rec = false }) {
      await Promise.resolve();

      const fullPath = safePath(path, resolvedRoot);

      try {
        const created = await vfs.mkdir(fullPath, { recursive: rec });
        return { success: true, path, created };
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'EEXIST') {
          return { success: true, path, created: false };
        }
        throw new Error(
          `Failed to create directory: ${/** @type {Error} */ (err).message}`,
        );
      }
    },
  });

  // -- removeDirectory ------------------------------------------------------

  const removeDirectory = makeTool('removeDirectory', {
    *help() {
      yield 'Deletes a directory (folder). To delete a single file, use removeFile.';
      yield '';
      yield '**Parameters:**';
      yield '- `path`: Directory path to delete (required)';
      yield '- `recursive`: Delete all contents inside first (optional, default: false)';
      yield '';
      yield '**Example:**';
      yield '```';
      yield 'removeDirectory({ path: "tmp/build", recursive: true })';
      yield '```';
    },

    schema: M.call(
      M.splitRecord({ path: M.string() }, { recursive: M.boolean() }),
    ).returns({
      success: M.boolean(),
      path: M.string(),
    }),

    /**
     * @param {object} opts
     * @param {string} opts.path
     * @param {boolean} [opts.recursive]
     * @returns {Promise<{success: boolean, path: string}>}
     */
    async execute({ path, recursive: rec = false }) {
      await Promise.resolve();

      const fullPath = safePath(path, resolvedRoot);

      // Refuse to remove the root itself.
      if (fullPath === resolvedRoot) {
        throw new Error('Refusing to remove the root directory');
      }

      try {
        if (rec) {
          await vfs.rm(fullPath, { recursive: true });
        } else {
          await vfs.rmdir(fullPath);
        }
        return { success: true, path };
      } catch (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
          throw new Error(`Directory not found: ${path}`);
        }
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOTEMPTY') {
          throw new Error(
            `Directory not empty: ${path} (use recursive: true to remove)`,
          );
        }
        throw new Error(
          `Failed to remove directory: ${/** @type {Error} */ (err).message}`,
        );
      }
    },
  });

  return harden({
    readFile,
    writeFile,
    editFile,
    removeFile,
    stat,
    listDirectory,
    makeDirectory,
    removeDirectory,
  });
};
harden(makeFileTools);

export { makeFileTools };
export default makeFileTools;
