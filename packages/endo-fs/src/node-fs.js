// @ts-check
/* eslint-disable no-await-in-loop, no-bitwise */
/* global Buffer */
/**
 * `node:fs/promises`-backed `Filesystem` (DESIGN.md §8.3).
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

import {
  promises as fsp,
  constants as fsConstants,
  watch as fsWatch,
} from 'node:fs';
import * as nodePath from 'node:path';

import { makeExo } from '@endo/exo';
import { makeError, X, q } from '@endo/errors';

import { bytesWriterFromIterator } from '@endo/exo-stream/bytes-writer-from-iterator.js';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';

import {
  FilesystemInterface,
  DirectoryInterface,
  FileInterface,
  CursorInterface,
  OpenFileInterface,
  XattrsInterface,
  NodeWatcherInterface,
} from './type-guards.js';
import {
  assertChildName,
  computeOpenMode,
  makeBytesReaderFromBytes,
  makeNotSupported,
  mintBrand,
  toSafeNumber,
} from './shared/helpers.js';
import { makeBlobRefExo } from './shared/blobref.js';
import { makeLockTable } from './shared/lock-table.js';

const NotSupported = makeNotSupported('node:fs/promises-backed FS');

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
 * Build a `node:fs/promises`-backed `Filesystem` capability rooted
 * at `rootPath`.
 *
 * @param {{ rootPath: string }} opts
 * @returns {object}
 */
