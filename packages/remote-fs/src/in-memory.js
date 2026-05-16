// @ts-check
/* eslint-disable no-await-in-loop */
/**
 * In-memory `Filesystem` (DESIGN.md §8.2).
 *
 * State lives in a closed-over object:
 *   nodes: Map<NodeId, NodeRecord>
 *   nextId: bigint counter, monotonically increases
 *
 * Each NodeRecord is `{ id, type, attrs, ...type-specific }`:
 *   directory: { children: Map<name, NodeId> }
 *   file:      { content: Uint8Array, xattrs: Map<name, Uint8Array> }
 *
 * The tree invariant (DESIGN.md §3 principle 5) is preserved
 * because no exo method takes a `Node` cap as a target argument and
 * binds it under a new name; every `create`/`mkdir` mints a fresh
 * NodeId.
 */

import { makeExo } from '@endo/exo';
import { makeError, X, q } from '@endo/errors';
import { encodeBase64, decodeBase64 } from '@endo/base64';

import {
  FilesystemInterface,
  DirectoryInterface,
  FileInterface,
  CursorInterface,
  OpenFileInterface,
  XattrsInterface,
  BytesReaderInterface,
  BytesWriterInterface,
  ReaderInterface,
  NodeWatcherInterface,
} from './guards.js';

/**
 * @typedef {bigint} NodeId
 * @typedef {{ type: 'directory' | 'file', pathId: bigint, version: bigint }} Qid
 * @typedef {{
 *   size: bigint, mtime: bigint, atime: bigint, ctime: bigint,
 *   btime: bigint | null,
 * }} Attrs
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
 * }} FileRecord
 * @typedef {DirectoryRecord | FileRecord} NodeRecord
 */

const EMPTY_BYTES = harden(new Uint8Array(0));

const nowNs = () => BigInt(Date.now()) * 1_000_000n;

const makeAttrs = () => {
  const t = nowNs();
  return { size: 0n, mtime: t, atime: t, ctime: t, btime: t };
};

const bumpVersion = record => {
  record.version += 1n;
  const t = nowNs();
  record.attrs = harden({ ...record.attrs, mtime: t, ctime: t });
};

/**
 * Build an in-memory `Filesystem` capability.
 *
 * The returned cap and every cap it (transitively) issues share a
 * single closed-over state object. The state object is private to
 * this call — there is no method to extract it, recover an internal
 * NodeId, or build a cap from an inode. The tree invariant is
 * enforced by construction: every `create`/`mkdir` mints a fresh
 * NodeId, and no public method accepts a `Node` cap to alias under
 * a new name.
 *
 * @returns {object} a `Filesystem` cap
 */
