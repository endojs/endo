// @ts-check
/* eslint-disable no-await-in-loop */
/**
 * In-memory `Filesystem` (DESIGN.md §8.2).
 *
 * State lives in a closed-over object:
 *   nodes: Map<NodeId, NodeRecord>
 *   nextId: bigint counter, monotonically increases
 *   watchers: Map<NodeId, Set<EventListener>>
 *
 * Each NodeRecord is `{ id, type, attrs, ...type-specific }`:
 *   directory: { children: Map<name, NodeId> }
 *   file:      { content: Uint8Array, xattrs, locks }
 *
 * The tree invariant (DESIGN.md §3 principle 5) is preserved
 * because no exo method takes a `Node` cap as a target argument and
 * binds it under a new name; every `create`/`mkdir` mints a fresh
 * NodeId.
 *
 * Streams returned by `OpenFile.read`/`write`, `Xattrs.get`/`set`/
 * `list`, `Cursor.stream`, `NodeWatcher.events`, and `BlobRef.fetch`
 * are `@endo/exo-stream`-shaped (bidirectional promise chains; base64
 * on the wire for bytes).
 */

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
 * @typedef {bigint} NodeId
 * @typedef {{ type: 'directory' | 'file', pathId: bigint, version: bigint }} Qid
 * @typedef {{
 *   size: bigint, mtime: bigint, atime: bigint, ctime: bigint,
 *   btime: bigint | null,
 * }} Attrs
 * @typedef {(event: object) => void} EventListener
 * @typedef {{
 *   type: 'shared' | 'exclusive',
 *   start: bigint,
 *   length: bigint,
 * }} LockState
 * @typedef {{
 *   id: NodeId,
 *   type: 'directory',
 *   attrs: Attrs,
 *   version: bigint,
 *   children: Map<string, NodeId>,
 *   xattrs: Map<string, Uint8Array>,
 * }} DirectoryRecord
 * @typedef {{
 *   id: NodeId,
 *   type: 'file',
 *   attrs: Attrs,
 *   version: bigint,
 *   content: Uint8Array,
 *   xattrs: Map<string, Uint8Array>,
 *   locks: Set<LockEntry>,
 * }} FileRecord
 * @typedef {{ state: LockState, owner: object }} LockEntry
 * @typedef {DirectoryRecord | FileRecord} NodeRecord
 */

const EMPTY_BYTES = harden(new Uint8Array(0));

const nowNs = () => BigInt(Date.now()) * 1_000_000n;

const makeAttrs = () => {
  const t = nowNs();
  return { size: 0n, mtime: t, atime: t, ctime: t, btime: t };
};

/**
 * Test whether two ranges intersect. `length === 0n` means "to end of
 * file" (POSIX convention). Returns `true` if the ranges share at
 * least one byte.
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

/**
 * Build an in-memory `Filesystem` capability.
 *
 * @returns {object} a `Filesystem` cap
 */
