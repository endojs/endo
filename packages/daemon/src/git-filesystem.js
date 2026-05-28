// @ts-check
/// <reference types="ses"/>

/**
 * `@endo/endo-fs` Filesystem adapter over an immutable git tree.
 *
 * `Git.filesystemAt(ref)` resolves the ref to a canonical tree OID and
 * passes it here.  The resulting exo graph satisfies the `Filesystem` →
 * `Directory` → `File` → `OpenFile` contract from `@endo/endo-fs`, with
 * a few git-specific affordances:
 *
 * - QID `pathId` is the git OID (tree or blob) as a BigInt, so two paths
 *   to the same content report the same QID — the strongest stability
 *   the protocol allows.
 * - `BlobRef.getInfo()` reports `algorithm: 'git-sha1'` and `hash:
 *   blobOid`, surfacing the content-address that the underlying git
 *   object store already maintains.  A CAS-backed read cache
 *   (`withCachedReads`) can dedupe against the OID directly.
 * - The Filesystem is natively read-only.  Mutating verbs throw
 *   `EACCES` without going through `readOnly()` — there is no underlying
 *   writable cap to attenuate.
 *
 * Tree-entry listings are cached per tree OID for the lifetime of the
 * Filesystem (trees are immutable).  Blob bytes are not cached at this
 * layer; callers that want caching compose `withCachedReads(gitFs,
 * cas)` in endo-fs.
 *
 * See `designs/endo-fs-from-git.md` for the contract.
 */

import { makeExo } from '@endo/exo';
import { makeError, X, q } from '@endo/errors';
import {
  BlobRefInterface,
  CursorInterface,
  DirectoryInterface,
  FileInterface,
  FilesystemInterface,
  NodeWatcherInterface,
  OpenFileInterface,
  XattrsInterface,
} from '@endo/endo-fs/src/type-guards.js';
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';

/**
 * @import { GitBackend, GitTreeEntryRecord } from './git.js'
 */

const EMPTY_BYTES = harden(new Uint8Array(0));

// Process-unique brand counter.  Brands survive CapTP marshalling
// (BigInt is passable) so the same primitive Filesystem reports the
// same brand on either side of a CapTP boundary.
let nextBrand = 0n;
const mintBrand = () => {
  nextBrand += 1n;
  return nextBrand;
};

const denied = method =>
  makeError(
    X`EACCES: ${q(method)} not permitted on a read-only git-tree Filesystem`,
  );

/**
 * Reject names that would either alias a tree traversal or carry path
 * separators.  Mirrors the endo-fs helper without an inter-package
 * import for one ten-line check.
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
 * Convert a bigint or number to a safe non-negative Number for use as a
 * `Uint8Array` index or slice bound.
 *
 * @param {bigint | number} value
 * @param {string} name
 */
const toSafeNumber = (value, name) => {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw makeError(X`EINVAL: ${q(name)} must be non-negative`);
    }
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw makeError(X`EINVAL: ${q(name)} exceeds safe integer range`);
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
 * Convert a hex git OID into a BigInt suitable for `qid.pathId`.
 *
 * @param {string} oid
 */
const oidToBigInt = oid => BigInt(`0x${oid}`);

/**
 * Wrap a `Uint8Array` as a `PassableBytesReader` yielding the bytes in
 * one chunk.
 *
 * @param {Uint8Array} bytes
 */
const bytesReaderFromBytes = bytes => {
  const generator = async function* () {
    if (bytes.length > 0) {
      yield bytes;
    }
  };
  return bytesReaderFromIterator(generator());
};

const ZERO_ATTRS = harden({
  size: 0n,
  mtime: 0n,
  atime: 0n,
  ctime: 0n,
  btime: null,
});

/**
 * Build an `Attrs` record for a blob.  `mtime` / `atime` / `ctime` are
 * zero because git trees do not record per-entry timestamps.
 *
 * @param {number} sizeBytes
 */
const blobAttrs = sizeBytes =>
  harden({
    size: BigInt(sizeBytes),
    mtime: 0n,
    atime: 0n,
    ctime: 0n,
    btime: null,
  });

