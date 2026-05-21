// @ts-check
/* eslint-disable no-await-in-loop, no-bitwise, no-underscore-dangle */
/* global Buffer */
/**
 * Adapter: project `@endo/daemon` `Mount` → endo-fs `Filesystem`
 * (F5, DESIGN.md §9).
 *
 * Mount is the existing live FS surface in `@endo/daemon`. Its
 * methods (`has`, `list`, `lookup`, `readText`, `writeText`,
 * `remove`, `move`, `makeDirectory`, `snapshot`) cover similar
 * ground to endo-fs but with significant impedance mismatch:
 *
 * - File I/O is whole-file (no offset/length ranges).
 *   `OpenFile.read(offset, length)` fetches the full file and
 *   slices; large files pay the full transfer cost per read.
 * - `OpenFile.write(offset)` buffers writes and flushes back via
 *   `MountFile.writeBytes()` on writer close. Holes from
 *   non-contiguous writes are filled with zeros up to the
 *   highest written byte; the existing file content beyond is
 *   discarded (write-as-replace semantics).
 * - Mount has no inode concept; qid.pathId is derived from a
 *   hash of the (path-from-root) string, which means equal
 *   paths give equal qids but `rename` invalidates the qid.
 * - `Mount`'s lookup return type is discovered via CapTP's
 *   `__getMethodNames__()` rather than duck-typing.
 * - No xattrs (`ENOSYS`), no events (stub), no locks
 *   (`ENOSYS`).
 *
 * The adapter is useful day-1 for factories that want to accept
 * existing Mount caps (the bulk of Endo daemon's current FS
 * world) without breaking the endo-fs caller interface.
 */

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { makeError, X, q } from '@endo/errors';
import { createHash } from 'node:crypto';

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
  toSafeNumber,
} from './shared/helpers.js';
import { makeBlobRefExo } from './shared/blobref.js';

const NotSupported = makeNotSupported('Mount-adapted FS');

/**
 * Hash a path-segments array into a 64-bit BigInt for qid.pathId.
 *
 * @param {string[]} segments
 */
const pathHash = segments => {
  const joined = segments.join('/');
  const h = createHash('sha256').update(joined).digest();
  let out = 0n;
  for (let i = 0; i < 8; i += 1) {
    out = (out << 8n) | BigInt(h[i]);
  }
  return out;
};

/**
 * Probe a Mount.lookup result and decide whether it's a sub-Mount
 * (Directory) or a MountFile (File). Uses CapTP's method-name
 * introspection — the canonical Endo way (see CLAUDE.md).
 *
 * @param {any} cap
 */
const probeMountChild = async cap => {
  try {
    const methods = await E(cap).__getMethodNames__();
    if (methods.includes('lookup')) return 'directory';
    if (methods.includes('text') || methods.includes('streamBase64')) {
      return 'file';
    }
  } catch {
    // Fall through.
  }
  return null;
};

/**
 * Drain a Mount/MountFile streamBase64 reader into a Uint8Array.
 *
 * @param {any} streamRef
 */
const drainBase64Stream = async streamRef => {
  const chunks = [];
  // The Mount/MountFile streamBase64 returns an iterator ref whose
  // next() yields { done, value: string } where value is base64.
  for (;;) {
    const { done, value } = await E(streamRef).next();
    if (done) break;
    chunks.push(Buffer.from(/** @type {string} */ (value), 'base64'));
  }
  return Buffer.concat(chunks);
};

/**
 * Build a endo-fs `Filesystem` adapter over an `@endo/daemon`
 * `Mount`.
 *
 * @param {object} rootMount
 * @returns {object}
 */
