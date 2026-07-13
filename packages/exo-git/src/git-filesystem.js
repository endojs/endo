// @ts-check
/// <reference types="ses"/>

/**
 * `FsBackend` adapter for an immutable git tree.
 *
 * `wrapBackend(makeGitFsBackend({ backend, treeOid }))` produces a
 * full `@endo/platform/fs/extended` `Filesystem` lazily backed by the git object
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
 * The backend also implements the optional content-address hooks
 * `qidFor` / `blobInfoFor` (see designs/endo-fs-from-git.md Goal 2):
 * wrap-backend probes for them and, when present, sources the QID
 * `pathId` from the git object OID and the `BlobRef` hash from the
 * `git-sha1` blob OID, so same-blob identity survives across paths and
 * refs instead of degrading to the path-hash / SHA-256 defaults.
 *
 * See `designs/endo-fs-from-git.md` for the contract.
 */

import { makeError, X, q } from '@endo/errors';

/**
 * @import { GitBackend, GitTreeEntryRecord } from './git.js'
 * @import { FsBackend, DirEntry, NodeKind } from '@endo/platform/fs/extended/backend-types.js'
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
 * Coerce a bigint or number to a non-negative safe-integer Number.
 * The `FsBackend.read` contract types `offset`/`length` as bigint
 * (the protocol must survive 64-bit file sizes), but Uint8Array
 * indexing is Number-based.  This boundary check rejects values
 * that would silently lose precision (`> Number.MAX_SAFE_INTEGER`)
 * or flow as wrong-direction window math (negatives).
 *
 * @param {bigint | number} value
 * @param {string} name
 * @returns {number}
 */