export const makeInMemoryFilesystem = () => {
  /** @type {Map<NodeId, NodeRecord>} */
  const nodes = new Map();
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
        return makeOneShotBytesReader(v);
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
        return makeBytesWriter(bytes => {
          record.xattrs.set(name, bytes);
          bumpVersion(record);
        });
      },
      async list() {
        return makeOneShotReader([...record.xattrs.keys()]);
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

  // ---------- Node-watcher (stub for v1) ----------

  const makeNodeWatcherStub = () =>
    makeExo('NodeWatcher', NodeWatcherInterface, {
      async events() {
        // F7: this should yield change events; for v1 we yield nothing.
        return makeOneShotReader([]);
      },
      async cancel() {
        // no-op
      },
    });

  // ---------- Cursor (DESIGN.md §4.5) ----------

  /**
   * @param {NodeId} dirId
   */
  const makeCursorExo = dirId => {
    let position = 0n;

    const snapshotEntries = () => {
      // Capture the entries at the moment of the read so that
      // mutations during streaming don't interleave inconsistently.
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
        // Advance position as the stream is consumed.
        let i = 0;
        return makeFarIterator({
          async next() {
            if (i >= sliced.length) return harden({ done: true, value: undefined });
            const [name, id] = sliced[i];
            i += 1;
            position += 1n;
            const record = nodes.get(id);
            if (!record) {
              // Tolerate disappearance during iteration; skip.
              return this.next();
            }
            return harden({
              done: false,
              value: harden({ name, qid: recordQid(record) }),
            });
          },
          async return(value) {
            // Stream closed early; position already reflects what
            // we yielded.
            return harden({ done: true, value });
          },
        });
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
          off >= r.content.length
            ? EMPTY_BYTES
            : r.content.slice(off, end);
        // Yield in one chunk for v1; real backings would chunk.
        return makeOneShotBytesReader(slice);
      },
      async write(offset) {
        requireOpen();
        requireWritable();
        let off = Number(offset);
        return makeBytesWriter(bytes => {
          const r = /** @type {FileRecord} */ (getRecord(fileId));
          const needed = off + bytes.length;
          let content = r.content;
          if (needed > content.length) {
            const grown = new Uint8Array(needed);
            grown.set(content, 0);
            content = grown;
          }
          content.set(bytes, off);
          r.content = harden(content);
          r.attrs = harden({ ...r.attrs, size: BigInt(content.length) });
          bumpVersion(r);
          off += bytes.length;
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
      async lock(_opts) {
        throw makeError(X`ENOSYS: lock not implemented in v1`);
      },
      async getLock(_opts) {
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
        if (upd.ctime !== undefined) next.ctime = BigInt(upd.ctime);
        r.attrs = harden(next);
        bumpVersion(r);
      },
      async watch() {
        return makeNodeWatcherStub();
      },
      async xattrs() {
        return makeXattrsExo(getRecord(fileId));
      },
      async open(opts) {
        const o = /** @type {any} */ (opts) || {};
        const mode = {
          read: o.read !== false && !o.write && !o.append && !o.truncate
            ? true
            : !!o.read,
          write: !!o.write,
          append: !!o.append,
          truncate: !!o.truncate,
        };
        // If nothing was requested, default to read-only.
        if (!mode.read && !mode.write && !mode.append) mode.read = true;
        return makeOpenFileExo(fileId, mode);
      },
      async snapshot() {
        // F2/F6 future: produce a BlobRef. v1 returns null.
        return null;
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
        if (upd.ctime !== undefined) next.ctime = BigInt(upd.ctime);
        r.attrs = harden(next);
        bumpVersion(r);
      },
      async watch() {
        return makeNodeWatcherStub();
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
        // Permission denied collapses to ENOENT per DESIGN.md §4.3.
        if (childId === undefined) {
          throw makeError(X`ENOENT: ${q(name)}`);
        }
        const child = nodes.get(childId);
        if (!child) {
          // Stale child id; treat as ENOENT.
          dir.children.delete(name);
          throw makeError(X`ENOENT: ${q(name)}`);
        }
        return child.type === 'directory'
          ? makeDirectoryExo(child.id)
          : makeFileExo(child.id);
      },
      async list() {
        // Defer cursor construction to a fresh cap each call.
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
          // Open the existing file. Must be a file, not a directory.
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
        nodes.set(id, {
          id,
          type: 'file',
          attrs: makeAttrs(),
          version: 1n,
          content: EMPTY_BYTES,
          xattrs: new Map(),
        });
        dir.children.set(name, id);
        bumpVersion(dir);
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
      },
      async rename(oldName, newParent, newName) {
        const src = /** @type {DirectoryRecord} */ (getRecord(dirId));
        const childId = src.children.get(oldName);
        if (childId === undefined) {
          throw makeError(X`ENOENT: ${q(oldName)}`);
        }
        // Resolve newParent's NodeId via its qid (which we trust to
        // carry pathId == NodeId for our own caps).
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
          // Overwrite: only files can replace files; directories
          // require empty target.
          const existing = getRecord(dest.children.get(newName));
          if (existing.type === 'directory' && existing.children.size > 0) {
            throw makeError(X`ENOTEMPTY: ${q(newName)}`);
          }
          dest.children.delete(newName);
          nodes.delete(existing.id);
        }
        src.children.delete(oldName);
        dest.children.set(newName, childId);
        bumpVersion(src);
        if (src !== dest) bumpVersion(dest);
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
      throw makeError(X`ENOTSUP: in-memory FS has a single root, not ${q(viewName)}`);
    },
    async statfs() {
      let totalBytes = 0n;
      for (const r of nodes.values()) {
        if (r.type === 'file') totalBytes += BigInt(r.content.length);
      }
      // Free space is a lie for in-memory; report a generous number (1 GiB).
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

// ---------- Far iterator / sink helpers ----------

/**
 * Wrap a `{ next, return }` shape as a Far iterator ref. v1 stand-in
 * for `@endo/exo-stream`'s `PassableReader`.
 *
 * @param {{ next: () => Promise<IteratorResult<any>>,
 *           return?: (value?: unknown) => Promise<IteratorResult<any>> }} iter
 */
const makeFarIterator = iter => {
  return makeExo('Reader', ReaderInterface, {
    async next() {
      return iter.next();
    },
    async return(value) {
      if (iter.return) return iter.return(value);
      return harden({ done: true, value });
    },
  });
};

/**
 * Wrap an array as a Far iterator that yields each element once.
 *
 * @param {any[]} items
 */
const makeOneShotReader = items => {
  let i = 0;
  return makeFarIterator({
    async next() {
      if (i >= items.length) return harden({ done: true, value: undefined });
      const value = items[i];
      i += 1;
      return harden({ done: false, value });
    },
    async return(value) {
      i = items.length;
      return harden({ done: true, value });
    },
  });
};

/**
 * One-shot bytes reader that yields a single base64-encoded chunk
 * then `done`. Pass-style doesn't admit mutable `Uint8Array`s across
 * cap boundaries; v1 follows `@endo/exo-stream`'s convention of
 * base64-on-the-wire. Callers decode with `@endo/base64`.
 *
 * @param {Uint8Array} bytes
 */
const makeOneShotBytesReader = bytes => {
  let yielded = false;
  return makeExo('BytesReader', BytesReaderInterface, {
    async next() {
      if (yielded) return harden({ done: true, value: undefined });
      yielded = true;
      return harden({ done: false, value: encodeBase64(bytes) });
    },
    async return(value) {
      yielded = true;
      return harden({ done: true, value });
    },
  });
};

/**
 * Build a Far sink that consumes base64-encoded chunks pushed by
 * the initiator and forwards decoded bytes to `consume`.
 *
 * @param {(bytes: Uint8Array) => void} consume
 */
const makeBytesWriter = consume => {
  let closed = false;
  return makeExo('BytesWriter', BytesWriterInterface, {
    async write(chunk) {
      if (closed) throw makeError(X`EBADF: writer closed`);
      if (typeof chunk !== 'string') {
        throw makeError(
          X`EINVAL: BytesWriter.write expects base64 string, got ${q(typeof chunk)}`,
        );
      }
      consume(decodeBase64(chunk));
    },
    async close(_value) {
      closed = true;
    },
  });
};
