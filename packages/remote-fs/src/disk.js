// @ts-check
/* eslint-disable no-await-in-loop, no-bitwise */
/* global Buffer */
/**
 * Disk-backed `Filesystem` (DESIGN.md §8.3).
 *
 * Wraps a host directory through `node:fs/promises`. Mirrors the
 * exo shape of the in-memory implementation; the differences are
 * where state lives:
 *   - node identity (`qid.pathId`) comes from `stat.ino`
 *   - `qid.version` derives from `ctimeNs + size` (bumps on
 *     metadata or content changes)
 *   - File content is read on demand; `OpenFile.read` streams
 *     chunks via `fs.read(fd, ...)` calls
 *   - `OpenFile.write` opens a `FileHandle` and streams chunks
 *     via `fh.write(...)` at the requested offsets
 *
 * v1 limitations (documented as future work):
 *   - `Node.watch()` returns a watcher that yields no events.
 *     `chokidar` / kernel inotify integration is F7's disk side.
 *   - `Node.xattrs()` throws `ENOSYS` on every operation. The
 *     Node `fs` module doesn't expose xattr syscalls.
 *   - `OpenFile.lock` / `getLock` are advisory and tracked
 *     in-process — they don't propagate to other processes on the
 *     same file. Real cross-process advisory locks would need
 *     `flock(2)` bindings.
 *
 * Containment: every name passed to `lookup`, `create`, `mkdir`,
 * `unlink`, `rename` is validated against `/` and `..` so a holder
 * of a `Directory` cap can't escape the subtree it was given.
 */

import { promises as fsp, constants as fsConstants } from 'node:fs';
import * as nodePath from 'node:path';
import { createHash } from 'node:crypto';

import { makeExo } from '@endo/exo';
import { makeError, X, q } from '@endo/errors';

import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { bytesWriterFromIterator } from '@endo/exo-stream/bytes-writer-from-iterator.js';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';

import {
  FilesystemInterface,
  DirectoryInterface,
  FileInterface,
  CursorInterface,
  OpenFileInterface,
  LockInterface,
  XattrsInterface,
  NodeWatcherInterface,
  BlobRefInterface,
} from './guards.js';

/**
 * Reject names that would escape a directory.
 *
 * @param {string} name
 */
const assertChildName = name => {
  if (typeof name !== 'string' || name.length === 0) {
    throw makeError(X`EINVAL: invalid name ${q(name)}`);
  }
  if (name === '.' || name === '..') {
    throw makeError(X`EINVAL: name ${q(name)} reserved`);
  }
  if (name.includes('/') || name.includes('\0')) {
    throw makeError(X`EINVAL: name ${q(name)} contains path separator`);
  }
};

/**
 * Translate a Node fs errno to one of our errno strings.
 *
 * @param {unknown} e
 * @param {string} fallback
 */
const mapErrno = (e, fallback) => {
  // @ts-expect-error duck-typing
  const code = e && e.code;
  if (typeof code !== 'string') return fallback;
  return code; // ENOENT, EACCES, EEXIST, ENOTEMPTY, etc.
};

/**
 * Test whether two ranges intersect; `length === 0n` means
 * "to end of file" (POSIX convention).
 *
 * @param {{ start: bigint, length: bigint }} a
 * @param {{ start: bigint, length: bigint }} b
 */
const rangesOverlap = (a, b) => {
  const aUnbounded = a.length === 0n;
  const bUnbounded = b.length === 0n;
  if (aUnbounded && bUnbounded) return true;
  if (aUnbounded) {
    const bEnd = b.start + b.length;
    return bEnd > a.start;
  }
  if (bUnbounded) {
    const aEnd = a.start + a.length;
    return aEnd > b.start;
  }
  const aEnd = a.start + a.length;
  const bEnd = b.start + b.length;
  return a.start < bEnd && b.start < aEnd;
};

const NotSupported = method =>
  makeError(X`ENOSYS: ${q(method)} not implemented on disk-backed FS`);

