// @ts-check
/// <reference types="ses"/>

/**
 * `FsBackend` adapter for an immutable git tree.
 *
 * `wrapBackend(makeGitFsBackend({ backend, treeOid }))` produces a
 * full `@endo/endo-fs` `Filesystem` lazily backed by the git object
 * database at `treeOid`.  The daemon wraps that result with
 * `readOnly()` so the public cap rejects every mutating verb — git
 * history is immutable.
 *
 * The backend exposes only the read surface (`kind`, `list`, `read`,
 * `getStat`, `statfs`).  Mutating verbs (`write`, `makeDirectory`,
 * `remove`) throw `EROFS`; they exist because the `FsBackend`
 * contract requires them, but they should never be reached at runtime
 * because `readOnly()` intercepts before the backend is asked.
 *
 * Tree-entry listings are cached per tree OID and path-resolution
 * results are cached per path — both safe because the tree is
 * immutable for the lifetime of this backend instance.  Blob bytes
 * are not cached here; callers that want CAS-backed caching compose
 * `withCachedReads(fs, cas)` in endo-fs.
 *
 * See `designs/endo-fs-from-git.md` for the contract.
 */

import { makeError, X, q } from '@endo/errors';

/**
 * @import { GitBackend, GitTreeEntryRecord } from './git.js'
 * @import { FsBackend, DirEntry, NodeKind } from '@endo/endo-fs/src/backend-types.js'
 */

const EMPTY_BYTES = harden(new Uint8Array(0));

/**
 * Resolved path → entry result.  `null` means "definitively absent"
 * (cache the negative lookup so successive `kind('/missing')` calls
 * don't re-walk).  A submodule (`type: 'commit'` in git) resolves to
 * `null` here — `wrapBackend` then reports the path as missing,
 * which is the cheapest signal the public surface can give without
 * a dedicated "submodule" QID variant.
 *
 * @typedef {{
 *   kind: NodeKind,
 *   oid: string,
 *   size: number,
 * } | null} ResolvedEntry
 */

const rejectMutation = method => {
  throw makeError(
    X`EROFS: ${q(method)} not permitted on a read-only git-tree FsBackend`,
  );
};

/**
 * Build an `FsBackend` over an immutable git tree at `treeOid`.
 *
 * @param {object} args
 * @param {GitBackend} args.backend
 * @param {string} args.treeOid
 * @returns {FsBackend}
 */