const toSafeIndex = (value, name) => {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw makeError(X`EINVAL: ${q(name)} must be non-negative`);
    }
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw makeError(X`EINVAL: ${q(name)} exceeds Number.MAX_SAFE_INTEGER`);
    }
    return Number(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw makeError(
        X`EINVAL: ${q(name)} must be a non-negative safe integer`,
      );
    }
    return value;
  }
  throw makeError(X`EINVAL: ${q(name)} must be bigint or number`);
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
    // Evict on rejection so a transient git failure (timeout, etc.)
    // doesn't poison the cache for the lifetime of the backend.
    // The successful resolution path is the cache contract.
    promise.catch(() => lsCache.delete(oid));
    return promise;
  };

  /** @type {Map<string, Promise<ResolvedEntry>>} */
  const pathCache = new Map();

  // Synchronous mirror of `pathCache`, holding only the *resolved,
  // non-null* entries.  `qidFor`/`blobInfoFor` (below) need the git
  // OID for a path *synchronously* — `Node.getQid()` is a sync getter
  // in the `@endo/platform` wrap-backend contract — but `resolvePath`
  // is async.  Every path whose exo wrap-backend hands out has already
  // been walked (`lookup`/`list` await `backend.kind` first), so its
  // OID is available here by the time `getQid`/`snapshot` runs.  The
  // root (`[]`) is seeded eagerly because `Filesystem.root()` mints the
  // root Directory exo without a resolve.  A miss (a path minted by
  // some future non-resolving route) returns `undefined`, and
  // wrap-backend falls back to its path-hash `synthQid` — content
  // identity degrades to path identity rather than throwing.
  /** @type {Map<string, NonNullable<ResolvedEntry>>} */
  const resolvedSync = new Map();
  resolvedSync.set(
    '',
    /** @type {NonNullable<ResolvedEntry>} */ ({
      kind: 'directory',
      oid: treeOid,
      size: 0,
    }),
  );

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
    // Populate the synchronous mirror as soon as the walk resolves
    // (registered here, before any `await resolvePath(...)` caller
    // attaches its own continuation, so the mirror is warm by the time
    // the awaiting `kind`/`read` continuation mints or reads the exo).
    // Same rejection-eviction rule as `lsTreeCached`: a transient
    // failure mid-walk must not pin a poisoned promise.
    promise.then(
      entry => {
        if (entry !== null) resolvedSync.set(key, entry);
      },
      () => pathCache.delete(key),
    );
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
      // Materializes the full `lsTree` array before yielding the
      // first entry: bounded by tree size (not by `runGitRaw`'s
      // 1 MiB cap, since `listTreeEntries` streams), but not by
      // a page count.  True paged streaming through wrap-backend's
      // `Cursor.read(limit)` is Phase 6 in `designs/endo-fs-from-git.md`.
      const entries = await lsTreeCached(entry.oid);
      for (const e of entries) {
        if (e.type === 'commit') {
          // Submodules are not part of the visible tree at this layer.
          // eslint-disable-next-line no-continue
          continue;
        }
        const childKind = e.type === 'tree' ? 'directory' : 'file';
        // Warm the synchronous OID mirror for each listed child before
        // yielding it, so wrap-backend's `Cursor` can stamp the same
        // content-addressed `qid` on the listing entry (via `qidFor`)
        // that a later `lookup(name).getQid()` would return — otherwise
        // the listing would carry a path-hash qid while the walked cap
        // carried the OID qid, and a 9p `Treaddir`→`Twalk` would see two
        // different identities for one node.
        resolvedSync.set(
          [...dirPath, e.name].join('\0'),
          /** @type {NonNullable<ResolvedEntry>} */ ({
            kind: childKind,
            oid: e.oid,
            size: e.size ?? 0,
          }),
        );
        yield /** @type {DirEntry} */ (
          harden({
            name: e.name,
            kind: childKind,
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
      // Validate before coercion: the contract types are bigint, and
      // values above MAX_SAFE_INTEGER (or negatives) must not flow
      // into Number-shaped window math silently.
      const off = offset === undefined ? 0 : toSafeIndex(offset, 'offset');
      const len =
        length === undefined ? undefined : toSafeIndex(length, 'length');
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

    // Content-address hooks (see designs/endo-fs-from-git.md Goal 2).
    //
    // Optional `FsBackend` methods that wrap-backend probes for by
    // existence.  They restore git's content-addressed identity to the
    // `Filesystem` view: the QID `pathId` becomes the git object OID,
    // and the `BlobRef` hash becomes the `git-sha1` blob OID.  Two paths
    // (or two refs) that resolve to the same blob therefore report the
    // same QID and the same `BlobRef` hash — the deduplication and
    // cross-ref identity the shared `synthQid` (path hash) / SHA-256
    // fallbacks cannot give.  Both read the synchronous `resolvedSync`
    // mirror; a miss returns `undefined` and wrap-backend falls back to
    // its default synthesis.

    /**
     * Synthesize a content-addressed `Qid` for `path`: `pathId` is the
     * git object OID (tree OID for a directory, blob OID for a file) as
     * a BigInt.  `version` is `0n` — git objects are immutable, so a
     * given OID never changes meaning.
     *
     * The full OID is a 160-bit (`git-sha1`) / 256-bit (`git-sha256`)
     * value, wider than 9p's uint64 `qid.path`.  The exo/CapTP layer
     * observes the full-width identity; the 9p seam
     * (`@endo/9p-server`) folds it to the low 64 bits.  Equal OID →
     * equal folded value, so listing/walk dedup survives, but at the
     * wire cross-blob distinctness is 64-bit, on par with `synthQid`.
     *
     * A missing mirror entry returns `undefined` (→ `synthQid`
     * fallback); a present-but-malformed OID likewise degrades rather
     * than throwing `BigInt` synchronously into the sync `getQid`
     * getter, honoring the never-throw contract the fallback documents.
     *
     * @param {string[]} path
     * @param {NodeKind} kind
     */
    qidFor(path, kind) {
      const entry = resolvedSync.get(path.join('\0'));
      if (entry === undefined) return undefined;
      let pathId;
      try {
        pathId = BigInt(`0x${entry.oid}`);
      } catch {
        return undefined;
      }
      return harden({
        type: kind,
        pathId,
        version: 0n,
      });
    },

    /**
     * Report the git-native content hash for a blob path: the
     * `git-sha1` OID itself (git hashes the framed payload
     * `blob <size>\0<bytes>`, so this is NOT the SHA-256 of the raw
     * bytes — a consumer comparing hashes across sources must
     * distinguish `git-sha1` from `sha256`).  Returns `undefined` for a
     * non-file path (or a cold cache), so wrap-backend falls back to its
     * SHA-256-over-captured-bytes `BlobRef`.
     *
     * @param {string[]} path
     */
    blobInfoFor(path) {
      const entry = resolvedSync.get(path.join('\0'));
      if (entry === undefined || entry.kind !== 'file') return undefined;
      return harden({ algorithm: 'git-sha1', hash: entry.oid });
    },
  });
};
harden(makeGitFsBackend);
