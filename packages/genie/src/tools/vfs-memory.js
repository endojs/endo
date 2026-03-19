// @ts-check

/**
 * In-Memory VFS Implementation
 *
 * Provides a {@link VFS} backend backed by an in-memory tree structure.
 * Useful for ephemeral scratch space and testing without touching the
 * real filesystem.
 *
 * All paths are treated as absolute POSIX-style paths.  The caller
 * (typically `makeFileTools`) is responsible for sandboxing and root
 * enforcement before invoking VFS methods.
 *
 * @module
 */

/**
 * @import {
 *   VFS,
 *   VFSDirEntry,
 * } from './vfs.js'
 */

/**
 * @typedef {'file' | 'directory'} MemNodeType
 */

/**
 * @typedef {object} MemFile
 * @property {'file'} type
 * @property {string} content - UTF-8 string content.
 * @property {string} mtime - ISO-8601 modified time.
 */

/**
 * @typedef {object} MemDir
 * @property {'directory'} type
 * @property {Map<string, MemFile | MemDir>} children
 * @property {string} mtime - ISO-8601 modified time.
 */

/**
 * Make an ENOENT-style error.
 *
 * @param {string} path
 * @returns {NodeJS.ErrnoException}
 */
const enoent = (path) => {
  const err = /** @type {NodeJS.ErrnoException} */ (
    new Error(`ENOENT: no such file or directory, '${path}'`)
  );
  err.code = 'ENOENT';
  return err;
};

/**
 * Make an ENOTDIR-style error.
 *
 * @param {string} path
 * @returns {NodeJS.ErrnoException}
 */
const enotdir = (path) => {
  const err = /** @type {NodeJS.ErrnoException} */ (
    new Error(`ENOTDIR: not a directory, '${path}'`)
  );
  err.code = 'ENOTDIR';
  return err;
};

/**
 * Make an EEXIST-style error.
 *
 * @param {string} path
 * @returns {NodeJS.ErrnoException}
 */
const eexist = (path) => {
  const err = /** @type {NodeJS.ErrnoException} */ (
    new Error(`EEXIST: file already exists, '${path}'`)
  );
  err.code = 'EEXIST';
  return err;
};

/**
 * Make an ENOTEMPTY-style error.
 *
 * @param {string} path
 * @returns {NodeJS.ErrnoException}
 */
const enotempty = (path) => {
  const err = /** @type {NodeJS.ErrnoException} */ (
    new Error(`ENOTEMPTY: directory not empty, '${path}'`)
  );
  err.code = 'ENOTEMPTY';
  return err;
};

/**
 * Make an EISDIR-style error.
 *
 * @param {string} path
 * @returns {NodeJS.ErrnoException}
 */
const eisdir = (path) => {
  const err = /** @type {NodeJS.ErrnoException} */ (
    new Error(`EISDIR: illegal operation on a directory, '${path}'`)
  );
  err.code = 'EISDIR';
  return err;
};

/**
 * Split an absolute path into segments.
 *
 * @param {string} p
 * @returns {string[]}
 */
const segments = (p) => {
  // Normalise: strip trailing slash, collapse runs of slashes.
  const normalised = p.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  if (normalised === '/') return [];
  return normalised.split('/').filter(Boolean);
};

/**
 * Create an in-memory VFS.
 *
 * @returns {VFS}
 */
