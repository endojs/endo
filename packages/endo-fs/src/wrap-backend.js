// @ts-check
/**
 * `wrapBackend(backend)` — build a full `Filesystem` exo on top of
 * any `FsBackend` (see `./backend-types.js`).
 *
 * This module owns **all** the exo plumbing (Filesystem, Directory,
 * File, OpenFile, Cursor, Watcher) that was previously duplicated
 * across in-memory.js / node-fs.js / from-mount.js. Each backing
 * now reduces to ~100–250 lines of `FsBackend` implementation; the
 * interface guards, materialise loop, lock-table, refcount/close
 * hygiene, and porcelain methods all live here.
 *
 * Optional backend methods (advertised by existence) get synthesized
 * fallbacks: in-vat lock table, copy+remove rename, no-op fsync,
 * empty watch stream, SHA-256 hash via read-whole. `setStat` is the
 * one optional with no fallback — wrapBackend surfaces ENOSYS when
 * the backend lacks it.
 */

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeError, X, q } from '@endo/errors';

import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { bytesWriterFromIterator } from '@endo/exo-stream/bytes-writer-from-iterator.js';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

import {
  DirectoryInterface,
  FileInterface,
  FilesystemInterface,
  OpenFileInterface,
  CursorInterface,
  NodeWatcherInterface,
  XattrsInterface,
} from './type-guards.js';

import { makeLockTable } from './shared/lock-table.js';
import {
  assertChildName,
  computeOpenMode,
  mintBrand,
  toSafeNumber,
  EMPTY_BYTES,
} from './shared/helpers.js';

/**
 * @import { FsBackend, NodeKind, NodeStat, DirEntry, LockOpts } from './backend-types.js'
 */

/**
 * Probe a backend for optional capabilities; return a record of
 * present-method markers.
 *
 * @param {FsBackend} backend
 */
const probeCapabilities = backend => {
  return harden({
    setStat: typeof /** @type {any} */ (backend).setStat === 'function',
    fsync: typeof /** @type {any} */ (backend).fsync === 'function',
    rename: typeof /** @type {any} */ (backend).rename === 'function',
    watch: typeof /** @type {any} */ (backend).watch === 'function',
    hash: typeof /** @type {any} */ (backend).hash === 'function',
  });
};

const notSupported = method =>
  makeError(X`ENOSYS: ${q(method)} not implemented on this backend`);

/**
 * Build a `Filesystem` exo on top of an `FsBackend`.
 *
 * @param {FsBackend} backend
 * @param {{
 *   description?: string,
 *   namedDirs?: Record<string, string[]>,
 * }} [opts]
 */
