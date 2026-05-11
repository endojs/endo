// @ts-check
/* eslint-disable no-await-in-loop */

/**
 * Node.js VFS Implementation
 *
 * Provides a {@link VFS} backend backed by the Node.js `fs` module.
 * All paths are pre-resolved absolute paths — the caller (typically
 * `makeFileTools`) is responsible for sandboxing and root enforcement
 * before invoking VFS methods.
 *
 * Read streams yield `Uint8Array` chunks via Node's `fs.createReadStream`
 * which natively supports `Symbol.asyncIterator`.
 *
 * @module
 */

import { createReadStream as nodeCreateReadStream } from 'fs';
import fs from 'fs/promises';
import {
  resolve as nodeResolve,
  relative as nodeRelative,
  join as nodeJoin,
  sep as nodeSep,
} from 'path';

import harden from '@endo/harden';

/**
 * @import {
 *   VFS,
 *   VFSStat,
 *   VFSDirEntry,
 * } from './vfs.js'
 */

/**
 * Derive a {@link VFSStat.type} string from a Node `Stats` object.
 *
 * @param {import('fs').Stats | import('fs').Dirent} entry
 * @returns {'file' | 'directory' | 'symlink' | 'other'}
 */
const entryType = entry => {
  if (entry.isFile()) return 'file';
  if (entry.isDirectory()) return 'directory';
  if (entry.isSymbolicLink()) return 'symlink';
  return 'other';
};
harden(entryType);

/**
 * Create a Node.js-backed VFS.
 *
 * @param {string} [rootDir] - Optional limiting root directory.
 *   When provided, {@link VFS.resolve} enforces that the result
 *   stays under this root and throws on traversal escape.
 * @returns {VFS}
 */
const makeNodeVFS = rootDir => {
  /** @type {string | undefined} */
  const resolvedRoot = rootDir ? nodeResolve(rootDir) : undefined;

  const sep = nodeSep;

  /** @type {VFS['join']} */
  const join = (...parts) => nodeJoin(...parts);

  /** @type {VFS['relative']} */
  const relative = (from, to) => nodeRelative(from, to);

  /**
   * Resolve a sequence of paths into an absolute path.
   *
   * When a limiting root was supplied at creation, the resolution
   * base is that root and the result is checked to remain under it.
   * Without a root the method delegates directly to Node's
   * `path.resolve`.
   *
   * @type {VFS['resolve']}
   */
  const resolve = (...paths) => {
    if (resolvedRoot !== undefined) {
      const resolved = nodeResolve(resolvedRoot, ...paths);
      const rel = nodeRelative(resolvedRoot, resolved);
      if (rel.startsWith('..') || nodeResolve(rel) === rel) {
        throw new Error(
          `Invalid path: must resolve under root (${resolvedRoot})`,
        );
      }
      return resolved;
    }
    return nodeResolve(...paths);
  };

  /** @type {VFS['stat']} */
  const stat = async path => {
    const stats = await fs.stat(path);
    return harden({
      size: stats.size,
      mtime: stats.mtime.toISOString(),
      type: entryType(stats),
    });
  };

  /** @type {VFS['readFile']} */
  const readFile = async path => {
    return fs.readFile(path, 'utf-8');
  };

  /** @type {VFS['createReadStream']} */
  const createReadStream = (path, opts = {}) => {
    const streamOpts = {};
    if (opts.start !== undefined) {
      streamOpts.start = opts.start;
    }
    if (opts.end !== undefined) {
      streamOpts.end = opts.end;
    }
    // Node's ReadStream is an AsyncIterable<Buffer>.
    // Buffer extends Uint8Array, so it satisfies AsyncIterable<Uint8Array>.
    return nodeCreateReadStream(path, streamOpts);
  };

  /** @type {VFS['writeFile']} */
  const writeFile = async (path, content) => {
    await fs.writeFile(path, content, 'utf-8');
  };

  /** @type {VFS['mkdir']} */
  const mkdir = async (path, opts = {}) => {
    const result = await fs.mkdir(path, { recursive: !!opts.recursive });
    // fs.mkdir returns the first directory path created, or undefined
    // when the directory already existed (recursive mode).
    return result !== undefined;
  };

  /** @type {VFS['unlink']} */
  const unlink = async path => {
    await fs.unlink(path);
  };

  /** @type {VFS['rmdir']} */
  const rmdir = async path => {
    await fs.rmdir(path);
  };

  /** @type {VFS['rm']} */
  const rm = async (path, opts = {}) => {
    await fs.rm(path, { recursive: !!opts.recursive, force: false });
  };

  /** @type {VFS['readdir']} */
  const readdir = (path, opts = {}) => {
    return harden({
      async *[Symbol.asyncIterator]() {
        const dirents = await fs.readdir(path, {
          withFileTypes: true,
          recursive: !!opts.recursive,
        });

        for (const dirent of dirents) {
          const entryName =
            dirent.parentPath && dirent.parentPath !== path
              ? nodeRelative(path, nodeResolve(dirent.parentPath, dirent.name))
              : dirent.name;

          let size = 0;
          if (dirent.isFile()) {
            try {
              const st = await fs.stat(
                nodeResolve(dirent.parentPath || path, dirent.name),
              );
              size = st.size;
            } catch (_e) {
              // If stat fails, leave size as 0.
            }
          }

          yield harden({
            name: entryName,
            type: entryType(dirent),
            size,
          });
        }
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
    sep,
    join,
    relative,
    resolve,
  });
};
harden(makeNodeVFS);

export { makeNodeVFS };