export const makeGitFsBackend = ({ backend, treeOid }) => {
  /** @type {Map<string, Promise<readonly GitTreeEntryRecord[]>>} */
  const lsCache = new Map();
  /** @param {string} oid */
  const lsTreeCached = oid => {
    const cached = lsCache.get(oid);
    if (cached !== undefined) return cached;
    const promise = backend.lsTree(oid);
    lsCache.set(oid, promise);
    return promise;
  };

  /** @type {Map<string, Promise<ResolvedEntry>>} */
  const pathCache = new Map();

  /**
   * Walk the tree from the root to `path`, returning the
   * content-addressed entry record (kind + OID + size) or `null`
   * for ENOENT / submodule.
   *
   * @param {readonly string[]} path
   * @returns {Promise<ResolvedEntry>}
   */
  const resolvePath = path => {
    // Encode the path as a NUL-joined string so two different
    // arrays with the same segments share a cache entry.
    const key = path.join('\0');
    const cached = pathCache.get(key);
    if (cached !== undefined) return cached;
    const promise = (async () => {
      if (path.length === 0) {
        return /** @type {ResolvedEntry} */ ({
          kind: 'directory',
          oid: treeOid,
          size: 0,
        });
      }
      const parent = await resolvePath(path.slice(0, -1));
      if (parent === null || parent.kind !== 'directory') {
        return null;
      }
      const entries = await lsTreeCached(parent.oid);
      const last = path[path.length - 1];
      const entry = entries.find(e => e.name === last);
      if (entry === undefined) return null;
      if (entry.type === 'commit') {
        // Submodule pointer; surface as missing (the base endo-fs
        // contract only knows file / directory).  See the design
        // doc for the rationale.
        return null;
      }
      return /** @type {ResolvedEntry} */ ({
        kind: entry.type === 'tree' ? 'directory' : 'file',
        oid: entry.oid,
        size: entry.size ?? 0,
      });
    })();
    pathCache.set(key, promise);
    return promise;
  };

  return harden({
    /** @param {string[]} path */
    async kind(path) {
      const entry = await resolvePath(path);
      return entry === null ? undefined : entry.kind;
    },

    /** @param {string[]} dirPath */
    async *list(dirPath) {
      const entry = await resolvePath(dirPath);
      if (entry === null) {
        throw makeError(X`ENOENT: ${q(dirPath.join('/'))}`);
      }
      if (entry.kind !== 'directory') {
        throw makeError(X`ENOTDIR: ${q(dirPath.join('/'))}`);
      }
      const entries = await lsTreeCached(entry.oid);
      for (const e of entries) {
        if (e.type === 'commit') {
          // Submodules are not part of the visible tree at this layer.
          // eslint-disable-next-line no-continue
          continue;
        }
        yield /** @type {DirEntry} */ (
          harden({
            name: e.name,
            kind: e.type === 'tree' ? 'directory' : 'file',
          })
        );
      }
    },

    /**
     * @param {string[]} path
     * @param {bigint} [offset]
     * @param {bigint} [length]
     */
    async read(path, offset, length) {
      const entry = await resolvePath(path);
      if (entry === null) {
        throw makeError(X`ENOENT: ${q(path.join('/'))}`);
      }
      if (entry.kind !== 'file') {
        throw makeError(X`EISDIR: ${q(path.join('/'))}`);
      }
      const off = offset === undefined ? 0 : Number(offset);
      const len = length === undefined ? undefined : Number(length);
      if (len === 0) {
        return EMPTY_BYTES;
      }
      // Stream `cat-file blob <oid>` and only retain the
      // `[off, off + len)` window: discard whole chunks that fall
      // entirely before `off`, trim the chunk that straddles `off`,
      // and stop once we have `len` bytes (or hit EOF when len is
      // undefined).  Worst case retains one chunk's worth above the
      // requested window — a `read(path, 1_000_000_000n, 4096n)` on
      // a 1 GiB blob no longer pulls the whole prefix into memory.
      const want = len === undefined ? Infinity : len;
      /** @type {Uint8Array[]} */
      const chunks = [];
      let streamed = 0;
      let retained = 0;
      // eslint-disable-next-line no-restricted-syntax
      for await (const chunk of backend.streamBlobBytes(entry.oid)) {
        const chunkStart = streamed;
        const chunkEnd = streamed + chunk.length;
        streamed = chunkEnd;
        // Whole chunk is before the requested window.
        if (chunkEnd <= off) {
          // eslint-disable-next-line no-continue
          continue;
        }
        // Trim the chunk to the requested window.
        const sliceFrom = chunkStart < off ? off - chunkStart : 0;
        const remaining = want - retained;
        const sliceTo = Math.min(chunk.length, sliceFrom + remaining);
        const trimmed =
          sliceFrom === 0 && sliceTo === chunk.length
            ? chunk
            : chunk.subarray(sliceFrom, sliceTo);
        chunks.push(trimmed);
        retained += trimmed.length;
        if (retained >= want) break;
      }
      if (chunks.length === 0) {
        return EMPTY_BYTES;
      }
      if (chunks.length === 1) {
        return chunks[0];
      }
      const out = new Uint8Array(retained);
      let writeOff = 0;
      for (const c of chunks) {
        out.set(c, writeOff);
        writeOff += c.length;
      }
      return out;
    },

    /** @param {string[]} _path */
    write(_path) {
      return rejectMutation('write');
    },
    /** @param {string[]} _path */
    makeDirectory(_path) {
      return rejectMutation('makeDirectory');
    },
    /** @param {string[]} _path */
    remove(_path) {
      return rejectMutation('remove');
    },

    /** @param {string[]} path */
    async getStat(path) {
      const entry = await resolvePath(path);
      if (entry === null) {
        throw makeError(X`ENOENT: ${q(path.join('/'))}`);
      }
      // `size` is the only field we can answer from git: blob entries
      // carry it inline (`ls-tree --long`); tree entries report `0n`
      // (no size for directories in this layer, matching node-fs).
      // `mtime` and `atime` are deliberately omitted so wrapBackend's
      // `readStatNow` falls back to its vat-local stat table via the
      // `?? local.mtime` / `?? local.atime` merge — returning `0n`
      // there would override the fallback because the merge treats
      // any defined value as authoritative.
      return harden({
        size: BigInt(entry.size),
      });
    },

    async statfs() {
      // No "free / used" notion for an immutable historical tree.
      return harden({
        totalBytes: 0n,
        freeBytes: 0n,
      });
    },
  });
};
harden(makeGitFsBackend);