/**
 * Watcher stub — historical git trees never change.
 */
const makeEmptyWatcher = () =>
  makeExo('NodeWatcher', NodeWatcherInterface, {
    async events() {
      const empty = async function* () {
        // never yields
      };
      return readerFromIterator(empty());
    },
    async cancel() {
      // no-op
    },
  });

/**
 * Xattrs stub — git does not carry xattrs.  Reads return empty / not-
 * found; writes throw EACCES.
 */
const makeReadOnlyXattrs = () =>
  makeExo('Xattrs', XattrsInterface, {
    async get(_name) {
      throw makeError(X`ENODATA: xattrs not supported on git-tree Filesystem`);
    },
    async set(_name, _opts) {
      throw denied('xattrs.set');
    },
    async list() {
      const empty = async function* () {
        // no xattrs
      };
      return readerFromIterator(empty());
    },
    async remove(_name) {
      throw denied('xattrs.remove');
    },
    help(method) {
      if (method === undefined) {
        return 'Xattrs (git-tree): no xattrs exposed.';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });

/**
 * Mint a `BlobRef` for a git blob.  The hash IS the git OID (hex),
 * exposed with `algorithm: 'git-sha1'` so a downstream consumer
 * comparing hashes across sources knows the hash is over git's framed
 * payload (`blob <size>\0<bytes>`), not the raw bytes.
 *
 * Sha256-formatted repositories will report `'git-sha256'` when that
 * support lands (Phase 5 of the design doc).
 *
 * @param {object} args
 * @param {GitBackend} args.backend
 * @param {string} args.blobOid
 * @param {number} args.sizeBytes
 */
const makeGitBlobRef = ({ backend, blobOid, sizeBytes }) => {
  const info = harden({
    algorithm: 'git-sha1',
    hash: blobOid,
    size: BigInt(sizeBytes),
  });
  return makeExo('BlobRef', BlobRefInterface, {
    getInfo() {
      return info;
    },
    async fetch(offset, length) {
      const off = toSafeNumber(offset, 'offset');
      const len = toSafeNumber(length, 'length');
      const bytes = await backend.readBlobBytes(blobOid);
      if (off >= bytes.length) {
        return bytesReaderFromBytes(EMPTY_BYTES);
      }
      const end = len === 0 ? bytes.length : Math.min(off + len, bytes.length);
      const slice = bytes.slice(off, end);
      return bytesReaderFromBytes(slice);
    },
    help(method) {
      if (method === undefined) {
        return 'BlobRef (git-tree): hash is the git blob OID; algorithm is git-sha1.';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(makeGitBlobRef);

/**
 * Build a read-only `OpenFile` over a git blob.  The first read
 * triggers a single `cat-file blob <oid>` and caches the bytes for the
 * OpenFile's lifetime; subsequent reads slice the cached buffer.
 *
 * @param {object} args
 * @param {GitBackend} args.backend
 * @param {string} args.blobOid
 * @param {{ read: boolean, write: boolean }} args.mode
 */
const makeGitOpenFile = ({ backend, blobOid, mode }) => {
  let closed = false;
  /** @type {Uint8Array | undefined} */
  let cached;

  const requireOpen = () => {
    if (closed) {
      throw makeError(X`EBADF: OpenFile closed`);
    }
  };

  const ensureBytes = async () => {
    if (cached === undefined) {
      cached = await backend.readBlobBytes(blobOid);
    }
    return cached;
  };

  return makeExo('OpenFile', OpenFileInterface, {
    async read(offset, length) {
      requireOpen();
      if (!mode.read) {
        throw makeError(X`EBADF: OpenFile not opened for reading`);
      }
      const off = toSafeNumber(offset, 'offset');
      const len = toSafeNumber(length, 'length');
      const bytes = await ensureBytes();
      if (off >= bytes.length) {
        return bytesReaderFromBytes(EMPTY_BYTES);
      }
      const end = len === 0 ? bytes.length : Math.min(off + len, bytes.length);
      return bytesReaderFromBytes(bytes.slice(off, end));
    },
    async write(_offset) {
      throw denied('write');
    },
    async truncate(_length) {
      throw denied('truncate');
    },
    async fsync(_opts) {
      throw denied('fsync');
    },
    async lock(_opts) {
      throw denied('lock');
    },
    async getLock(_opts) {
      return null;
    },
    async close() {
      closed = true;
    },
    help(method) {
      if (method === undefined) {
        return 'OpenFile (git-tree): read-only; backed by a cached blob fetch.';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(makeGitOpenFile);

/**
 * Build a `Cursor` over a snapshotted `lsTree` result.  The entry list
 * is captured at cursor-construction time; for a git tree this is
 * equivalent to a live cursor because the tree is immutable.
 *
 * @param {object} args
 * @param {readonly GitTreeEntryRecord[]} args.entries
 */
const makeGitCursor = ({ entries }) => {
  let position = 0n;
  return makeExo('Cursor', CursorInterface, {
    async stream() {
      const start = Number(position);
      const captured = entries;
      const generator = async function* () {
        for (let i = start; i < captured.length; i += 1) {
          const entry = captured[i];
          position += 1n;
          const kind =
            entry.type === 'tree'
              ? 'directory'
              : entry.type === 'commit'
                ? 'submodule'
                : 'file';
          yield harden({
            name: entry.name,
            qid: harden({
              type: kind,
              pathId: oidToBigInt(entry.oid),
              version: 0n,
            }),
          });
        }
      };
      return readerFromIterator(generator());
    },
    async skip(n) {
      if (typeof n !== 'bigint' || n < 0n) {
        throw makeError(X`EINVAL: skip(${q(n)}) must be a non-negative bigint`);
      }
      const max = BigInt(entries.length);
      position = position + n > max ? max : position + n;
    },
    async rewind() {
      position = 0n;
    },
    help(method) {
      if (method === undefined) {
        return 'Cursor (git-tree): immutable snapshot of git ls-tree output.';
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(makeGitCursor);

/**
 * Construct the full Filesystem / Directory / File exo graph rooted at
 * a tree OID.  All mutating verbs throw `EACCES`.
 *
 * @param {object} args
 * @param {GitBackend} args.backend
 * @param {string} args.treeOid
 * @param {string} [args.commitOid]
 */
export const makeGitFilesystem = ({ backend, treeOid, commitOid }) => {
  // Per-tree-OID lsTree memoization.  Trees are immutable, so caching
  // is correct for the Filesystem's lifetime.  Caching at this layer
  // is purely a latency optimization: re-walking the same subtree
  // (e.g. multiple sibling lookups) avoids repeated subprocess turns.
  /** @type {Map<string, Promise<readonly GitTreeEntryRecord[]>>} */
  const lsCache = new Map();

  /** @param {string} oid */
  const lsTreeCached = oid => {
    const cached = lsCache.get(oid);
    if (cached !== undefined) {
      return cached;
    }
    const promise = backend.lsTree(oid);
    lsCache.set(oid, promise);
    return promise;
  };

  const brand = mintBrand();
  const brands = harden([brand]);

  // Forward declarations for the mutually-recursive exo builders.
  /** @type {(oid: string) => object} */
  // eslint-disable-next-line no-use-before-define
  const makeDirectory = oid => makeDirectoryImpl(oid);
  /** @type {(entry: GitTreeEntryRecord) => object} */
  // eslint-disable-next-line no-use-before-define
  const makeFile = entry => makeFileImpl(entry);

  /**
   * @param {GitTreeEntryRecord} entry
   */
  const makeFileImpl = entry => {
    const qid = harden({
      type: 'file',
      pathId: oidToBigInt(entry.oid),
      version: 0n,
    });
    const size = entry.size ?? 0;
    return makeExo('File', FileInterface, {
      getQid() {
        return qid;
      },
      async getAttrs() {
        return blobAttrs(size);
      },
      async setAttrs(_updates) {
        throw denied('setAttrs');
      },
      async watch() {
        return makeEmptyWatcher();
      },
      async xattrs() {
        return makeReadOnlyXattrs();
      },
      async open(opts) {
        // `opts` is `Passable` per the FileInterface guard; cast
        // through `any` at the boundary to reach the OpenOpts shape
        // (write/append/truncate/read).  The same pattern is used in
        // `endo-fs/src/from-mount.js`.
        const o = /** @type {any} */ (opts) || {};
        const write = !!o.write || !!o.append || !!o.truncate;
        if (write) {
          throw denied('open(write|append|truncate)');
        }
        // Default to read=true when neither is explicitly set; mirrors
        // the endo-fs convention.
        const read = o.read !== false;
        if (!read) {
          throw makeError(
            X`EINVAL: open requires at least one of read or write to be true`,
          );
        }
        return makeGitOpenFile({
          backend,
          blobOid: entry.oid,
          mode: { read: true, write: false },
        });
      },
      async snapshot() {
        return makeGitBlobRef({
          backend,
          blobOid: entry.oid,
          sizeBytes: size,
        });
      },
      help(method) {
        if (method === undefined) {
          return `File (git-tree): blob ${entry.oid}.`;
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  /**
   * @param {string} dirTreeOid
   */
  const makeDirectoryImpl = dirTreeOid => {
    const qid = harden({
      type: 'directory',
      pathId: oidToBigInt(dirTreeOid),
      version: 0n,
    });
    return makeExo('Directory', DirectoryInterface, {
      getQid() {
        return qid;
      },
      async getAttrs() {
        return ZERO_ATTRS;
      },
      async setAttrs(_updates) {
        throw denied('setAttrs');
      },
      async watch() {
        return makeEmptyWatcher();
      },
      async xattrs() {
        return makeReadOnlyXattrs();
      },
      async lookup(name) {
        assertChildName(name);
        const entries = await lsTreeCached(dirTreeOid);
        const entry = entries.find(e => e.name === name);
        if (entry === undefined) {
          throw makeError(X`ENOENT: ${q(name)}`);
        }
        if (entry.type === 'tree') {
          return makeDirectory(entry.oid);
        }
        if (entry.type === 'blob') {
          return makeFile(entry);
        }
        // Submodule: a 'commit' entry is a pointer into another
        // repository's object DB.  We do not transitively traverse;
        // callers obtain a separate Git capability for the submodule.
        throw makeError(
          X`EIO: lookup of submodule ${q(
            name,
          )} is not supported; obtain a separate Git capability for the submodule`,
        );
      },
      async list() {
        const entries = await lsTreeCached(dirTreeOid);
        return makeGitCursor({ entries });
      },
      async create(_name, _opts) {
        throw denied('create');
      },
      async mkdir(_name, _opts) {
        throw denied('mkdir');
      },
      async unlink(_name) {
        throw denied('unlink');
      },
      async rename(_oldName, _newParent, _newName) {
        throw denied('rename');
      },
      async fsync() {
        throw denied('fsync');
      },
      async materialise(_path, _opts) {
        throw denied('materialise');
      },
      async watchFrom() {
        const entries = await lsTreeCached(dirTreeOid);
        return harden({
          cursor: makeGitCursor({ entries }),
          watcher: makeEmptyWatcher(),
        });
      },
      help(method) {
        if (method === undefined) {
          return `Directory (git-tree): tree ${dirTreeOid}.`;
        }
        return `No documentation for method ${q(method)}.`;
      },
    });
  };

  const helpText =
    commitOid !== undefined
      ? `Filesystem (git-tree): commit ${commitOid}, tree ${treeOid}.`
      : `Filesystem (git-tree): tree ${treeOid}.`;

  return makeExo('Filesystem', FilesystemInterface, {
    async root() {
      return makeDirectory(treeOid);
    },
    async named(viewName) {
      throw makeError(
        X`ENOTSUP: git-tree Filesystem has a single root, not ${q(viewName)}`,
      );
    },
    async statfs() {
      // Git trees have no concept of free / total bytes; report zeros
      // to match the from-mount.js convention.
      return harden({
        totalBytes: 0n,
        freeBytes: 0n,
        availableBytes: 0n,
      });
    },
    async brands() {
      return brands;
    },
    help(method) {
      if (method === undefined) {
        return helpText;
      }
      return `No documentation for method ${q(method)}.`;
    },
  });
};
harden(makeGitFilesystem);