const makeMemoryVFS = () => {
  const now = () => new Date().toISOString();

  /** @type {MemDir} */
  const root = { type: 'directory', children: new Map(), mtime: now() };

  /**
   * Walk the tree to find the node at the given path.
   *
   * @param {string} path
   * @returns {MemFile | MemDir | undefined}
   */
  const lookup = (path) => {
    const parts = segments(path);
    /** @type {MemFile | MemDir} */
    let node = root;
    for (const part of parts) {
      if (node.type !== 'directory') return undefined;
      const child = node.children.get(part);
      if (!child) return undefined;
      node = child;
    }
    return node;
  };

  /**
   * Walk to the *parent* directory of `path` and return it together with
   * the final segment name.
   *
   * @param {string} path
   * @returns {{ parent: MemDir, name: string }}
   */
  const parentOf = (path) => {
    const parts = segments(path);
    if (parts.length === 0) {
      throw new Error('Cannot get parent of root');
    }
    const name = /** @type {string} */ (parts.pop());
    /** @type {MemFile | MemDir} */
    let node = root;
    for (const part of parts) {
      if (node.type !== 'directory') throw enoent(path);
      const child = node.children.get(part);
      if (!child) throw enoent(path);
      node = child;
    }
    if (node.type !== 'directory') throw enotdir(path);
    return { parent: node, name };
  };

  // ---- VFS methods --------------------------------------------------------

  /** @type {VFS['stat']} */
  const stat = async (path) => {
    const node = lookup(path);
    if (!node) throw enoent(path);
    /** @type {number} */
    const size =
      node.type === 'file'
        ? new TextEncoder().encode(node.content).byteLength
        : 0;
    return harden({ size, mtime: node.mtime, type: node.type });
  };

  /** @type {VFS['readFile']} */
  const readFile = async (path) => {
    const node = lookup(path);
    if (!node) throw enoent(path);
    if (node.type === 'directory') throw eisdir(path);
    return node.content;
  };

  /** @type {VFS['createReadStream']} */
  const createReadStream = (path, opts = {}) => {
    // Return an async iterable that yields a single chunk.
    return {
      async *[Symbol.asyncIterator]() {
        const node = lookup(path);
        if (!node) throw enoent(path);
        if (node.type === 'directory') throw eisdir(path);

        const bytes = new TextEncoder().encode(node.content);
        const start = opts.start ?? 0;
        // `end` is inclusive, matching Node.js fs.createReadStream semantics.
        const end = opts.end !== undefined ? opts.end + 1 : bytes.byteLength;
        yield bytes.slice(start, end);
      },
    };
  };

  /** @type {VFS['writeFile']} */
  const writeFile = async (path, content) => {
    const { parent, name } = parentOf(path);
    const existing = parent.children.get(name);
    if (existing && existing.type === 'directory') {
      throw eisdir(path);
    }
    parent.children.set(name, { type: 'file', content, mtime: now() });
  };

  /** @type {VFS['mkdir']} */
  const mkdir = async (path, opts = {}) => {
    const parts = segments(path);
    if (parts.length === 0) {
      // Root always exists.
      return false;
    }

    if (opts.recursive) {
      let current = root;
      let created = false;
      for (const part of parts) {
        const child = current.children.get(part);
        if (child) {
          if (child.type !== 'directory') {
            throw enotdir(path);
          }
          current = child;
        } else {
          /** @type {MemDir} */
          const dir = {
            type: 'directory',
            children: new Map(),
            mtime: now(),
          };
          current.children.set(part, dir);
          current = dir;
          created = true;
        }
      }
      return created;
    }

    // Non-recursive: parent must exist.
    const { parent, name } = parentOf(path);
    const existing = parent.children.get(name);
    if (existing) {
      if (existing.type === 'directory') {
        throw eexist(path);
      }
      throw eexist(path);
    }
    parent.children.set(name, {
      type: 'directory',
      children: new Map(),
      mtime: now(),
    });
    return true;
  };

  /** @type {VFS['unlink']} */
  const unlink = async (path) => {
    const { parent, name } = parentOf(path);
    const node = parent.children.get(name);
    if (!node) throw enoent(path);
    if (node.type === 'directory') throw eisdir(path);
    parent.children.delete(name);
  };

  /** @type {VFS['rmdir']} */
  const rmdir = async (path) => {
    const { parent, name } = parentOf(path);
    const node = parent.children.get(name);
    if (!node) throw enoent(path);
    if (node.type !== 'directory') throw enotdir(path);
    if (node.children.size > 0) throw enotempty(path);
    parent.children.delete(name);
  };

  /** @type {VFS['rm']} */
  const rm = async (path, opts = {}) => {
    const { parent, name } = parentOf(path);
    const node = parent.children.get(name);
    if (!node) throw enoent(path);
    if (node.type === 'directory' && !opts.recursive) {
      throw eisdir(path);
    }
    parent.children.delete(name);
  };

  /** @type {VFS['readdir']} */
  const readdir = (path, opts = {}) => {
    return harden({
      async *[Symbol.asyncIterator]() {
        const node = lookup(path);
        if (!node) throw enoent(path);
        if (node.type !== 'directory') throw enotdir(path);

        /**
         * @param {MemDir} dir
         * @param {string} prefix
         * @returns {AsyncGenerator<VFSDirEntry>}
         */
        async function* collect(dir, prefix) {
          for (const [childName, child] of dir.children) {
            const entryName = prefix
              ? `${prefix}/${childName}`
              : childName;
            const size =
              child.type === 'file'
                ? new TextEncoder().encode(child.content).byteLength
                : 0;
            yield harden({ name: entryName, type: child.type, size });
            if (opts.recursive && child.type === 'directory') {
              yield* collect(child, entryName);
            }
          }
        }

        yield* collect(node, '');
      },
    });
  };

  return harden({
    stat,
    readFile,
    createReadStream,
    writeFile,
    mkdir,
    unlink,
    rmdir,
    rm,
    readdir,
  });
};
harden(makeMemoryVFS);

export { makeMemoryVFS };