export const mountAsFilesystem = rootMount => {
  // Map each adapted Directory exo to its path-segments array, so
  // `rename` can resolve a target Directory's relative path
  // without an extra method on the public guard.
  /** @type {WeakMap<object, string[]>} */
  const dirPaths = new WeakMap();

  // Forward stubs for mutually-recursive exo builders.
  /** @type {(mount: any, segs: string[]) => object} */
  // eslint-disable-next-line no-use-before-define
  const makeDirectoryExo = (mount, segs) => makeDirectoryExoImpl(mount, segs);
  /** @type {(file: any, segs: string[]) => object} */
  // eslint-disable-next-line no-use-before-define
  const makeFileExo = (file, segs) => makeFileExoImpl(file, segs);

  // ---------- stubs ----------

  const makeWatcherStub = () =>
    makeExo('NodeWatcher', NodeWatcherInterface, {
      async events() {
        const empty = async function* () {
          // Mount has no event surface.
        };
        return readerFromIterator(empty());
      },
      async cancel() {
        // no-op
      },
    });

  const makeXattrsStub = () =>
    makeExo('Xattrs', XattrsInterface, {
      async get(_n) {
        throw NotSupported('xattrs.get');
      },
      async set(_n, _o) {
        throw NotSupported('xattrs.set');
      },
      async list() {
        const empty = async function* () {
          // Mount has no xattrs.
        };
        return readerFromIterator(empty());
      },
      async remove(_n) {
        throw NotSupported('xattrs.remove');
      },
      help(method) {
        if (method === undefined) {
          return 'Xattrs (Mount-adapted): no xattrs exposed.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });

  // BlobRef lives in shared/.

  // ---------- OpenFile ----------

  /**
   * @param {any} mountFile
   * @param {string[]} segs
   * @param {{ read: boolean, write: boolean, append: boolean, truncate: boolean }} mode
   */
  const makeOpenFileExo = (mountFile, segs, mode) => {
    let closed = false;
    // Lazily-loaded copy of the file's current content. Refreshed
    // on first read. Mutated by write/truncate; flushed back on
    // close.
    /** @type {Uint8Array | null} */
    let buffer = null;
    let dirty = false;

    const requireOpen = () => {
      if (closed) throw makeError(X`EBADF: OpenFile closed`);
    };
    const ensureBuffer = async () => {
      if (buffer) return buffer;
      try {
        const stream = await E(mountFile).streamBase64();
        const bytes = await drainBase64Stream(stream);
        buffer = new Uint8Array(bytes);
      } catch {
        buffer = new Uint8Array(0);
      }
      return buffer;
    };

    if (mode.truncate) {
      buffer = new Uint8Array(0);
      dirty = true;
    }

    return makeExo('OpenFile', OpenFileInterface, {
      async read(offset, length) {
        requireOpen();
        if (!mode.read) throw makeError(X`EBADF: not opened for reading`);
        const data = await ensureBuffer();
        const off = toSafeNumber(offset, 'offset');
        const len = toSafeNumber(length, 'length');
        const end = Math.min(off + len, data.length);
        const slice =
          off >= data.length ? new Uint8Array(0) : data.slice(off, end);
        return makeBytesReaderFromBytes(slice);
      },
      async write(offset) {
        requireOpen();
        if (!mode.write) throw makeError(X`EBADF: not opened for writing`);
        let off = toSafeNumber(offset, 'offset');
        await ensureBuffer();
        const sinkIterator = {
          /** @param {Uint8Array} bytes */
          async next(bytes) {
            const needed = off + bytes.length;
            let content = /** @type {Uint8Array} */ (buffer);
            if (needed > content.length) {
              const grown = new Uint8Array(needed);
              grown.set(content, 0);
              content = grown;
            } else {
              content = new Uint8Array(content);
            }
            content.set(bytes, off);
            buffer = content;
            dirty = true;
            off += bytes.length;
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
        if (!mode.write) throw makeError(X`EBADF: not opened for writing`);
        await ensureBuffer();
        const newLen = toSafeNumber(length, 'length');
        const cur = /** @type {Uint8Array} */ (buffer);
        if (newLen === cur.length) return;
        const next = new Uint8Array(newLen);
        next.set(cur.subarray(0, Math.min(newLen, cur.length)));
        buffer = next;
        dirty = true;
      },
      async fsync(_opts) {
        if (!dirty) return;
        await E(mountFile).writeBytes(/** @type {any} */ (buffer));
        dirty = false;
      },
      async lock(_opts) {
        throw NotSupported('lock');
      },
      async getLock(_opts) {
        return null;
      },
      async close() {
        if (closed) return;
        closed = true;
        if (dirty && buffer) {
          try {
            await E(mountFile).writeBytes(/** @type {any} */ (buffer));
          } catch {
            // best-effort
          }
        }
      },
      help(method) {
        if (method === undefined) {
          return 'OpenFile (Mount-adapted): buffered, flushed on close.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- Cursor ----------

  /**
   * @param {any} mount
   * @param {string[]} segs
   */
  const makeCursorExo = (mount, segs) => {
    let position = 0n;
    /** @type {string[] | null} */
    let snapshot = null;

    const ensureSnapshot = async () => {
      if (snapshot === null) {
        try {
          snapshot = await E(mount).list();
        } catch (e) {
          throw makeError(X`EIO: Mount.list failed: ${q(String(e))}`);
        }
      }
      return /** @type {string[]} */ (snapshot);
    };

    return makeExo('Cursor', CursorInterface, {
      async stream() {
        const entries = await ensureSnapshot();
        const start = Number(position);
        const gen = async function* () {
          for (let i = start; i < entries.length; i += 1) {
            const name = entries[i];
            position += 1n;
            let cap = null;
            try {
              cap = await E(mount).lookup(name);
            } catch {
              cap = null;
            }
            if (cap !== null) {
              const kind = await probeMountChild(cap);
              if (kind !== null) {
                const childSegs = [...segs, name];
                yield harden({
                  name,
                  qid: harden({
                    type: kind,
                    pathId: pathHash(childSegs),
                    version: 0n,
                  }),
                });
              }
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
          return 'Cursor (Mount-adapted): Mount.list snapshot cursor.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- File ----------

  /**
   * @param {any} mountFile
   * @param {string[]} segs
   */
  const makeFileExoImpl = (mountFile, segs) => {
    const cachedQid = harden({
      type: 'file',
      pathId: pathHash(segs),
      version: 0n,
    });
    return makeExo('File', FileInterface, {
      getQid() {
        return cachedQid;
      },
      async getAttrs() {
        // Mount surface offers no size/mtime accessors. We fetch
        // the content to compute size; mtime defaults to 0.
        try {
          const stream = await E(mountFile).streamBase64();
          const bytes = await drainBase64Stream(stream);
          return harden({
            size: BigInt(bytes.length),
            mtime: 0n,
            atime: 0n,
            ctime: 0n,
            btime: null,
          });
        } catch {
          return harden({
            size: 0n,
            mtime: 0n,
            atime: 0n,
            ctime: 0n,
            btime: null,
          });
        }
      },
      async setAttrs(updates) {
        const upd = /** @type {any} */ (updates) || {};
        if (upd.owner !== undefined) {
          throw makeError(
            X`EPERM: owner updates not in base Filesystem; use PosixFs`,
          );
        }
        // Mount has no setAttrs surface. Silently no-op for time
        // updates; the caller's expectations are already
        // documented in the adapter header.
      },
      async watch() {
        return makeWatcherStub();
      },
      async xattrs() {
        return makeXattrsStub();
      },
      async open(opts) {
        return makeOpenFileExo(mountFile, segs, computeOpenMode(opts));
      },
      async snapshot() {
        try {
          const stream = await E(mountFile).streamBase64();
          const bytes = await drainBase64Stream(stream);
          return makeBlobRefExo(
            new Uint8Array(bytes),
            'BlobRef (Mount-adapted): content captured at snapshot time.',
          );
        } catch {
          return null;
        }
      },
      help(method) {
        if (method === undefined) {
          return 'File (Mount-adapted): wraps a MountFile.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- Directory ----------

  /**
   * @param {any} mount
   * @param {string[]} segs
   */
  const makeDirectoryExoImpl = (mount, segs) => {
    const cachedQid = harden({
      type: 'directory',
      pathId: pathHash(segs),
      version: 0n,
    });
    const exo = makeExo('Directory', DirectoryInterface, {
      getQid() {
        return cachedQid;
      },
      async getAttrs() {
        // No Mount-level attrs. Return zeros.
        return harden({
          size: 0n,
          mtime: 0n,
          atime: 0n,
          ctime: 0n,
          btime: null,
        });
      },
      async setAttrs(updates) {
        const upd = /** @type {any} */ (updates) || {};
        if (upd.owner !== undefined) {
          throw makeError(
            X`EPERM: owner updates not in base Filesystem; use PosixFs`,
          );
        }
        // no-op for Mount-adapted directories
      },
      async watch() {
        return makeWatcherStub();
      },
      async xattrs() {
        return makeXattrsStub();
      },
      async lookup(name) {
        assertChildName(name);
        let child;
        try {
          child = await E(mount).lookup(name);
        } catch (_e) {
          throw makeError(X`ENOENT: ${q(name)}`);
        }
        const kind = await probeMountChild(child);
        const childSegs = [...segs, name];
        if (kind === 'directory') return makeDirectoryExo(child, childSegs);
        if (kind === 'file') return makeFileExo(child, childSegs);
        throw makeError(X`ENOENT: ${q(name)}`);
      },
      async list() {
        return makeCursorExo(mount, segs);
      },
      async create(name, opts) {
        assertChildName(name);
        const o = /** @type {any} */ (opts) || {};
        const exists = await E(mount).has(name);
        if (exists && o.exclusive) {
          throw makeError(X`EEXIST: ${q(name)}`);
        }
        if (!exists) {
          // Create an empty file. Mount supports writeText('').
          await E(mount).writeText(name, '');
        }
        const child = await E(mount).lookup(name);
        const childSegs = [...segs, name];
        return makeOpenFileExo(child, childSegs, {
          read: true,
          write: true,
          append: !!o.append,
          truncate: !!o.truncate,
        });
      },
      async mkdir(name, _opts) {
        assertChildName(name);
        await E(mount).makeDirectory(name);
        const child = await E(mount).lookup(name);
        return makeDirectoryExo(child, [...segs, name]);
      },
      async unlink(name) {
        assertChildName(name);
        try {
          await E(mount).remove(name);
        } catch (e) {
          throw makeError(X`EIO: remove ${q(name)} failed: ${q(String(e))}`);
        }
      },
      async rename(oldName, newParent, newName) {
        assertChildName(oldName);
        assertChildName(newName);
        const destSegs = dirPaths.get(newParent);
        if (!destSegs) {
          throw makeError(
            X`EXDEV: rename target Directory is not from this Filesystem`,
          );
        }
        // Build the destination path relative to OUR root.
        // Mount.move accepts string|string[] paths interpreted
        // relative to the receiver mount. Since the destination
        // may live under a different sub-Mount of the same
        // adapter root, we use absolute (from-root) paths and
        // call move on the rootMount.
        const fromAbs = [...segs, oldName];
        const toAbs = [...destSegs, newName];
        await E(rootMount).move(fromAbs, toAbs);
      },
      async fsync() {
        // Mount has no sync surface; this is a no-op.
      },
      async materialise(path, _opts) {
        if (!Array.isArray(path)) {
          throw makeError(X`EINVAL: materialise path must be an array`);
        }
        let curSegs = segs;
        for (const seg of path) {
          assertChildName(seg);
          const absSegs = [...curSegs, seg];
          const has = await E(rootMount).has(absSegs);
          if (!has) {
            try {
              await E(rootMount).makeDirectory(absSegs);
            } catch (e) {
              throw makeError(
                X`EIO: materialise ${q(seg)} failed: ${q(String(e))}`,
              );
            }
          }
          // Verify it's a directory after the (idempotent) create.
          const child = await E(rootMount).lookup(absSegs);
          const kind = await probeMountChild(child);
          if (kind !== 'directory') {
            throw makeError(
              X`ENOTDIR: ${q(seg)} exists but is not a directory`,
            );
          }
          curSegs = absSegs;
        }
        const finalCap = await E(rootMount).lookup(curSegs);
        return makeDirectoryExo(finalCap, curSegs);
      },
      help(method) {
        if (method === undefined) {
          return 'Directory (Mount-adapted): wraps a Mount.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
    dirPaths.set(exo, segs);
    return exo;
  };

  // ---------- Filesystem ----------

  return makeExo('Filesystem', FilesystemInterface, {
    async root() {
      return makeDirectoryExo(rootMount, []);
    },
    async named(viewName) {
      throw makeError(
        X`ENOTSUP: Mount-adapted FS has a single root, not ${q(viewName)}`,
      );
    },
    async statfs() {
      // Mount has no statfs surface; return zeros.
      return harden({
        totalBytes: 0n,
        freeBytes: 0n,
        availableBytes: 0n,
      });
    },
    help(method) {
      if (method === undefined) {
        return 'Filesystem (Mount-adapted): projects an @endo/daemon Mount.';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(mountAsFilesystem);