export const wrapBackend = (backend, opts = {}) => {
  const caps = probeCapabilities(backend);
  const description = opts.description ?? 'wrapBackend-built Filesystem';
  const namedDirs = harden({ ...(opts.namedDirs ?? {}) });

  // Vat-local advisory lock table, keyed by joined path.
  // Real OS-level locks live in the future PosixFs extension (F15).
  /** @type {ReturnType<typeof makeLockTable<string>>} */
  const lockTable = makeLockTable();
  const lockKeyOf = path => path.join('\0');

  // Brand-set for cycle detection across CapTP boundaries.
  // ROADMAP §1.6. One brand per wrapBackend(...) call.
  const brand = mintBrand();
  const brandSet = harden([brand]);

  // Watcher fanout: one backend watch per path, multiplexed to N
  // NodeWatcher subscribers.
  /** @type {Map<string, { subscribers: Set<(e: any) => void>, cancel: () => void }>} */
  const watchers = new Map();

  // ---------- Forward refs (mutual recursion) ----------

  /** @type {(path: string[]) => any} */
  let makeDirectoryExo;
  /** @type {(path: string[]) => any} */
  let makeFileExo;

  // ---------- Qid synthesis ----------

  /**
   * Synthesize a stable Qid for a path. The base backend doesn't
   * track inode-like identity; we hash the joined path so two looks
   * at the same path return identical Qids. POSIX-correct identity
   * (real inode numbers, version-on-mutation) comes from `PosixFs`.
   *
   * @param {string[]} path
   * @param {NodeKind} kind
   */
  const synthQid = (path, kind) => {
    // 64-bit FNV-1a over the joined path, masked to fit a bigint
    // we can pass through CapTP. Deterministic — same path → same id.
    let h = 0xcbf29ce484222325n;
    const FNV_PRIME = 0x100000001b3n;
    const MASK = 0xffffffffffffffffn;
    const joined = path.join('\0');
    for (let i = 0; i < joined.length; i += 1) {
      h = (h ^ BigInt(joined.charCodeAt(i))) & MASK;
      h = (h * FNV_PRIME) & MASK;
    }
    return harden({ type: kind, pathId: h, version: 0n });
  };

  // ---------- Xattrs legacy stub ----------

  /**
   * Build an `Xattrs` exo that throws ENOSYS on every op. Used to
   * satisfy the legacy `Node.xattrs()` method while the base no
   * longer carries real xattr support (moved to PosixFs).
   */
  const makeXattrsStub = () =>
    makeExo('Xattrs', XattrsInterface, {
      async get(_name) {
        throw notSupported('xattrs.get');
      },
      async set(_name, _opts) {
        throw notSupported('xattrs.set');
      },
      async list() {
        return readerFromIterator(
          (async function* empty() {
            // intentionally empty
          })(),
        );
      },
      async remove(_name) {
        throw notSupported('xattrs.remove');
      },
      help(method) {
        if (method === undefined) {
          return 'Xattrs (wrapBackend stub): xattrs are not exposed at this layer; compose a PosixFs cap for real xattr access.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });

  // ---------- Cursor ----------

  /**
   * Build a Cursor exo over the backend's `list(dirPath)` async
   * iterable. The Cursor owns its position; `read(limit)` returns
   * a bounded page, `stream()` returns a `PassableReader<DirEntry>`,
   * `toArray()` drains the lot.
   *
   * @param {string[]} dirPath
   */
  const makeCursorExo = dirPath => {
    /** @type {AsyncIterator<DirEntry> | null} */
    let iter = null;
    let exhausted = false;

    const ensureIter = () => {
      if (iter === null) {
        // @ts-expect-error AsyncIterable<DirEntry> is correct shape
        iter = backend.list(dirPath)[Symbol.asyncIterator]();
      }
      return iter;
    };

    return makeExo('Cursor', CursorInterface, {
      async read(limit) {
        if (exhausted) return harden({ entries: [], atEnd: true });
        const max = limit === undefined ? Infinity : toSafeNumber(limit, 'limit');
        const it = ensureIter();
        /** @type {DirEntry[]} */
        const entries = [];
        let atEnd = false;
        while (entries.length < max) {
          // eslint-disable-next-line no-await-in-loop
          const step = await it.next();
          if (step.done) {
            atEnd = true;
            exhausted = true;
            break;
          }
          entries.push(step.value);
        }
        return harden({ entries, atEnd });
      },
      async stream() {
        if (exhausted) {
          return readerFromIterator(
            (async function* empty() {
              // intentionally empty
            })(),
          );
        }
        const it = ensureIter();
        const generator = async function* () {
          for (;;) {
            // eslint-disable-next-line no-await-in-loop
            const step = await it.next();
            if (step.done) {
              exhausted = true;
              return;
            }
            yield step.value;
          }
        };
        return readerFromIterator(generator());
      },
      async toArray() {
        if (exhausted) return harden([]);
        const it = ensureIter();
        /** @type {DirEntry[]} */
        const out = [];
        for (;;) {
          // eslint-disable-next-line no-await-in-loop
          const step = await it.next();
          if (step.done) {
            exhausted = true;
            break;
          }
          out.push(step.value);
        }
        return harden(out);
      },
      async skip(n) {
        const count = toSafeNumber(n, 'n');
        const it = ensureIter();
        for (let i = 0; i < count; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const step = await it.next();
          if (step.done) {
            exhausted = true;
            return;
          }
        }
      },
      async rewind() {
        iter = null;
        exhausted = false;
      },
      help(method) {
        if (method === undefined) {
          return 'Cursor: paged directory listing — read(limit) | stream() | toArray() | skip(n) | rewind().';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- NodeWatcher ----------

  /**
   * Build a NodeWatcher exo over the backend's `watch?(path)`
   * iterable (if present) or an empty stream.
   *
   * @param {string[]} path
   */
  const makeNodeWatcherExo = path => {
    let cancelled = false;
    /** @type {Array<{ resolve: (v: any) => void }>} */
    const waiters = [];
    /** @type {any[]} */
    const buffer = [];

    /** @type {AsyncIterator<any> | null} */
    let backendIter = null;
    if (caps.watch) {
      // @ts-expect-error optional method probed above
      const iterable = backend.watch(path);
      backendIter = iterable[Symbol.asyncIterator]();
      const pump = async () => {
        while (!cancelled) {
          // eslint-disable-next-line no-await-in-loop
          const step = await /** @type {AsyncIterator<any>} */ (backendIter).next();
          if (step.done) return;
          const event = step.value;
          if (waiters.length > 0) {
            const w = /** @type {{ resolve: (v: any) => void }} */ (waiters.shift());
            w.resolve({ done: false, value: event });
          } else {
            buffer.push(event);
          }
        }
      };
      pump().catch(() => {
        // backend iterator errored; drop subscribers gracefully
        cancelled = true;
        while (waiters.length > 0) {
          const w = /** @type {{ resolve: (v: any) => void }} */ (waiters.shift());
          w.resolve({ done: true, value: undefined });
        }
      });
    }

    const eventIterator = {
      async next() {
        if (cancelled) return { done: true, value: undefined };
        if (buffer.length > 0) {
          return { done: false, value: buffer.shift() };
        }
        if (backendIter === null) {
          return { done: true, value: undefined };
        }
        return new Promise(resolve => {
          waiters.push({ resolve });
        });
      },
      async return(value) {
        cancelled = true;
        while (waiters.length > 0) {
          const w = /** @type {{ resolve: (v: any) => void }} */ (waiters.shift());
          w.resolve({ done: true, value: undefined });
        }
        if (backendIter !== null) {
          try {
            if (typeof backendIter.return === 'function') {
              await backendIter.return(undefined);
            }
          } catch (_e) {
            // ignore
          }
        }
        return { done: true, value };
      },
      [Symbol.asyncIterator]() {
        return eventIterator;
      },
    };

    return makeExo('NodeWatcher', NodeWatcherInterface, {
      async events() {
        return readerFromIterator(eventIterator);
      },
      async cancel() {
        await eventIterator.return(undefined);
      },
    });
  };

  // ---------- OpenFile ----------

  /**
   * Build an OpenFile exo for a path with a given mode. The exo
   * holds the path; backend I/O is path-keyed.
   *
   * @param {string[]} path
   * @param {{ read: boolean, write: boolean, append: boolean, truncate: boolean }} mode
   */
  const makeOpenFileExo = (path, mode) => {
    let closed = false;
    let cursor = 0n;

    const requireRead = method => {
      if (!mode.read) {
        throw makeError(X`EBADF: ${q(method)} on a non-readable OpenFile`);
      }
    };
    const requireWrite = method => {
      if (!mode.write) {
        throw makeError(X`EBADF: ${q(method)} on a non-writable OpenFile`);
      }
    };
    const requireOpen = method => {
      if (closed) {
        throw makeError(X`EBADF: ${q(method)} on closed OpenFile`);
      }
    };

    return makeExo('OpenFile', OpenFileInterface, {
      async read(offset, length) {
        requireOpen('read');
        requireRead('read');
        const off = offset === undefined ? cursor : BigInt(offset);
        const len = length === undefined ? undefined : BigInt(length);
        const bytes = await backend.read(path, off, len);
        // Advance the cursor as a convenience for sequential readers.
        cursor = off + BigInt(bytes.length);
        return bytes;
      },
      async write(bytes, offset) {
        requireOpen('write');
        requireWrite('write');
        if (!(bytes instanceof Uint8Array)) {
          throw makeError(X`EINVAL: write expects a Uint8Array`);
        }
        const off = offset === undefined ? cursor : BigInt(offset);
        await backend.write(path, bytes, off);
        cursor = off + BigInt(bytes.length);
      },
      async stream(offset) {
        requireOpen('stream');
        requireRead('stream');
        const off = offset === undefined ? cursor : BigInt(offset);
        // Synthesize a stream by reading whole-from-offset and
        // yielding once. Backings with native streaming would override
        // by accepting a length-undefined `read` that returns chunks;
        // we don't expose that path through the seam.
        const bytes = await backend.read(path, off);
        cursor = off + BigInt(bytes.length);
        const gen = async function* () {
          if (bytes.length > 0) yield bytes;
        };
        return bytesReaderFromIterator(gen());
      },
      async streamWrite(offset) {
        requireOpen('streamWrite');
        requireWrite('streamWrite');
        let off = offset === undefined ? cursor : BigInt(offset);
        /** @type {Uint8Array[]} */
        const chunks = [];
        const sinkIterator = {
          /** @param {Uint8Array} chunk */
          async next(chunk) {
            if (chunk instanceof Uint8Array && chunk.length > 0) {
              chunks.push(chunk);
            }
            return { done: false, value: undefined };
          },
          async return(value) {
            // Coalesce and write at the original offset.
            let total = 0;
            for (const c of chunks) total += c.length;
            const merged = new Uint8Array(total);
            let p = 0;
            for (const c of chunks) {
              merged.set(c, p);
              p += c.length;
            }
            await backend.write(path, merged, off);
            cursor = off + BigInt(merged.length);
            // eslint-disable-next-line no-param-reassign
            off += BigInt(merged.length);
            return { done: true, value };
          },
          [Symbol.asyncIterator]() {
            return sinkIterator;
          },
        };
        return bytesWriterFromIterator(sinkIterator);
      },
      async truncate(size) {
        requireOpen('truncate');
        requireWrite('truncate');
        if (!caps.setStat) {
          throw notSupported('truncate');
        }
        // @ts-expect-error optional method probed above
        await backend.setStat(path, { size: BigInt(size) });
      },
      async fsync(_opts) {
        requireOpen('fsync');
        if (caps.fsync) {
          // @ts-expect-error optional method probed above
          await backend.fsync(path);
        }
        // else: no-op, the most honest answer for in-memory
      },
      async lock(lockOpts) {
        requireOpen('lock');
        return lockTable.acquire(lockKeyOf(path), lockOpts);
      },
      async getLock(lockOpts) {
        requireOpen('getLock');
        return lockTable.probe(lockKeyOf(path), lockOpts);
      },
      async close() {
        if (closed) return;
        closed = true;
      },
      help(method) {
        if (method === undefined) {
          return 'OpenFile: session-shaped file handle — read/write at offsets, stream, truncate, lock, fsync, close.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- materialise ----------

  /**
   * Recursively `makeDirectory` along `path` from `startPath`.
   * Used as the fallback for `Directory.materialise` when the
   * backing doesn't have a faster path.
   *
   * @param {string[]} startPath
   * @param {string[]} relPath
   */
  const materialise = async (startPath, relPath) => {
    let cur = startPath;
    for (const seg of relPath) {
      if (
        typeof seg !== 'string' ||
        seg.length === 0 ||
        seg === '.' ||
        seg === '..' ||
        seg.includes('/') ||
        seg.includes('\0')
      ) {
        throw makeError(X`EINVAL: invalid path segment ${q(seg)}`);
      }
      const next = [...cur, seg];
      // eslint-disable-next-line no-await-in-loop
      const k = await backend.kind(next);
      if (k === undefined) {
        // eslint-disable-next-line no-await-in-loop
        await backend.makeDirectory(next);
      } else if (k !== 'directory') {
        throw makeError(X`ENOTDIR: ${q(seg)} exists but is not a directory`);
      }
      cur = next;
    }
    return cur;
  };

  // ---------- File exo ----------

  makeFileExo = path => {
    return makeExo('File', FileInterface, {
      async getStat() {
        // Narrow stat — base provides only size. mtime/atime are
        // PosixFs territory; return them as undefined here.
        const k = await backend.kind(path);
        if (k !== 'file') {
          throw makeError(X`ENOENT: ${q(path.join('/'))}`);
        }
        const bytes = await backend.read(path);
        return harden({ size: BigInt(bytes.length) });
      },
      async setStat(patch) {
        if (!caps.setStat) throw notSupported('setStat');
        // @ts-expect-error optional method probed above
        await backend.setStat(path, patch);
      },
      // ---- Legacy ----
      getQid() {
        return synthQid(path, 'file');
      },
      async getAttrs() {
        const bytes = await backend.read(path);
        return harden({
          size: BigInt(bytes.length),
          mtime: 0n,
          atime: 0n,
          ctime: 0n,
          btime: null,
        });
      },
      async setAttrs(patch) {
        // Translate to narrow setStat; ignore POSIX-only fields.
        if (!caps.setStat) throw notSupported('setAttrs');
        const narrow = harden({
          ...(patch.size !== undefined && { size: BigInt(patch.size) }),
          ...(patch.mtime !== undefined && { mtime: BigInt(patch.mtime) }),
          ...(patch.atime !== undefined && { atime: BigInt(patch.atime) }),
        });
        // @ts-expect-error optional method probed above
        await backend.setStat(path, narrow);
      },
      xattrs() {
        return makeXattrsStub();
      },
      // ---- /Legacy ----
      async watch() {
        return makeNodeWatcherExo(path);
      },
      async open(openOpts) {
        const mode = computeOpenMode(openOpts);
        // Honor create / open-existing semantics.
        const k = await backend.kind(path);
        if (k === undefined) {
          if (!mode.write) {
            throw makeError(X`ENOENT: ${q(path.join('/'))}`);
          }
          // Create empty file.
          await backend.write(path, EMPTY_BYTES, 0n);
        } else if (k !== 'file') {
          throw makeError(X`EISDIR: ${q(path.join('/'))} is a directory`);
        } else if (mode.truncate) {
          if (!caps.setStat) {
            // No setStat → emulate truncate by writing empty bytes.
            // pwrite at 0 won't shrink, so we'd need a setStat. If
            // the backend lacks it, throw rather than silently lying.
            throw notSupported('open({ truncate: true })');
          }
          // @ts-expect-error optional method probed above
          await backend.setStat(path, { size: 0n });
        }
        return makeOpenFileExo(path, mode);
      },
      async read(readOpts) {
        const o = readOpts || {};
        const off = o.offset === undefined ? 0n : BigInt(o.offset);
        const len = o.length === undefined ? undefined : BigInt(o.length);
        return backend.read(path, off, len);
      },
      async write(bytes, writeOpts) {
        if (!(bytes instanceof Uint8Array)) {
          throw makeError(X`EINVAL: write expects a Uint8Array`);
        }
        const o = writeOpts || {};
        const off = o.offset === undefined ? 0n : BigInt(o.offset);
        // Default whole-file overwrite when no offset is given:
        // setStat({size: 0}) first if available so we don't leave
        // a tail. Backings without setStat just pwrite and may
        // leave a tail — caller's choice.
        if (o.offset === undefined && caps.setStat) {
          // @ts-expect-error optional method probed above
          await backend.setStat(path, { size: 0n });
        }
        await backend.write(path, bytes, off);
      },
      async snapshot() {
        // BlobRef synthesis is a follow-up; placeholder for now.
        throw notSupported('snapshot');
      },
      help(method) {
        if (method === undefined) {
          return 'File: bytes-level file capability — open(), read(opts), write(bytes, opts), getStat, setStat, watch.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- Directory exo ----------

  makeDirectoryExo = path => {
    return makeExo('Directory', DirectoryInterface, {
      async getStat() {
        const k = await backend.kind(path);
        if (k !== 'directory') {
          throw makeError(X`ENOENT: ${q(path.join('/'))}`);
        }
        return harden({});
      },
      async setStat(patch) {
        if (!caps.setStat) throw notSupported('setStat');
        // @ts-expect-error optional method probed above
        await backend.setStat(path, patch);
      },
      // ---- Legacy ----
      getQid() {
        return synthQid(path, 'directory');
      },
      async getAttrs() {
        return harden({
          size: 0n,
          mtime: 0n,
          atime: 0n,
          ctime: 0n,
          btime: null,
        });
      },
      async setAttrs(patch) {
        if (!caps.setStat) throw notSupported('setAttrs');
        const narrow = harden({
          ...(patch.size !== undefined && { size: BigInt(patch.size) }),
          ...(patch.mtime !== undefined && { mtime: BigInt(patch.mtime) }),
          ...(patch.atime !== undefined && { atime: BigInt(patch.atime) }),
        });
        // @ts-expect-error optional method probed above
        await backend.setStat(path, narrow);
      },
      xattrs() {
        return makeXattrsStub();
      },
      async mkdir(name, _opts) {
        // Legacy synonym for makeDirectory.
        assertChildName(name);
        const childPath = [...path, name];
        const k2 = await backend.kind(childPath);
        if (k2 === 'directory') return makeDirectoryExo(childPath);
        if (k2 !== undefined) {
          throw makeError(X`EEXIST: ${q(name)} exists and is not a directory`);
        }
        await backend.makeDirectory(childPath);
        return makeDirectoryExo(childPath);
      },
      async unlink(name) {
        // Legacy synonym for remove.
        assertChildName(name);
        await backend.remove([...path, name]);
      },
      // ---- /Legacy ----
      async watch() {
        return makeNodeWatcherExo(path);
      },
      async lookup(name) {
        assertChildName(name);
        const childPath = [...path, name];
        const k = await backend.kind(childPath);
        if (k === undefined) {
          throw makeError(X`ENOENT: ${q(name)}`);
        }
        if (k === 'directory') return makeDirectoryExo(childPath);
        return makeFileExo(childPath);
      },
      async list() {
        return makeCursorExo(path);
      },
      async create(name, openOpts) {
        assertChildName(name);
        const childPath = [...path, name];
        const k = await backend.kind(childPath);
        if (k === 'directory') {
          throw makeError(X`EISDIR: ${q(name)} is a directory`);
        }
        const mode = computeOpenMode({ ...openOpts, write: true });
        if (k === undefined) {
          await backend.write(childPath, EMPTY_BYTES, 0n);
        } else if (mode.truncate) {
          if (!caps.setStat) {
            throw notSupported('create({ truncate: true })');
          }
          // @ts-expect-error optional method probed above
          await backend.setStat(childPath, { size: 0n });
        }
        return makeOpenFileExo(childPath, mode);
      },
      async makeDirectory(name, _opts) {
        assertChildName(name);
        const childPath = [...path, name];
        const k = await backend.kind(childPath);
        if (k === 'directory') {
          // Idempotent: existing directory is returned.
          return makeDirectoryExo(childPath);
        }
        if (k !== undefined) {
          throw makeError(X`EEXIST: ${q(name)} exists and is not a directory`);
        }
        await backend.makeDirectory(childPath);
        return makeDirectoryExo(childPath);
      },
      async remove(name) {
        assertChildName(name);
        const childPath = [...path, name];
        await backend.remove(childPath);
      },
      async rename(srcName, newParent, dstName) {
        assertChildName(srcName);
        assertChildName(dstName);
        // For now we only support same-Filesystem rename via
        // backend.rename?; cross-Filesystem rename is out of scope.
        // newParent must be a Directory exo from this wrapBackend.
        // We don't have a direct way to extract its path, so we
        // fall back to copy+remove: read source bytes, write to
        // E(newParent).create(dstName), unlink source.
        if (caps.rename) {
          // Best-effort: if newParent is a Directory of this same
          // wrapBackend and exposes its path, we can use atomic
          // rename. We can't introspect that here; the safe path
          // is copy+remove via newParent's exo interface.
        }
        const srcPath = [...path, srcName];
        const srcKind = await backend.kind(srcPath);
        if (srcKind === undefined) {
          throw makeError(X`ENOENT: ${q(srcName)}`);
        }
        if (srcKind !== 'file') {
          // Directory rename via the exo path is complex (recursive
          // tree move); leave it as ENOSYS for now.
          throw notSupported('rename of directory across parents');
        }
        const bytes = await backend.read(srcPath);
        const dstHandle = await E(newParent).create(
          dstName,
          harden({ write: true }),
        );
        try {
          await E(dstHandle).write(bytes);
        } finally {
          await E(dstHandle).close();
        }
        await backend.remove(srcPath);
      },
      async fsync() {
        if (caps.fsync) {
          // @ts-expect-error optional method probed above
          await backend.fsync(path);
        }
      },
      async materialise(relPath, _opts) {
        const finalPath = await materialise(path, relPath);
        return makeDirectoryExo(finalPath);
      },
      async watchFrom() {
        const cursorExo = makeCursorExo(path);
        const watcherExo = makeNodeWatcherExo(path);
        return harden({ snapshot: cursorExo, watcher: watcherExo });
      },
      help(method) {
        if (method === undefined) {
          return 'Directory: tree-shaped directory capability — lookup, list, create, makeDirectory, remove, rename, materialise, watch, watchFrom, fsync, getStat, setStat.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- Filesystem exo ----------

  const root = makeDirectoryExo([]);

  return makeExo('Filesystem', FilesystemInterface, {
    root() {
      return root;
    },
    named(name) {
      const segs = namedDirs[name];
      if (!segs) {
        throw makeError(X`ENOENT: no named directory ${q(name)}`);
      }
      return makeDirectoryExo([...segs]);
    },
    async statfs() {
      // Minimal statfs — backings can override via opts.statfs if
      // they have real numbers. For now return zeros.
      return harden({
        type: description,
        blockSize: 0n,
        totalBlocks: 0n,
        freeBlocks: 0n,
      });
    },
    async brands() {
      return brandSet;
    },
    help(method) {
      if (method === undefined) {
        return `Filesystem (${description}): root/named/statfs/brands.`;
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(wrapBackend);