/**
 * Build a disk-backed `Filesystem` capability rooted at `rootPath`.
 *
 * @param {{ rootPath: string }} opts
 * @returns {object}
 */
export const makeDiskFilesystem = ({ rootPath }) => {
  if (typeof rootPath !== 'string' || !nodePath.isAbsolute(rootPath)) {
    throw makeError(X`rootPath must be an absolute path, got ${q(rootPath)}`);
  }
  const canonicalRoot = nodePath.normalize(rootPath);

  // Per-absolute-path lock table. Locks are advisory, in-process
  // only. Keyed by abs path string; an entry is dropped when its
  // last lock is released.
  /** @type {Map<string, Set<{ state: { type: 'shared' | 'exclusive', start: bigint, length: bigint } }>>} */
  const locksByPath = new Map();

  // Map every Directory exo we mint to its absolute path. Used by
  // `rename` to identify the destination Directory's path without
  // adding a method to the public guard — keeps the interface
  // clean while still rejecting cross-Filesystem caps with EXDEV.
  /** @type {WeakMap<object, string>} */
  const dirPaths = new WeakMap();

  const getLockSet = absPath => {
    let s = locksByPath.get(absPath);
    if (!s) {
      s = new Set();
      locksByPath.set(absPath, s);
    }
    return s;
  };

  // Forward-declare so the exo builders can reference each other.
  // Each builder takes the path and a fresh `Stats` object: the
  // qid is cached at construction time from that stat, which means
  // every minted cap carries a snapshot qid for sync `getQid()`.
  // Callers wanting a fresh qid can re-resolve via `lookup`.
  /** @type {(absPath: string, stat: import('node:fs').Stats) => object} */
  // eslint-disable-next-line no-use-before-define
  const makeFileExo = (absPath, stat) => makeFileExoImpl(absPath, stat);
  /** @type {(absPath: string, stat: import('node:fs').Stats) => object} */
  // eslint-disable-next-line no-use-before-define
  const makeDirectoryExo = (absPath, stat) =>
    // eslint-disable-next-line no-use-before-define
    makeDirectoryExoImpl(absPath, stat);

  // ---------- Qid ----------

  /**
   * @param {import('node:fs').Stats} stat
   * @param {boolean} isDirectory
   */
  const qidFromStat = (stat, isDirectory) => {
    // ctimeMs bumps on metadata changes; mtimeMs bumps on content.
    // Combine into a single monotonic-ish version. Disk inode reuse
    // after delete+recreate is a known limitation (documented).
    const versionMs =
      BigInt(Math.floor(stat.ctimeMs)) * 1_000_000n +
      BigInt(stat.size);
    return harden({
      type: isDirectory ? 'directory' : 'file',
      pathId: BigInt(stat.ino),
      version: versionMs,
    });
  };

  /**
   * @param {import('node:fs').Stats} stat
   */
  const attrsFromStat = stat =>
    harden({
      size: BigInt(stat.size),
      mtime: BigInt(Math.floor(stat.mtimeMs)) * 1_000_000n,
      atime: BigInt(Math.floor(stat.atimeMs)) * 1_000_000n,
      ctime: BigInt(Math.floor(stat.ctimeMs)) * 1_000_000n,
      btime:
        stat.birthtimeMs > 0
          ? BigInt(Math.floor(stat.birthtimeMs)) * 1_000_000n
          : null,
    });

  // ---------- Watcher stub ----------

  const makeWatcherStub = () =>
    makeExo('NodeWatcher', NodeWatcherInterface, {
      async events() {
        const empty = async function* () {
          // F7-on-disk future work.
        };
        return readerFromIterator(empty());
      },
      async cancel() {
        // no-op
      },
    });

  // ---------- Xattrs stub ----------

  const makeXattrsStub = () =>
    makeExo('Xattrs', XattrsInterface, {
      async get(_name) {
        throw NotSupported('xattrs.get');
      },
      async set(_name, _opts) {
        throw NotSupported('xattrs.set');
      },
      async list() {
        // Empty list is more honest than throwing — there are no
        // xattrs visible through this surface.
        const empty = async function* () {
          // yields nothing
        };
        return readerFromIterator(empty());
      },
      async remove(_name) {
        throw NotSupported('xattrs.remove');
      },
      help(method) {
        if (method === undefined) {
          return 'Xattrs (disk-backed v1): xattrs are not exposed.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });

  // ---------- BlobRef ----------

  /**
   * @param {Uint8Array} captured
   */
  const makeBlobRefExo = captured => {
    const hashBytes = createHash('sha256').update(captured).digest();
    const info = harden({
      algorithm: 'sha256',
      hash: hashBytes.toString('base64'),
      size: BigInt(captured.length),
    });

    return makeExo('BlobRef', BlobRefInterface, {
      getInfo() {
        return info;
      },
      async fetch(offset, length) {
        const off = Number(offset);
        const len = Number(length);
        const end = Math.min(off + len, captured.length);
        const slice =
          off >= captured.length
            ? new Uint8Array(0)
            : captured.slice(off, end);
        return makeBytesReaderFromBytes(slice);
      },
      help(method) {
        if (method === undefined) {
          return 'BlobRef: content-addressed handle (DESIGN.md §6).';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- Lock ----------

  /**
   * @param {string} absPath
   * @param {{ state: { type: 'shared' | 'exclusive', start: bigint, length: bigint } }} entry
   */
  const makeLockExo = (absPath, entry) => {
    let released = false;
    return makeExo('Lock', LockInterface, {
      async release() {
        if (released) return;
        released = true;
        const set = locksByPath.get(absPath);
        if (set) {
          set.delete(entry);
          if (set.size === 0) locksByPath.delete(absPath);
        }
      },
      help(method) {
        if (method === undefined) {
          return 'Lock: in-process advisory range lock on an OpenFile.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- OpenFile ----------

  /**
   * @param {string} absPath
   * @param {{
   *   read: boolean, write: boolean, append: boolean, truncate: boolean,
   * }} mode
   * @param {import('node:fs/promises').FileHandle} fh
   */
  const makeOpenFileExo = (absPath, mode, fh) => {
    let closed = false;
    const requireOpen = () => {
      if (closed) throw makeError(X`EBADF: OpenFile closed`);
    };
    const requireReadable = () => {
      if (!mode.read) throw makeError(X`EBADF: not opened for reading`);
    };
    const requireWritable = () => {
      if (!mode.write) throw makeError(X`EBADF: not opened for writing`);
    };

    return makeExo('OpenFile', OpenFileInterface, {
      async read(offset, length) {
        requireOpen();
        requireReadable();
        const len = Number(length);
        const off = Number(offset);
        if (len <= 0) {
          return makeBytesReaderFromBytes(new Uint8Array(0));
        }
        const buf = Buffer.alloc(len);
        const { bytesRead } = await fh.read(buf, 0, len, off);
        const slice = bytesRead === 0 ? new Uint8Array(0) : buf.subarray(0, bytesRead);
        return makeBytesReaderFromBytes(slice);
      },
      async write(offset) {
        requireOpen();
        requireWritable();
        let off = Number(offset);
        const sinkIterator = {
          /** @param {Uint8Array} bytes */
          async next(bytes) {
            const buf = Buffer.from(
              bytes.buffer,
              bytes.byteOffset,
              bytes.byteLength,
            );
            const { bytesWritten } = await fh.write(buf, 0, buf.length, off);
            off += bytesWritten;
            return { done: false, value: undefined };
          },
          async return(value) {
            return { done: true, value };
          },
          [Symbol.asyncIterator]() {
            return sinkIterator;
          },
        };
        return bytesWriterFromIterator(sinkIterator);
      },
      async truncate(length) {
        requireOpen();
        requireWritable();
        await fh.truncate(Number(length));
      },
      async fsync(opts) {
        requireOpen();
        const o = /** @type {any} */ (opts) || {};
        if (o.metadata) {
          await fh.sync();
        } else {
          await fh.datasync();
        }
      },
      async lock(opts) {
        const o = /** @type {any} */ (opts) || {};
        if (o.type !== 'shared' && o.type !== 'exclusive') {
          throw makeError(
            X`EINVAL: lock type must be 'shared' or 'exclusive', got ${q(o.type)}`,
          );
        }
        const requested = {
          type: o.type,
          start: BigInt(o.start ?? 0n),
          length: BigInt(o.length ?? 0n),
        };
        const set = getLockSet(absPath);
        for (const existing of set) {
          const sharedPair =
            existing.state.type === 'shared' && requested.type === 'shared';
          if (!sharedPair && rangesOverlap(existing.state, requested)) {
            throw makeError(
              X`EAGAIN: range conflicts with existing ${q(existing.state.type)} lock`,
            );
          }
        }
        const entry = { state: harden(requested) };
        set.add(entry);
        return makeLockExo(absPath, entry);
      },
      async getLock(opts) {
        const o = /** @type {any} */ (opts) || {};
        const probe = {
          type: 'exclusive',
          start: BigInt(o.start ?? 0n),
          length: BigInt(o.length ?? 0n),
        };
        const set = locksByPath.get(absPath);
        if (set) {
          for (const existing of set) {
            if (rangesOverlap(existing.state, probe)) {
              return existing.state;
            }
          }
        }
        return null;
      },
      async close() {
        if (closed) return;
        closed = true;
        try {
          await fh.close();
        } catch {
          // best-effort
        }
      },
      help(method) {
        if (method === undefined) {
          return 'OpenFile (disk-backed): a node:fs/promises FileHandle.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- Cursor ----------

  /**
   * @param {string} absDirPath
   */
  const makeCursorExo = absDirPath => {
    let position = 0n;
    let snapshot = /** @type {string[] | null} */ (null);

    const ensureSnapshot = async () => {
      if (snapshot === null) {
        try {
          snapshot = (await fsp.readdir(absDirPath)).sort();
        } catch (e) {
          throw makeError(X`${q(mapErrno(e, 'EIO'))}: readdir failed`);
        }
      }
      return snapshot;
    };

    return makeExo('Cursor', CursorInterface, {
      async stream() {
        const entries = await ensureSnapshot();
        const start = Number(position);
        const gen = async function* () {
          for (let i = start; i < entries.length; i += 1) {
            const name = entries[i];
            position += 1n;
            try {
              const stat = await fsp.lstat(
                nodePath.join(absDirPath, name),
              );
              yield harden({
                name,
                qid: qidFromStat(stat, stat.isDirectory()),
              });
            } catch {
              // Tolerate disappearance mid-iteration.
            }
          }
        };
        return readerFromIterator(gen());
      },
      async skip(n) {
        if (n < 0n) {
          throw makeError(X`EINVAL: skip(${q(n)}) negative`);
        }
        const entries = await ensureSnapshot();
        const max = BigInt(entries.length);
        position = position + n > max ? max : position + n;
      },
      async rewind() {
        position = 0n;
        snapshot = null;
      },
      help(method) {
        if (method === undefined) {
          return 'Cursor (disk-backed): readdir snapshot cursor.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- File ----------

  /**
   * @param {string} absPath
   * @param {import('node:fs').Stats} initialStat
   */
  const makeFileExoImpl = (absPath, initialStat) => {
    const cachedQid = qidFromStat(initialStat, false);
    return makeExo('File', FileInterface, {
      getQid() {
        return cachedQid;
      },
      async getAttrs() {
        const stat = await fsp.stat(absPath);
        return attrsFromStat(stat);
      },
      async setAttrs(updates) {
        const upd = /** @type {any} */ (updates) || {};
        if (upd.owner !== undefined) {
          throw makeError(
            X`EPERM: owner updates not in base Filesystem; use PosixFs`,
          );
        }
        if (upd.mtime !== undefined || upd.atime !== undefined) {
          const stat = await fsp.stat(absPath);
          const atime =
            upd.atime !== undefined
              ? Number(upd.atime) / 1_000_000
              : stat.atimeMs;
          const mtime =
            upd.mtime !== undefined
              ? Number(upd.mtime) / 1_000_000
              : stat.mtimeMs;
          await fsp.utimes(absPath, atime / 1000, mtime / 1000);
        }
        if (upd.size !== undefined) {
          await fsp.truncate(absPath, Number(upd.size));
        }
      },
      async watch() {
        return makeWatcherStub();
      },
      async xattrs() {
        return makeXattrsStub();
      },
      async open(opts) {
        const o = /** @type {any} */ (opts) || {};
        const mode = {
          read:
            o.read !== false && !o.write && !o.append && !o.truncate
              ? true
              : !!o.read,
          write: !!o.write,
          append: !!o.append,
          truncate: !!o.truncate,
        };
        if (!mode.read && !mode.write && !mode.append) mode.read = true;
        let flags = 0;
        if (mode.read && mode.write) flags |= fsConstants.O_RDWR;
        else if (mode.write) flags |= fsConstants.O_WRONLY;
        else flags |= fsConstants.O_RDONLY;
        if (mode.append) flags |= fsConstants.O_APPEND;
        if (mode.truncate) flags |= fsConstants.O_TRUNC;
        const fh = await fsp.open(absPath, flags);
        return makeOpenFileExo(absPath, mode, fh);
      },
      async snapshot() {
        try {
          const buf = await fsp.readFile(absPath);
          return makeBlobRefExo(new Uint8Array(buf));
        } catch {
          return null;
        }
      },
      help(method) {
        if (method === undefined) {
          return 'File (disk-backed): regular-file node.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- Directory ----------

  /**
   * @param {string} absDirPath
   * @param {import('node:fs').Stats} initialStat
   */
  const makeDirectoryExoImpl = (absDirPath, initialStat) => {
    const cachedQid = qidFromStat(initialStat, true);
    const exo = makeExo('Directory', DirectoryInterface, {
      getQid() {
        return cachedQid;
      },
      async getAttrs() {
        const stat = await fsp.stat(absDirPath);
        return attrsFromStat(stat);
      },
      async setAttrs(updates) {
        const upd = /** @type {any} */ (updates) || {};
        if (upd.owner !== undefined) {
          throw makeError(
            X`EPERM: owner updates not in base Filesystem; use PosixFs`,
          );
        }
        if (upd.mtime !== undefined || upd.atime !== undefined) {
          const stat = await fsp.stat(absDirPath);
          const atime =
            upd.atime !== undefined
              ? Number(upd.atime) / 1_000_000
              : stat.atimeMs;
          const mtime =
            upd.mtime !== undefined
              ? Number(upd.mtime) / 1_000_000
              : stat.mtimeMs;
          await fsp.utimes(absDirPath, atime / 1000, mtime / 1000);
        }
      },
      async watch() {
        return makeWatcherStub();
      },
      async xattrs() {
        return makeXattrsStub();
      },
      async lookup(name) {
        assertChildName(name);
        const child = nodePath.join(absDirPath, name);
        let stat;
        try {
          stat = await fsp.lstat(child);
        } catch (_e) {
          // Permission denied collapses to ENOENT per DESIGN.md §4.3.
          throw makeError(X`ENOENT: ${q(name)}`);
        }
        if (stat.isDirectory()) return makeDirectoryExo(child, stat);
        if (stat.isFile()) return makeFileExo(child, stat);
        // Other types (symlink, fifo, socket, device) aren't in
        // the base; surface as ENOENT to avoid lying about kind.
        throw makeError(X`ENOENT: ${q(name)}`);
      },
      async list() {
        return makeCursorExo(absDirPath);
      },
      async create(name, opts) {
        assertChildName(name);
        const child = nodePath.join(absDirPath, name);
        const o = /** @type {any} */ (opts) || {};
        // eslint-disable-next-line no-bitwise
        const flags =
          // eslint-disable-next-line no-bitwise
          fsConstants.O_RDWR |
          // eslint-disable-next-line no-bitwise
          fsConstants.O_CREAT |
          (o.exclusive ? fsConstants.O_EXCL : 0);
        const fh = await fsp.open(child, flags, 0o644);
        return makeOpenFileExo(
          child,
          { read: true, write: true, append: false, truncate: false },
          fh,
        );
      },
      async mkdir(name, _opts) {
        assertChildName(name);
        const child = nodePath.join(absDirPath, name);
        try {
          await fsp.mkdir(child);
        } catch (e) {
          throw makeError(X`${q(mapErrno(e, 'EIO'))}: mkdir ${q(name)}`);
        }
        const stat = await fsp.stat(child);
        return makeDirectoryExo(child, stat);
      },
      async unlink(name) {
        assertChildName(name);
        const child = nodePath.join(absDirPath, name);
        try {
          const stat = await fsp.lstat(child);
          if (stat.isDirectory()) {
            await fsp.rmdir(child);
          } else {
            await fsp.unlink(child);
          }
        } catch (e) {
          throw makeError(X`${q(mapErrno(e, 'EIO'))}: unlink ${q(name)}`);
        }
      },
      async rename(oldName, newParent, newName) {
        assertChildName(oldName);
        assertChildName(newName);
        // Look up the destination's path through our private
        // WeakMap. Caps from a different Filesystem won't be in
        // this map — surface EXDEV.
        const destDir = dirPaths.get(newParent);
        if (typeof destDir !== 'string') {
          throw makeError(
            X`EXDEV: rename target Directory is not from this Filesystem`,
          );
        }
        const src = nodePath.join(absDirPath, oldName);
        const dst = nodePath.join(destDir, newName);
        try {
          await fsp.rename(src, dst);
        } catch (e) {
          throw makeError(
            X`${q(mapErrno(e, 'EIO'))}: rename ${q(oldName)} -> ${q(newName)}`,
          );
        }
      },
      async fsync() {
        // Best-effort: open + sync + close.
        const fh = await fsp.open(absDirPath, fsConstants.O_RDONLY);
        try {
          await fh.sync();
        } finally {
          await fh.close();
        }
      },
      help(method) {
        if (method === undefined) {
          return 'Directory (disk-backed): directory node.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
    dirPaths.set(exo, absDirPath);
    return exo;
  };

  // ---------- Filesystem ----------

  return makeExo('Filesystem', FilesystemInterface, {
    async root() {
      // Ensure rootPath exists at attach time; surface a clean
      // error if it doesn't.
      const stat = await fsp.stat(canonicalRoot);
      if (!stat.isDirectory()) {
        throw makeError(
          X`ENOTDIR: rootPath ${q(canonicalRoot)} is not a directory`,
        );
      }
      return makeDirectoryExo(canonicalRoot, stat);
    },
    async named(viewName) {
      throw makeError(
        X`ENOTSUP: disk-backed FS has a single root, not ${q(viewName)}`,
      );
    },
    async statfs() {
      // node:fs doesn't expose statvfs; report what we can.
      // Implementations needing real free-space data should use a
      // platform-specific extension.
      return harden({
        totalBytes: 0n,
        freeBytes: 0n,
        availableBytes: 0n,
      });
    },
    help(method) {
      if (method === undefined) {
        return `Disk-backed Filesystem rooted at ${canonicalRoot}.`;
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(makeDiskFilesystem);

// ---------- helpers ----------

/**
 * @param {Uint8Array} bytes
 */
const makeBytesReaderFromBytes = bytes => {
  const generator = async function* () {
    if (bytes.length > 0) yield bytes;
  };
  return bytesReaderFromIterator(generator());
};