export const makeNodeFilesystem = ({ rootPath }) => {
  if (typeof rootPath !== 'string' || !nodePath.isAbsolute(rootPath)) {
    throw makeError(X`rootPath must be an absolute path, got ${q(rootPath)}`);
  }
  const canonicalRoot = nodePath.normalize(rootPath);

  // Symlink-safe confinement: every path computed from a Directory
  // cap must resolve (via `realpath`) to a descendant of the root.
  // `rootRealPath` is resolved lazily on first use so the cap can be
  // minted before the directory is created on disk; the resolved
  // value is cached for the lifetime of the FS cap. Patterned after
  // `@endo/daemon/src/mount.js` `assertConfined`.
  /** @type {string | null} */
  let rootRealPathCache = null;
  const getRootRealPath = async () => {
    if (rootRealPathCache === null) {
      rootRealPathCache = await fsp.realpath(canonicalRoot);
    }
    return rootRealPathCache;
  };

  /**
   * Throw EACCES if `absPath`'s `realpath` escapes the root. For a
   * path that doesn't yet exist (`create` / `mkdir`), walk up to the
   * deepest existing ancestor and check its `realpath` instead —
   * mirrors Mount's `assertConfinedOrAncestor`.
   *
   * @param {string} absPath
   */
  const assertConfined = async absPath => {
    const rootResolved = await getRootRealPath();
    let check = absPath;
    for (;;) {
      let resolved;
      try {
        // eslint-disable-next-line no-await-in-loop
        resolved = await fsp.realpath(check);
      } catch {
        const parent = nodePath.dirname(check);
        if (parent === check) {
          throw makeError(
            X`EACCES: path escapes filesystem root: ${q(absPath)}`,
          );
        }
        check = parent;
        // eslint-disable-next-line no-continue
        continue;
      }
      if (
        resolved !== rootResolved &&
        !resolved.startsWith(`${rootResolved}${nodePath.sep}`)
      ) {
        throw makeError(X`EACCES: path escapes filesystem root: ${q(absPath)}`);
      }
      return;
    }
  };

  // Per-absolute-path lock table. Locks are advisory, in-process
  // only.
  /** @type {ReturnType<typeof makeLockTable<string>>} */
  const lockTable = makeLockTable();

  // Map every Directory exo we mint to its absolute path. Used by
  // `rename` to identify the destination Directory's path without
  // adding a method to the public guard — keeps the interface
  // clean while still rejecting cross-Filesystem caps with EXDEV.
  /** @type {WeakMap<object, string>} */
  const dirPaths = new WeakMap();

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
      BigInt(Math.floor(stat.ctimeMs)) * 1_000_000n + BigInt(stat.size);
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

  // ---------- Watcher (node:fs.watch-backed) ----------

  /**
   * Build a `NodeWatcher` that emits events as the kernel reports
   * filesystem changes at `absPath`. Uses `node:fs.watch`, which
   * has documented platform quirks:
   *   - Linux: file or directory; recursive requires opt-in
   *   - macOS: recursive supported via `{ recursive: true }`
   *   - Windows: recursive supported
   * For consistent semantics we watch only the node itself (not
   * recursively). Subdirectory events come from watchers on the
   * subdirectories themselves.
   *
   * Each fs.watch event is normalised to a endo-fs Event:
   *   { kind: 'changed' } for content/metadata change of `absPath`
   *   { kind: 'child-added' | 'child-removed', name } for dir
   *     watches when a child appears/disappears (we stat the
   *     child to distinguish, but fs.watch only signals "rename"
   *     for both add and remove on Linux, so we settle on
   *     'child-added' if the file exists post-event, 'child-
   *     removed' otherwise).
   *
   * @param {string} absPath
   * @param {'file' | 'directory'} kind
   */
  const makeWatcher = (absPath, kind) => {
    /** @type {object[]} */
    const buffered = [];
    /** @type {((evt: object | null) => void) | null} */
    let resolveNext = null;
    let cancelled = false;
    /** @type {ReturnType<typeof fsWatch> | null} */
    let watcher = null;

    const push = event => {
      if (cancelled) return;
      const frozen = harden(event);
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r(frozen);
      } else {
        buffered.push(frozen);
      }
    };

    try {
      watcher = fsWatch(
        absPath,
        { persistent: false },
        (eventType, filename) => {
          if (cancelled) return;
          if (kind === 'file') {
            push({ kind: 'changed' });
            return;
          }
          // Directory watch. eventType is 'rename' (add/remove) or
          // 'change' (child changed). filename may be null on some
          // platforms.
          if (eventType === 'change') {
            push({ kind: 'changed' });
            return;
          }
          if (!filename) {
            push({ kind: 'changed' });
            return;
          }
          // Probe whether the child still exists to disambiguate
          // add vs remove.
          fsp
            .lstat(nodePath.join(absPath, filename))
            .then(() => push({ kind: 'child-added', name: filename }))
            .catch(() => push({ kind: 'child-removed', name: filename }));
        },
      );
      watcher.on('error', () => {
        // Drop the watcher on error; subsequent events won't fire.
        if (watcher) {
          watcher.close();
          watcher = null;
        }
      });
    } catch {
      // If fs.watch isn't supported on this platform/path, the
      // watcher yields nothing (no events).
      watcher = null;
    }

    const detach = () => {
      if (watcher) {
        try {
          watcher.close();
        } catch {
          // best-effort
        }
        watcher = null;
      }
    };

    const eventGenerator = async function* () {
      try {
        while (!cancelled) {
          while (buffered.length > 0 && !cancelled) {
            yield /** @type {object} */ (buffered.shift());
          }
          if (cancelled) break;
          const next = await new Promise(resolve => {
            resolveNext = resolve;
          });
          if (cancelled || next === null) break;
          yield next;
        }
      } finally {
        detach();
      }
    };

    return makeExo('NodeWatcher', NodeWatcherInterface, {
      async events() {
        return readerFromIterator(eventGenerator());
      },
      async cancel() {
        cancelled = true;
        if (resolveNext) {
          const r = resolveNext;
          resolveNext = null;
          r(null);
        }
        detach();
      },
    });
  };

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

  // BlobRef and the advisory-lock table live in shared/.

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
        const len = toSafeNumber(length, 'length');
        const off = toSafeNumber(offset, 'offset');
        if (len === 0) {
          return makeBytesReaderFromBytes(new Uint8Array(0));
        }
        const buf = Buffer.alloc(len);
        const { bytesRead } = await fh.read(buf, 0, len, off);
        const slice =
          bytesRead === 0 ? new Uint8Array(0) : buf.subarray(0, bytesRead);
        return makeBytesReaderFromBytes(slice);
      },
      async write(offset) {
        requireOpen();
        requireWritable();
        let off = toSafeNumber(offset, 'offset');
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
        await fh.truncate(toSafeNumber(length, 'length'));
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
        return lockTable.acquire(absPath, opts);
      },
      async getLock(opts) {
        return lockTable.probe(absPath, opts);
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
        await assertConfined(absDirPath);
        const entries = await ensureSnapshot();
        const start = Number(position);
        const gen = async function* () {
          for (let i = start; i < entries.length; i += 1) {
            const name = entries[i];
            position += 1n;
            try {
              const stat = await fsp.lstat(nodePath.join(absDirPath, name));
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
        await assertConfined(absPath);
        const stat = await fsp.lstat(absPath);
        return attrsFromStat(stat);
      },
      async setAttrs(updates) {
        const upd = /** @type {any} */ (updates) || {};
        if (upd.owner !== undefined) {
          throw makeError(
            X`EPERM: owner updates not in base Filesystem; use PosixFs`,
          );
        }
        await assertConfined(absPath);
        if (upd.mtime !== undefined || upd.atime !== undefined) {
          const stat = await fsp.lstat(absPath);
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
        return makeWatcher(absPath, 'file');
      },
      async xattrs() {
        return makeXattrsStub();
      },
      async open(opts) {
        await assertConfined(absPath);
        const mode = computeOpenMode(opts);
        // O_NOFOLLOW so the open can't be hijacked by swapping the
        // path for a symlink between mint time and now.
        let flags = fsConstants.O_NOFOLLOW;
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
          await assertConfined(absPath);
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
        await assertConfined(absDirPath);
        const stat = await fsp.lstat(absDirPath);
        return attrsFromStat(stat);
      },
      async setAttrs(updates) {
        const upd = /** @type {any} */ (updates) || {};
        if (upd.owner !== undefined) {
          throw makeError(
            X`EPERM: owner updates not in base Filesystem; use PosixFs`,
          );
        }
        await assertConfined(absDirPath);
        if (upd.mtime !== undefined || upd.atime !== undefined) {
          const stat = await fsp.lstat(absDirPath);
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
        return makeWatcher(absDirPath, 'directory');
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
        // Filter out symlinks at the leaf (they aren't in the base
        // node model) before the containment check — otherwise a
        // symlink pointing outside the root would surface as EACCES,
        // which would leak its existence. Same with other special
        // types.
        if (!stat.isDirectory() && !stat.isFile()) {
          throw makeError(X`ENOENT: ${q(name)}`);
        }
        // Symlink-safe confinement: an intermediate component may
        // have been swapped for a symlink since this Directory cap
        // was minted; verify the resolved path is still a descendant
        // of the root.
        await assertConfined(child);
        if (stat.isDirectory()) return makeDirectoryExo(child, stat);
        return makeFileExo(child, stat);
      },
      async list() {
        return makeCursorExo(absDirPath);
      },
      async watchFrom() {
        // Atomic snapshot + subscribe (TOCTOU-free). Start the
        // `fs.watch` subscriber first so any kernel-reported
        // mutation after we return is captured, then mint the
        // cursor whose snapshot reflects this same moment.
        await assertConfined(absDirPath);
        const watcher = makeWatcher(absDirPath, 'directory');
        const cursor = makeCursorExo(absDirPath);
        return harden({ cursor, watcher });
      },
      async create(name, opts) {
        assertChildName(name);
        const child = nodePath.join(absDirPath, name);
        // Confine the parent path before issuing the create; the
        // child itself doesn't exist yet, so assertConfined walks
        // up to the deepest existing ancestor.
        await assertConfined(child);
        const o = /** @type {any} */ (opts) || {};
        // O_NOFOLLOW: if `name` is a pre-existing symlink, refuse
        // to open through it (kernel returns ELOOP). Without this,
        // `open(O_CREAT)` follows a leaf symlink and could write
        // through to a path outside the root.
        const flags =
          fsConstants.O_RDWR |
          fsConstants.O_CREAT |
          fsConstants.O_NOFOLLOW |
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
        await assertConfined(child);
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
        await assertConfined(child);
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
        await assertConfined(src);
        await assertConfined(dst);
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
      async materialise(path, _opts) {
        if (!Array.isArray(path)) {
          throw makeError(X`EINVAL: materialise path must be an array`);
        }
        let curPath = absDirPath;
        for (const seg of path) {
          assertChildName(seg);
          curPath = nodePath.join(curPath, seg);
          await assertConfined(curPath);
          try {
            await fsp.mkdir(curPath);
          } catch (e) {
            const code = mapErrno(e, 'EIO');
            if (code !== 'EEXIST') {
              throw makeError(X`${q(code)}: materialise ${q(seg)}`);
            }
            // Already present — verify it's a directory.
            const st = await fsp.lstat(curPath);
            if (!st.isDirectory()) {
              throw makeError(
                X`ENOTDIR: ${q(seg)} exists but is not a directory`,
              );
            }
          }
        }
        const finalStat = await fsp.lstat(curPath);
        return makeDirectoryExo(curPath, finalStat);
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

  const ownBrands = harden([mintBrand()]);

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
    async brands() {
      return ownBrands;
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
harden(makeNodeFilesystem);
