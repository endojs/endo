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
      const bytes = await backend.readBlobBytes(entry.oid);
      const off = offset === undefined ? 0 : Number(offset);
      if (length === undefined) {
        return bytes.slice(off);
      }
      const end = off + Number(length);
      return bytes.slice(off, end);
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
      // Git trees do not record per-entry timestamps; omit `mtime`
      // and `atime` so wrapBackend's `readStatNow` falls back to its
      // vat-local stat table (which synthesizes consistent times via
      // the `?? local.mtime` / `?? local.atime` merge).  Returning
      // `0n` would override that fallback because the merge treats
      // any defined value — including zero — as authoritative.
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
