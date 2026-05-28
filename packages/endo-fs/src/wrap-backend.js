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

import { makeExo } from '@endo/exo';
import { makeError, X, q } from '@endo/errors';

import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { bytesWriterFromIterator } from '@endo/exo-stream/bytes-writer-from-iterator.js';

import {
  DirectoryInterface,
  FileInterface,
  FilesystemInterface,
  OpenFileInterface,
} from './type-guards.js';

import { makeLockTable } from './shared/lock-table.js';
import { makeBlobRefExo } from './shared/blobref.js';
import {
  assertChildName,
  computeOpenMode,
  mintBrand,
  EMPTY_BYTES,
} from './shared/helpers.js';
import { synthQid } from './shared/qid.js';
import { makeStatTable } from './shared/stat-table.js';
import {
  cleanupPathTables,
  transplantPathTables,
} from './shared/path-tables.js';
import { makeXattrsExo } from './shared/xattrs-exo.js';
import { makeCursorExo } from './shared/cursor-exo.js';
import { makeNodeWatcherExo } from './shared/watcher-exo.js';

/**
 * @import { FsBackend } from './backend-types.js'
 */

/**
 * Probe a backend for optional capabilities; return a record of
 * present-method markers.
 *
 * @param {FsBackend} backend
 */
const probeCapabilities = backend => {
  const b = /** @type {any} */ (backend);
  return harden({
    getStat: typeof b.getStat === 'function',
    setStat: typeof b.setStat === 'function',
    fsync: typeof b.fsync === 'function',
    rename: typeof b.rename === 'function',
    watch: typeof b.watch === 'function',
    statfs: typeof b.statfs === 'function',
  });
};

const notSupported = method =>
  makeError(X`ENOSYS: ${q(method)} not implemented on this backend`);

// POSIX-only fields that base setStat/setAttrs can't accept; rejecting
// them gives callers a clear "compose a PosixFs cap" signal rather
// than a silent no-op.
const POSIX_ONLY_FIELDS = harden([
  'mode',
  'uid',
  'gid',
  'rdev',
  'nlink',
  'owner', // legacy: { uid, gid } sub-record
]);

/**
 * Reject patches containing POSIX-only fields. Accepts only
 * `size`, `mtime`, `atime`; other fields are silently dropped at
 * projection time by `narrowStatPatch` below (so unknown / future
 * fields don't error here — they just don't propagate to the
 * backend).
 *
 * @param {any} patch
 */
const validateStatPatch = patch => {
  if (patch === null || typeof patch !== 'object') {
    throw makeError(X`EINVAL: stat patch must be a record`);
  }
  for (const field of POSIX_ONLY_FIELDS) {
    if (field in patch) {
      throw makeError(
        X`EINVAL: ${q(field)} is a POSIX-only field; compose a PosixFs cap`,
      );
    }
  }
};

/**
 * Project a patch to the narrow `{ size?, mtime?, atime? }` shape
 * with `BigInt`-coerced values. Skips undefined fields so the
 * backend's `setStat?` sees only the keys the caller set.
 *
 * @param {any} patch
 * @returns {{ size?: bigint, mtime?: bigint, atime?: bigint }}
 */