export const makeInMemoryFilesystem = () => {
  /** @type {Map<NodeId, NodeRecord>} */
  const nodes = new Map();
  /** @type {Map<NodeId, Set<EventListener>>} */
  const watchers = new Map();
  let nextId = 1n;

  const allocId = () => {
    const id = nextId;
    nextId += 1n;
    return id;
  };

  const rootId = allocId();
  nodes.set(rootId, {
    id: rootId,
    type: 'directory',
    attrs: makeAttrs(),
    version: 1n,
    children: new Map(),
    xattrs: new Map(),
  });

  /**
   * @param {NodeId} id
   * @returns {NodeRecord}
   */
  const getRecord = id => {
    const r = nodes.get(id);
    if (!r) throw makeError(X`ENOENT: stale node id ${q(id)}`);
    return r;
  };

  /**
   * @param {NodeRecord} record
   * @returns {Qid}
   */
  const recordQid = record =>
    harden({
      type: record.type,
      pathId: record.id,
      version: record.version,
    });

  /**
   * Fire an event to every active watcher on a node.
   *
   * @param {NodeId} id
   * @param {object} event
   */
  const fireEvent = (id, event) => {
    const set = watchers.get(id);
    if (!set || set.size === 0) return;
    const frozen = harden(event);
    for (const cb of set) {
      try {
        cb(frozen);
      } catch {
        // Listener crashed; drop it.
        set.delete(cb);
      }
    }
  };

  const bumpVersion = record => {
    record.version += 1n;
    const t = nowNs();
    record.attrs = harden({ ...record.attrs, mtime: t, ctime: t });
    fireEvent(record.id, { kind: 'changed' });
  };

  // Forward stubs for mutually-recursive exo builders; bodies
  // assigned below. The closure means callers see the assigned
  // value at call time.
  /** @type {(id: NodeId) => object} */
  // eslint-disable-next-line no-use-before-define
  const makeDirectoryExo = id => makeDirectoryExoImpl(id);
  /** @type {(id: NodeId) => object} */
  // eslint-disable-next-line no-use-before-define
  const makeFileExo = id => makeFileExoImpl(id);

  // ---------- Xattrs sub-cap (per Node) ----------

  /**
   * Build a `Xattrs` exo bound to a record's xattrs map.
   *
   * @param {NodeRecord} record
   */
  const makeXattrsExo = record => {
    return makeExo('Xattrs', XattrsInterface, {
      async get(name) {
        const v = record.xattrs.get(name);
        if (v === undefined) {
          throw makeError(X`ENODATA: xattr ${q(name)}`);
        }
        return makeBytesReaderFromBytes(v);
      },
      async set(name, opts) {
        const existence =
          (opts && /** @type {any} */ (opts).existence) || 'either';
        const present = record.xattrs.has(name);
        if (existence === 'create' && present) {
          throw makeError(X`EEXIST: xattr ${q(name)}`);
        }
        if (existence === 'replace' && !present) {
          throw makeError(X`ENODATA: xattr ${q(name)}`);
        }
        const buf = [];
        return makeBytesSinkWriter({
          onChunk(bytes) {
            buf.push(bytes);
          },
          onClose() {
            let total = 0;
            for (const c of buf) total += c.length;
            const merged = new Uint8Array(total);
            let off = 0;
            for (const c of buf) {
              merged.set(c, off);
              off += c.length;
            }
            record.xattrs.set(name, merged);
            bumpVersion(record);
          },
        });
      },
      async list() {
        return makeStringReaderFromArray([...record.xattrs.keys()]);
      },
      async remove(name) {
        if (!record.xattrs.delete(name)) {
          throw makeError(X`ENODATA: xattr ${q(name)}`);
        }
        bumpVersion(record);
      },
      help(method) {
        if (method === undefined) {
          return 'Xattrs: user.*-namespace xattrs on a node (DESIGN.md §4.8).';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- Node watcher (F7) ----------

  /**
   * @param {NodeId} nodeId
   */
  const makeNodeWatcherExo = nodeId => {
    /** @type {object[]} */
    const buffered = [];
    /** @type {((event: object | null) => void) | null} */
    let resolveNext = null;
    let cancelled = false;

    /** @type {EventListener} */
    const listener = event => {
      if (cancelled) return;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r(event);
      } else {
        buffered.push(event);
      }
    };
    let set = watchers.get(nodeId);
    if (!set) {
      set = new Set();
      watchers.set(nodeId, set);
    }
    set.add(listener);

    const detach = () => {
      const s = watchers.get(nodeId);
      if (s) {
        s.delete(listener);
        if (s.size === 0) watchers.delete(nodeId);
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

  // ---------- Cursor (DESIGN.md §4.5) ----------

  /**
   * @param {NodeId} dirId
   */
  const makeCursorExo = dirId => {
    let position = 0n;

    const snapshotEntries = () => {
      const dir = getRecord(dirId);
      if (dir.type !== 'directory') {
        throw makeError(X`ENOTDIR: ${q(dirId)} is not a directory`);
      }
      return [...dir.children.entries()];
    };

    return makeExo('Cursor', CursorInterface, {
      async stream() {
        const all = snapshotEntries();
        const sliced = all.slice(Number(position));
        // Advance position as the iterator yields each entry.
        const gen = async function* () {
          for (const [name, id] of sliced) {
            const record = nodes.get(id);
            position += 1n;
            if (record) {
              yield harden({ name, qid: recordQid(record) });
            }
          }
        };
        return readerFromIterator(gen());
      },
      async skip(n) {
        if (n < 0n) {
          throw makeError(X`EINVAL: skip(${q(n)}) negative`);
        }
        const all = snapshotEntries();
        const max = BigInt(all.length);
        position = position + n > max ? max : position + n;
      },
      async rewind() {
        position = 0n;
      },
      help(method) {
        if (method === undefined) {
          return 'Cursor: directory enumeration state (DESIGN.md §4.5).';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- BlobRef (DESIGN.md §6) ----------

  /**
   * Mint a `BlobRef` from a captured `Uint8Array` snapshot. The
   * `BlobRef`'s identity (algorithm + hash + size) is computed at
   * construction; subsequent mutations to the file are independent.
   *
   * @param {Uint8Array} bytes
   */
  const makeBlobRefExo = bytes => {
    const captured = harden(new Uint8Array(bytes));
    const hashBytes = createHash('sha256').update(captured).digest();
    const hashB64 = hashBytes.toString('base64');
    const info = harden({
      algorithm: 'sha256',
      hash: hashB64,
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
          off >= captured.length ? EMPTY_BYTES : captured.slice(off, end);
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

  // ---------- Lock (F8: in-process advisory) ----------

  /**
   * @param {FileRecord} fileRecord
   * @param {LockEntry} entry
   */
  const makeLockExo = (fileRecord, entry) => {
    let released = false;
    const exo = makeExo('Lock', LockInterface, {
      async release() {
        if (released) return;
        released = true;
        fileRecord.locks.delete(entry);
      },
      help(method) {
        if (method === undefined) {
          return 'Lock: advisory byte-range lock on an OpenFile (DESIGN.md §4.6).';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
    entry.owner = exo;
    return exo;
  };

  // ---------- OpenFile (DESIGN.md §4.6) ----------

  /**
   * @param {NodeId} fileId
   * @param {{ read?: boolean, write?: boolean, append?: boolean,
   *            truncate?: boolean }} mode
   */
  const makeOpenFileExo = (fileId, mode) => {
    let closed = false;
    const requireOpen = () => {
      if (closed) throw makeError(X`EBADF: OpenFile(${q(fileId)}) closed`);
    };
    const requireReadable = () => {
      if (!mode.read) throw makeError(X`EBADF: not opened for reading`);
    };
    const requireWritable = () => {
      if (!mode.write) throw makeError(X`EBADF: not opened for writing`);
    };

    if (mode.truncate) {
      const r = /** @type {FileRecord} */ (getRecord(fileId));
      r.content = EMPTY_BYTES;
      r.attrs = harden({ ...r.attrs, size: 0n });
      bumpVersion(r);
    }

    return makeExo('OpenFile', OpenFileInterface, {
      async read(offset, length) {
        requireOpen();
        requireReadable();
        const r = /** @type {FileRecord} */ (getRecord(fileId));
        const off = Number(offset);
        const len = Number(length);
        const end = Math.min(off + len, r.content.length);
        const slice =
          off >= r.content.length ? EMPTY_BYTES : r.content.slice(off, end);
        return makeBytesReaderFromBytes(slice);
      },
      async write(offset) {
        requireOpen();
        requireWritable();
        let off = Number(offset);
        return makeBytesSinkWriter({
          onChunk(bytes) {
            const r = /** @type {FileRecord} */ (getRecord(fileId));
            const needed = off + bytes.length;
            let content = r.content;
            if (needed > content.length) {
              const grown = new Uint8Array(needed);
              grown.set(content, 0);
              content = grown;
            } else {
              // Defensive copy of the underlying buffer; the
              // shared one might be hardened.
              content = new Uint8Array(content);
            }
            content.set(bytes, off);
            r.content = harden(content);
            r.attrs = harden({ ...r.attrs, size: BigInt(content.length) });
            bumpVersion(r);
            off += bytes.length;
          },
        });
      },
      async truncate(length) {
        requireOpen();
        requireWritable();
        const r = /** @type {FileRecord} */ (getRecord(fileId));
        const newLen = Number(length);
        if (newLen === r.content.length) return;
        const next = new Uint8Array(newLen);
        next.set(r.content.subarray(0, Math.min(newLen, r.content.length)));
        r.content = harden(next);
        r.attrs = harden({ ...r.attrs, size: BigInt(newLen) });
        bumpVersion(r);
      },
      async fsync(_opts) {
        // In-memory: nothing to flush.
      },
      async lock(opts) {
        const r = /** @type {FileRecord} */ (getRecord(fileId));
        const o = /** @type {any} */ (opts) || {};
        if (o.type !== 'shared' && o.type !== 'exclusive') {
          throw makeError(
            X`EINVAL: lock type must be 'shared' or 'exclusive', got ${q(o.type)}`,
          );
        }
        const start = BigInt(o.start ?? 0n);
        const length = BigInt(o.length ?? 0n);
        const requested = { type: o.type, start, length };
        for (const existing of r.locks) {
          const sharedPair =
            existing.state.type === 'shared' && requested.type === 'shared';
          if (!sharedPair && rangesOverlap(existing.state, requested)) {
            throw makeError(
              X`EAGAIN: range [${q(start)}, ${q(length)}) conflicts with existing ${q(existing.state.type)} lock`,
            );
          }
        }
        /** @type {LockEntry} */
        const entry = {
          state: harden(requested),
          owner: /** @type {any} */ (null),
        };
        r.locks.add(entry);
        return makeLockExo(r, entry);
      },
      async getLock(opts) {
        const r = /** @type {FileRecord} */ (getRecord(fileId));
        const o = /** @type {any} */ (opts) || {};
        const probe = {
          type: 'exclusive',
          start: BigInt(o.start ?? 0n),
          length: BigInt(o.length ?? 0n),
        };
        for (const existing of r.locks) {
          if (rangesOverlap(existing.state, probe)) {
            return existing.state;
          }
        }
        return null;
      },
      async close() {
        closed = true;
      },
      help(method) {
        if (method === undefined) {
          return 'OpenFile: open handle on a File (DESIGN.md §4.6).';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- File (DESIGN.md §4.4) ----------

  /**
   * @param {NodeId} fileId
   */
  const makeFileExoImpl = fileId => {
    return makeExo('File', FileInterface, {
      getQid() {
        return recordQid(getRecord(fileId));
      },
      async getAttrs() {
        return getRecord(fileId).attrs;
      },
      async setAttrs(updates) {
        const r = getRecord(fileId);
        const upd = /** @type {any} */ (updates) || {};
        if (upd.owner !== undefined) {
          throw makeError(
            X`EPERM: owner updates not in base Filesystem; use PosixFs`,
          );
        }
        const next = { ...r.attrs };
        if (upd.size !== undefined) next.size = BigInt(upd.size);
        if (upd.mtime !== undefined) next.mtime = BigInt(upd.mtime);
        if (upd.atime !== undefined) next.atime = BigInt(upd.atime);
        // Bump ctime to reflect metadata-change-time unless the
        // caller set it explicitly. Do NOT clobber the caller's
        // mtime (the way bumpVersion() would).
        next.ctime = upd.ctime !== undefined ? BigInt(upd.ctime) : nowNs();
        r.attrs = harden(next);
        r.version += 1n;
        fireEvent(r.id, { kind: 'changed' });
      },
      async watch() {
        return makeNodeWatcherExo(fileId);
      },
      async xattrs() {
        return makeXattrsExo(getRecord(fileId));
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
        return makeOpenFileExo(fileId, mode);
      },
      async snapshot() {
        const r = /** @type {FileRecord} */ (getRecord(fileId));
        return makeBlobRefExo(r.content);
      },
      help(method) {
        if (method === undefined) {
          return 'File: regular-file node (DESIGN.md §4.4).';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- Directory (DESIGN.md §4.3) ----------

  /**
   * @param {NodeId} dirId
   */
  const makeDirectoryExoImpl = dirId => {
    return makeExo('Directory', DirectoryInterface, {
      getQid() {
        return recordQid(getRecord(dirId));
      },
      async getAttrs() {
        return getRecord(dirId).attrs;
      },
      async setAttrs(updates) {
        const r = getRecord(dirId);
        const upd = /** @type {any} */ (updates) || {};
        if (upd.owner !== undefined) {
          throw makeError(
            X`EPERM: owner updates not in base Filesystem; use PosixFs`,
          );
        }
        const next = { ...r.attrs };
        if (upd.mtime !== undefined) next.mtime = BigInt(upd.mtime);
        if (upd.atime !== undefined) next.atime = BigInt(upd.atime);
        next.ctime = upd.ctime !== undefined ? BigInt(upd.ctime) : nowNs();
        r.attrs = harden(next);
        r.version += 1n;
        fireEvent(r.id, { kind: 'changed' });
      },
      async watch() {
        return makeNodeWatcherExo(dirId);
      },
      async xattrs() {
        return makeXattrsExo(getRecord(dirId));
      },
      async lookup(name) {
        if (typeof name !== 'string' || name.length === 0) {
          throw makeError(X`EINVAL: lookup(${q(name)})`);
        }
        const dir = /** @type {DirectoryRecord} */ (getRecord(dirId));
        const childId = dir.children.get(name);
        if (childId === undefined) {
          throw makeError(X`ENOENT: ${q(name)}`);
        }
        const child = nodes.get(childId);
        if (!child) {
          dir.children.delete(name);
          throw makeError(X`ENOENT: ${q(name)}`);
        }
        return child.type === 'directory'
          ? makeDirectoryExo(child.id)
          : makeFileExo(child.id);
      },
      async list() {
        return makeCursorExo(dirId);
      },
      async create(name, opts) {
        const dir = /** @type {DirectoryRecord} */ (getRecord(dirId));
        const present = dir.children.get(name);
        const o = /** @type {any} */ (opts) || {};
        if (present !== undefined) {
          if (o.exclusive) {
            throw makeError(X`EEXIST: ${q(name)}`);
          }
          const existing = getRecord(present);
          if (existing.type !== 'file') {
            throw makeError(X`EISDIR: ${q(name)}`);
          }
          return makeOpenFileExo(present, {
            read: true,
            write: true,
            append: !!o.append,
            truncate: !!o.truncate,
          });
        }
        const id = allocId();
        /** @type {FileRecord} */
        const newRecord = {
          id,
          type: 'file',
          attrs: makeAttrs(),
          version: 1n,
          content: EMPTY_BYTES,
          xattrs: new Map(),
          locks: new Set(),
        };
        nodes.set(id, newRecord);
        dir.children.set(name, id);
        bumpVersion(dir);
        fireEvent(dirId, { kind: 'child-added', name });
        return makeOpenFileExo(id, {
          read: true,
          write: true,
          append: false,
          truncate: false,
        });
      },
      async mkdir(name, _opts) {
        const dir = /** @type {DirectoryRecord} */ (getRecord(dirId));
        if (dir.children.has(name)) {
          throw makeError(X`EEXIST: ${q(name)}`);
        }
        const id = allocId();
        nodes.set(id, {
          id,
          type: 'directory',
          attrs: makeAttrs(),
          version: 1n,
          children: new Map(),
          xattrs: new Map(),
        });
        dir.children.set(name, id);
        bumpVersion(dir);
        fireEvent(dirId, { kind: 'child-added', name });
        return makeDirectoryExo(id);
      },
      async unlink(name) {
        const dir = /** @type {DirectoryRecord} */ (getRecord(dirId));
        const childId = dir.children.get(name);
        if (childId === undefined) {
          throw makeError(X`ENOENT: ${q(name)}`);
        }
        const child = getRecord(childId);
        if (child.type === 'directory' && child.children.size > 0) {
          throw makeError(X`ENOTEMPTY: ${q(name)}`);
        }
        dir.children.delete(name);
        nodes.delete(childId);
        bumpVersion(dir);
        fireEvent(dirId, { kind: 'child-removed', name });
        fireEvent(childId, { kind: 'removed' });
      },
      async rename(oldName, newParent, newName) {
        const src = /** @type {DirectoryRecord} */ (getRecord(dirId));
        const childId = src.children.get(oldName);
        if (childId === undefined) {
          throw makeError(X`ENOENT: ${q(oldName)}`);
        }
        let destDirId;
        try {
          const destQid = /** @type {any} */ (newParent).getQid();
          destDirId = destQid.pathId;
        } catch (e) {
          throw makeError(
            X`EXDEV: rename target Directory is not from this Filesystem`,
          );
        }
        const dest = nodes.get(destDirId);
        if (!dest || dest.type !== 'directory') {
          throw makeError(X`ENOTDIR: rename target not a directory`);
        }
        if (dest.children.has(newName)) {
          const existing = getRecord(
            /** @type {bigint} */ (dest.children.get(newName)),
          );
          if (existing.type === 'directory' && existing.children.size > 0) {
            throw makeError(X`ENOTEMPTY: ${q(newName)}`);
          }
          dest.children.delete(newName);
          nodes.delete(existing.id);
          fireEvent(dest.id, { kind: 'child-removed', name: newName });
        }
        src.children.delete(oldName);
        dest.children.set(newName, childId);
        bumpVersion(src);
        if (src !== dest) bumpVersion(dest);
        fireEvent(src.id, { kind: 'renamed', from: oldName });
        if (src !== dest) {
          fireEvent(dest.id, { kind: 'renamed', to: newName });
        }
      },
      async fsync() {
        // In-memory: nothing to flush.
      },
      help(method) {
        if (method === undefined) {
          return 'Directory: directory node (DESIGN.md §4.3).';
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  // ---------- Filesystem ----------

  const fs = makeExo('Filesystem', FilesystemInterface, {
    async root() {
      return makeDirectoryExo(rootId);
    },
    async named(viewName) {
      throw makeError(
        X`ENOTSUP: in-memory FS has a single root, not ${q(viewName)}`,
      );
    },
    async statfs() {
      let totalBytes = 0n;
      for (const r of nodes.values()) {
        if (r.type === 'file') totalBytes += BigInt(r.content.length);
      }
      const freeBytes = 1_073_741_824n;
      return harden({
        totalBytes,
        freeBytes,
        availableBytes: freeBytes,
      });
    },
    help(method) {
      if (method === undefined) {
        return 'In-memory Filesystem (DESIGN.md §8.2).';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });

  return fs;
};
harden(makeInMemoryFilesystem);

// ---------- exo-stream helpers ----------

/**
 * Wrap a `Uint8Array` (already a snapshot) as a
 * `PassableBytesReader` that yields its bytes in one chunk.
 *
 * @param {Uint8Array} bytes
 */
const makeBytesReaderFromBytes = bytes => {
  const generator = async function* () {
    if (bytes.length > 0) yield bytes;
  };
  return bytesReaderFromIterator(generator());
};

/**
 * Wrap an array of strings as a `PassableReader`.
 *
 * @param {string[]} items
 */
const makeStringReaderFromArray = items => {
  const generator = async function* () {
    for (const item of items) yield item;
  };
  return readerFromIterator(generator());
};

/**
 * Build a `PassableBytesWriter` whose decoded chunks are pushed to
 * `onChunk` as `Uint8Array`s. The optional `onClose` callback runs
 * when the initiator closes the writer.
 *
 * @param {{
 *   onChunk: (bytes: Uint8Array) => void,
 *   onClose?: () => void,
 * }} hooks
 */
const makeBytesSinkWriter = ({ onChunk, onClose }) => {
  const sinkIterator = {
    /** @param {Uint8Array} bytes */
    async next(bytes) {
      onChunk(bytes);
      return { done: false, value: undefined };
    },
    async return(value) {
      if (onClose) onClose();
      return { done: true, value };
    },
    [Symbol.asyncIterator]() {
      return sinkIterator;
    },
  };
  return bytesWriterFromIterator(sinkIterator);
};