const narrowStatPatch = patch => {
  const out = {};
  if (patch.size !== undefined) out.size = BigInt(patch.size);
  if (patch.mtime !== undefined) out.mtime = BigInt(patch.mtime);
  if (patch.atime !== undefined) out.atime = BigInt(patch.atime);
  return harden(out);
};

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

  // Vat-local xattr table. Every backing wrapped by wrapBackend
  // gets in-vat user.* xattr support unconditionally — the sidecar
  // is scoped to the Filesystem cap, not the underlying backing
  // (so two `makeNodeFilesystem({ rootPath })` over the same disk
  // start with empty xattr tables). Persistence to disk is a
  // PosixFs concern; see designs/endo-fs-backend-seam.md "Xattrs."
  /** @type {Map<string, Map<string, Uint8Array>>} */
  const xattrTable = new Map();

  // Vat-local per-path stat tracking. wrapBackend updates `mtime`
  // on `write`/`setStat`/`remove`-create, and `atime` on `read`.
  // Used for `getAttrs`/`getStat` so consumers see consistent
  // timestamps even on toy backings that don't track them.
  // `readStatNow` below prefers `backend.getStat?` over this when
  // present (so persistent backings surface disk-truthful values).
  const statTableKit = makeStatTable(lockKeyOf);
  const { statTable, touch, statOf } = statTableKit;
  const readStatNow = path =>
    statTableKit.readStatNow(backend, caps.getStat, path);

  /**
   * Remove every per-path table entry under `path` (and any subtree
   * under it for directories). Active watchers (entries in
   * `localSubs`) keep firing under their original path key —
   * moving a directory shouldn't silently redirect existing event
   * consumers; we drop them so consumers can re-subscribe under
   * the new path if they care.
   *
   * @param {string[]} path
   */
  const cleanupTables = path =>
    cleanupPathTables(path, lockKeyOf, [statTable, xattrTable, localSubs]);

  /**
   * Move every per-path table entry from `srcPath` to `dstPath`
   * (and any subtree underneath). Mirrors the rename's effect on
   * the backend so xattrs and stat timestamps follow the data.
   * `localSubs` is *cleaned* (not transplanted) — see cleanupTables
   * above.
   *
   * @param {string[]} srcPath
   * @param {string[]} dstPath
   */
  const transplantTables = (srcPath, dstPath) => {
    transplantPathTables(srcPath, dstPath, lockKeyOf, [statTable, xattrTable]);
    cleanupPathTables(srcPath, lockKeyOf, [localSubs]);
  };

  // Brand-set for cycle detection across CapTP boundaries.
  // ROADMAP §1.6. One brand per wrapBackend(...) call.
  const brand = mintBrand();
  const brandSet = harden([brand]);

  // Track which Directory exos this wrapBackend built, mapping each
  // to its path. Used by `rename` to detect same-Filesystem rename
  // (use direct backend.rename) vs cross-Filesystem rename (EXDEV).
  /** @type {WeakMap<object, string[]>} */
  const dirPaths = new WeakMap();

  // Wrap-backend-local event subscribers. Used for events that
  // originate at the wrap-backend layer (xattrs mutations, etc.)
  // — backend-emitted events come through `backend.watch?(path)`
  // directly and don't need this table.
  /** @type {Map<string, Set<(e: any) => void>>} */
  const localSubs = new Map();
  const fireLocal = (path, event) => {
    const key = lockKeyOf(path);
    const set = localSubs.get(key);
    if (!set) return;
    for (const sub of set) {
      try {
        sub(harden(event));
      } catch (_e) {
        // ignore handler errors
      }
    }
  };

  // ---------- Forward refs (mutual recursion) ----------
  //
  // makeFileExo and makeDirectoryExo call each other (Directory.lookup
  // returns a File or Directory exo depending on `kind`). Both are
  // arrow-function assignments later in the file; the `let`-then-
  // assign shape is required because the bodies are defined before
  // each other's binding is in scope. `prefer-const` would be wrong
  // here.

  /** @type {(path: string[]) => any} */
  // eslint-disable-next-line prefer-const
  let makeDirectoryExo;
  /** @type {(path: string[]) => any} */
  // eslint-disable-next-line prefer-const
  let makeFileExo;

  // ---------- Bound exo factories (delegate to shared/) ----------

  /** @param {string[]} path */
  const xattrsExoFor = path =>
    makeXattrsExo({ xattrTable, fireLocal, lockKeyOf, path });
  /** @param {string[]} dirPath */
  const cursorExoFor = dirPath => makeCursorExo({ backend, dirPath });
  /** @param {string[]} path */
  const watcherExoFor = path =>
    makeNodeWatcherExo({
      hasWatch: caps.watch,
      backendWatch: () =>
        /** @type {NonNullable<typeof backend.watch>} */ (backend.watch)(path),
      localSubs,
      subKey: lockKeyOf(path),
    });

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
      // `read(offset, length)` returns a `PassableBytesReader` that
      // yields the slice as one chunk. Bounded; the bytes are
      // base64-encoded on the CapTP wire and the receiver pulls them
      // with a single pipelined `next()`. Uint8Array can't cross
      // CapTP directly (marshalling rejects mutable typed arrays).
      async read(offset, length) {
        requireOpen('read');
        requireRead('read');
        const off = offset === undefined ? cursor : BigInt(offset);
        const len = length === undefined ? undefined : BigInt(length);
        const bytes = await backend.read(path, off, len);
        cursor = off + BigInt(bytes.length);
        // POSIX: reading updates the file's atime.
        touch(path, { atime: true });
        const gen = async function* () {
          if (bytes.length !== 0) yield bytes;
        };
        return bytesReaderFromIterator(gen());
      },
      // `write(offset)` returns a `PassableBytesWriter` whose chunks
      // get coalesced and pwritten at `offset` on close (pwrite
      // semantics — no truncate). Mirrors the existing wire shape.
      async write(offset) {
        requireOpen('write');
        requireWrite('write');
        const off = offset === undefined ? cursor : BigInt(offset);
        /** @type {Uint8Array[]} */
        const chunks = [];
        const sinkIterator = {
          /** @param {Uint8Array} chunk */
          async next(chunk) {
            if (chunk instanceof Uint8Array && chunk.length !== 0) {
              chunks.push(chunk);
            }
            return { done: false, value: undefined };
          },
          async return(value) {
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
            // POSIX: writing updates mtime (and ctime via touch).
            touch(path, { mtime: true });
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
        // Truncate is a mutation; bump mtime.
        touch(path, { mtime: true });
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

  // eslint-disable-next-line prefer-const
  /**
   * Read a file's portable stat (size + mtime + atime). Used by
   * both `getStat` (narrow shape) and `getAttrs` (legacy wide
   * shape that adds ctime/btime).
   *
   * @param {string[]} path
   */
  const readFileStat = async path => {
    const k = await backend.kind(path);
    if (k !== 'file') {
      throw makeError(X`ENOENT: ${q(path.join('/'))}`);
    }
    const st = await readStatNow(path);
    const size =
      st.size !== undefined
        ? st.size
        : BigInt((await backend.read(path)).length);
    return { ...st, size };
  };

  /**
   * Apply a stat patch on a file path: backend.setStat if the
   * backend has it, otherwise synthesize a resize via read+write.
   * Explicit mtime/atime in the patch wins; any other change
   * touches mtime to "now."
   *
   * @param {string[]} path
   * @param {{ size?: bigint, mtime?: bigint, atime?: bigint }} patch  raw user input
   */
  const applyStatPatch = async (path, patch) => {
    validateStatPatch(patch);
    const narrow = narrowStatPatch(patch);
    if (caps.setStat) {
      // @ts-expect-error optional method probed above
      await backend.setStat(path, narrow);
    } else if (narrow.size !== undefined) {
      // No backend setStat — synthesize a resize via read/write.
      // Other fields silently no-op since the statTable absorbs the
      // new mtime/atime below.
      const current = /** @type {Uint8Array} */ (await backend.read(path));
      const newSize = Number(narrow.size);
      if (newSize < current.length) {
        await backend.write(path, current.slice(0, newSize), 0n);
      } else if (newSize > current.length) {
        const grown = new Uint8Array(newSize);
        grown.set(current, 0);
        await backend.write(path, grown, 0n);
      }
    }
    // Explicit mtime/atime win; otherwise a size change touches mtime.
    const st = statOf(path);
    if (narrow.mtime !== undefined) {
      st.mtime = narrow.mtime;
    } else if (narrow.size !== undefined) {
      touch(path, { mtime: true });
    }
    if (narrow.atime !== undefined) st.atime = narrow.atime;
  };

  // eslint-disable-next-line prefer-const -- mutual recursion with makeDirectoryExo
  makeFileExo = path => {
    return makeExo('File', FileInterface, {
      async getStat() {
        const st = await readFileStat(path);
        return harden({
          size: st.size,
          mtime: st.mtime,
          atime: st.atime,
        });
      },
      async setStat(patch) {
        await applyStatPatch(path, patch);
      },
      // ---- Legacy: wide-shape attrs + Qid + sidecar xattrs ----
      getQid() {
        return synthQid(path, 'file');
      },
      async getAttrs() {
        const st = await readFileStat(path);
        return harden({
          size: st.size,
          mtime: st.mtime,
          atime: st.atime,
          ctime: st.ctime,
          btime: st.btime,
        });
      },
      async setAttrs(patch) {
        await applyStatPatch(path, patch);
      },
      xattrs() {
        return xattrsExoFor(path);
      },
      // ---- /Legacy ----
      async watch() {
        return watcherExoFor(path);
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
      // One-shot read porcelain: returns a `PassableBytesReader`
      // over the file bytes (or a slice). Saves the open/close
      // ceremony for the common whole-file case.
      async read(readOpts) {
        const o = readOpts || {};
        const off = o.offset === undefined ? 0n : BigInt(o.offset);
        const len = o.length === undefined ? undefined : BigInt(o.length);
        const bytes = await backend.read(path, off, len);
        // POSIX: reading updates atime.
        touch(path, { atime: true });
        const gen = async function* () {
          if (bytes.length !== 0) yield bytes;
        };
        return bytesReaderFromIterator(gen());
      },
      // One-shot write porcelain: returns a `PassableBytesWriter`
      // sink that, on close, truncates the file to the sum of all
      // chunks (whole-file overwrite) and writes them. If `opts.offset`
      // is set, pwrite semantics (no truncate).
      //
      // Truncating requires `backend.setStat` so we can shrink the
      // file's tail. Without it, a short write would leave the old
      // tail intact — silently violating the documented contract.
      // Throw ENOSYS at call time rather than at close time so the
      // caller doesn't push bytes into a sink that won't truncate.
      async write(writeOpts) {
        const o = writeOpts || {};
        const truncating = o.offset === undefined;
        if (truncating && !caps.setStat) {
          throw notSupported('File.write (whole-file overwrite)');
        }
        const off = truncating ? 0n : BigInt(o.offset);
        /** @type {Uint8Array[]} */
        const chunks = [];
        const sinkIterator = {
          async next(chunk) {
            if (chunk instanceof Uint8Array && chunk.length !== 0) {
              chunks.push(chunk);
            }
            return { done: false, value: undefined };
          },
          async return(value) {
            let total = 0;
            for (const c of chunks) total += c.length;
            const merged = new Uint8Array(total);
            let p = 0;
            for (const c of chunks) {
              merged.set(c, p);
              p += c.length;
            }
            if (truncating) {
              // @ts-expect-error caps.setStat checked above
              await backend.setStat(path, { size: 0n });
            }
            await backend.write(path, merged, off);
            // POSIX: writing updates mtime.
            touch(path, { mtime: true });
            return { done: true, value };
          },
          [Symbol.asyncIterator]() {
            return sinkIterator;
          },
        };
        return bytesWriterFromIterator(sinkIterator);
      },
      async snapshot() {
        const k = await backend.kind(path);
        if (k !== 'file') {
          throw makeError(X`ENOENT: ${q(path.join('/'))}`);
        }
        const bytes = await backend.read(path);
        return makeBlobRefExo(
          bytes,
          `BlobRef: snapshot of ${path.join('/') || '/'}.`,
        );
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

  // eslint-disable-next-line prefer-const
  /**
   * Apply a stat patch on a directory path. Directories have no
   * `size`, so applyStatPatch's read+write resize fallback isn't
   * meaningful — we just forward to `backend.setStat?` if present
   * and update the vat-local mtime/atime.
   *
   * @param {string[]} path
   * @param {{ mtime?: bigint, atime?: bigint }} patch
   */
  const applyDirectoryStatPatch = async (path, patch) => {
    validateStatPatch(patch);
    const narrow = narrowStatPatch(patch);
    if (caps.setStat) {
      // @ts-expect-error optional method probed above
      await backend.setStat(path, narrow);
    }
    const st = statOf(path);
    if (narrow.mtime !== undefined) st.mtime = narrow.mtime;
    if (narrow.atime !== undefined) st.atime = narrow.atime;
  };

  // eslint-disable-next-line prefer-const -- mutual recursion with makeFileExo
  makeDirectoryExo = path => {
    const exo = makeExo('Directory', DirectoryInterface, {
      async getStat() {
        const k = await backend.kind(path);
        if (k !== 'directory') {
          throw makeError(X`ENOENT: ${q(path.join('/'))}`);
        }
        const st = await readStatNow(path);
        return harden({ size: 0n, mtime: st.mtime, atime: st.atime });
      },
      async setStat(patch) {
        await applyDirectoryStatPatch(path, patch);
      },
      // ---- Legacy: wide-shape attrs + Qid + sidecar xattrs ----
      getQid() {
        return synthQid(path, 'directory');
      },
      async getAttrs() {
        const st = await readStatNow(path);
        return harden({
          size: 0n,
          mtime: st.mtime,
          atime: st.atime,
          ctime: st.ctime,
          btime: st.btime,
        });
      },
      async setAttrs(patch) {
        await applyDirectoryStatPatch(path, patch);
      },
      xattrs() {
        return xattrsExoFor(path);
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
        const childPath = [...path, name];
        await backend.remove(childPath);
        cleanupTables(childPath);
      },
      // ---- /Legacy ----
      async watch() {
        return watcherExoFor(path);
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
        return cursorExoFor(path);
      },
      async create(name, openOpts) {
        assertChildName(name);
        const childPath = [...path, name];
        const o = openOpts || {};
        const mode = computeOpenMode({
          read: o.read !== false,
          write: true,
          append: !!o.append,
          truncate: !!o.truncate,
        });
        // Eagerly schedule the create side-effect synchronously,
        // before any await, so a concurrent `lookup(name)` (e.g. the
        // 9p-server's pipelined create+lookup batch in Tlcreate)
        // sees the file. Sync-body backends (in-memory) commit
        // `records.set(...)` inside this call before the Promise
        // resolves; persistent backends preserve the original race
        // window but their consumers don't depend on
        // synchronous-visibility-after-create.
        const writeP = backend.write(childPath, EMPTY_BYTES, 0n);
        if (mode.truncate) {
          if (!caps.setStat) throw notSupported('create({ truncate: true })');
          const setStatFn = /** @type {NonNullable<typeof backend.setStat>} */ (
            backend.setStat
          );
          const truncP = writeP.then(() => setStatFn(childPath, { size: 0n }));
          await truncP;
        } else {
          await writeP;
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
        cleanupTables(childPath);
      },
      async rename(srcName, newParent, dstName) {
        assertChildName(srcName);
        assertChildName(dstName);
        const srcPath = [...path, srcName];
        const srcKind = await backend.kind(srcPath);
        if (srcKind === undefined) {
          throw makeError(X`ENOENT: ${q(srcName)}`);
        }
        // Same-Filesystem fast path: if newParent was built by this
        // wrapBackend, we can use the backend's atomic rename.
        const newParentPath = dirPaths.get(newParent);
        if (newParentPath !== undefined) {
          const dstPath = [...newParentPath, dstName];
          if (caps.rename) {
            // @ts-expect-error optional method probed above
            await backend.rename(srcPath, dstPath);
            transplantTables(srcPath, dstPath);
            return;
          }
          // Fallback: structural copy via backend operations.
          if (srcKind === 'file') {
            const bytes = await backend.read(srcPath);
            await backend.write(dstPath, bytes, 0n);
            await backend.remove(srcPath);
            transplantTables(srcPath, dstPath);
            return;
          }
          // Directory recursive copy is complex; defer.
          throw notSupported('rename of directory without backend.rename');
        }
        // Cross-Filesystem rename: EXDEV. The user can copy and
        // remove manually if they really want to move across.
        throw makeError(X`EXDEV: cross-Filesystem rename not supported`);
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
        const cursorExo = cursorExoFor(path);
        const watcherExo = watcherExoFor(path);
        return harden({ cursor: cursorExo, watcher: watcherExo });
      },
      help(method) {
        if (method === undefined) {
          return 'Directory: tree-shaped directory capability — lookup, list, create, makeDirectory, remove, rename, materialise, watch, watchFrom, fsync, getStat, setStat.';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
    dirPaths.set(exo, path);
    return exo;
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
      if (caps.statfs) {
        // @ts-expect-error optional method probed above
        const stats = await backend.statfs();
        return harden({ type: description, ...stats });
      }
      // Minimal default — toy backings without real disk metrics.
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
