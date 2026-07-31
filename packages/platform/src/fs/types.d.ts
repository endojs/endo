// Hand-written type declarations for the platform fs interfaces.
//
// Other modules in this package and its consumers import these types
// via `@import` / `import('...')` from `./types.js`
// (`@endo/platform/fs/lite/types`); TypeScript resolves the `.js`
// specifier to this declaration file. There is no runtime counterpart:
// the module is types-only.

/** An async iterator of Uint8Array chunks. */
export type ReadableStream = AsyncIterator<Uint8Array>;

/**
 * A ReadableBlob presents an interface over a stream of bytes.
 * Exposed by platform as an Exo; directly usable locally.
 */
export interface ReadableBlob {
  streamBase64: (synPromise: unknown) => Promise<unknown>;
  text: () => Promise<string>;
  json: () => Promise<any>;
  help: (method?: string) => string;
}

/**
 * A ReadableBlob with content identity and streaming byte-range reads.
 * This matches `ReadableBlobRangeInterface`, implemented by daemon, mount,
 * Git, and platform LocalBlob Exos.
 */
export type ReadableBlobRange = ReadableBlob & {
  getInfo: () => Promise<BlobInfo>;
  fetch: (
    offset: bigint,
    length: bigint,
  ) => Promise<import('@endo/exo-stream').PassableBytesReader>;
};

/**
 * The richer LocalBlob surface, with whole-value range conveniences layered
 * on top of `ReadableBlobRange.fetch`.
 */
export type ReadableBlobRangeRead = ReadableBlobRange & {
  /**
   * Whole-value windowed read: the raw bytes of `[offset, offset + length)`,
   * clamped at EOF, as a `Uint8Array`.
   */
  rangeRead: (offset: bigint, length: bigint) => Promise<Uint8Array>;
  /**
   * Whole-value line-range read: the file decoded as UTF-8, lines
   * `[startLine, endLine)` (0-based, end-exclusive) joined with '\n'.
   */
  rangeReadText: (startLine: number, endLine: number) => Promise<string>;
};

/**
 * One entry in a recursive `listTree` walk: the path relative to the queried
 * node and whether it names a file or a directory. Size and host stat fields
 * are intentionally omitted (they leak implementation details germane to
 * security); `type` is structural.
 */
export interface TreeEntry {
  path: string[];
  type: 'file' | 'directory';
}

/**
 * The `{ algorithm, hash, size }` content-address triple returned by
 * `getInfo()`. `hash` is base64; `algorithm` is `'sha256'`; `size` is the byte
 * length (of the blob, or of a tree's own manifest).
 */
export interface BlobInfo {
  algorithm: string;
  hash: string;
  size: bigint;
}

/**
 * A SnapshotBlob is a ReadableBlob with a content-addressed identity.
 * `sha256()` returns the digest as base64 (the canonical public hash encoding);
 * the hex form is the internal content-store address. `getInfo()` is the
 * uniform identity accessor (the same shape live blobs and trees expose).
 */
export type SnapshotBlob = ReadableBlob & {
  sha256: () => string;
  getInfo: () => Promise<BlobInfo>;
};

/**
 * A ReadableTree presents an immutable directory-like interface.
 */
export interface ReadableTree {
  has: (...petNamePath: string[]) => Promise<boolean>;
  list: (...petNamePath: string[]) => Promise<readonly string[]>;
  lookup: (petNamePath: string | readonly string[]) => Promise<unknown>;
  /**
   * Recursive counterpart to `list`: every descendant under the sub-path
   * `petNamePath` (a single name, a path of segments, or `[]` for the whole
   * tree) as `{ path, type }` records, lexically sorted, parents before
   * children. `options.ignore` augments the tree's own ignore set for the
   * call. Optional: only the richer tree surfaces expose it.
   */
  listTree?: (
    petNamePath: string | readonly string[],
    options?: { ignore?: readonly string[] },
  ) => Promise<TreeEntry[]>;
}

/**
 * A remotable byte source accepted by `Directory.write()`.
 *
 * The streaming protocol only needs `streamBase64`; optional reader metadata
 * such as `readReturnPattern` is not part of the materialization contract.
 */
export type ReadableBlobSource = {
  streamBase64: (...args: any[]) => PromiseLike<unknown>;
};

/** Portable semantic payload accepted by `Directory.write()`. */
export type DirectoryWriteSource = ReadableBlobSource | ReadableTree;

/**
 * A SnapshotTree is a ReadableTree with a content-addressed identity.
 * `sha256()` returns the digest as base64 (the canonical public hash encoding);
 * the hex form is the internal content-store address. `getInfo()` is the
 * uniform identity accessor (its `size` is the manifest byte length).
 */
export type SnapshotTree = ReadableTree & {
  sha256: () => string;
  getInfo: () => Promise<BlobInfo>;
};

/**
 * The host-side blob backing returned by `ContentStore.fetch()`.
 *
 * This is a local CAS implementation seam, not a public ReadableBlob Exo.
 * `readRange` uses safe-number offsets because it backs the public bigint
 * `ReadableBlobRange.fetch()` method at the daemon boundary.
 */
export interface ContentStoreBlob {
  makeFileReader: () => import('@endo/stream').Reader<Uint8Array>;
  text: () => Promise<string>;
  json: () => Promise<any>;
  size?: () => Promise<bigint>;
  readRange?: (offset: number, length: number) => Promise<Uint8Array>;
}

/**
 * A ContentStore stores and fetches host-side CAS blob backings by sha256.
 */
export interface ContentStore {
  /** Store the contents of a readable stream and return the sha256. */
  store: (
    readable: AsyncIterator<Uint8Array> | AsyncIterable<Uint8Array>,
  ) => Promise<string>;
  /** Fetch a local backing blob by its sha256. */
  fetch: (sha256: string) => ContentStoreBlob;
  /** Check whether a blob with the given sha256 exists. */
  has: (sha256: string) => Promise<boolean>;
  /**
   * Remove a blob by its sha256. Idempotent: removing a missing
   * blob is not an error. Callers are responsible for any
   * reference-counting; the store does not track references.
   */
  remove: (sha256: string) => Promise<void>;
}

/**
 * The writer half handed to a filesystem-backed `ContentStore`'s
 * `store` loop: an `@endo/stream` `Writer<Uint8Array>`-shaped sink the
 * store streams chunks into before the atomic rename. Reproduced as a
 * narrow type here (rather than imported wholesale from `@endo/stream`)
 * so the filesystem-dependency contract stays self describing.
 */
export interface ContentStoreFileWriter {
  next: (chunk: Uint8Array) => Promise<IteratorResult<undefined, undefined>>;
  return: (value?: undefined) => Promise<IteratorResult<undefined, undefined>>;
}

/**
 * The filesystem dependency a filesystem-backed `ContentStore` stands
 * on. This is the platform-owned contract a content store such as
 * `@endo/daemon-cas` injects to materialise blobs on disk: stream a
 * temp file, hash as the bytes land, atomically rename to the sha256
 * name, then read back by whole-value, range, or stat. Path-keyed and
 * `node:fs`-shaped, it is the small filesystem seam the CAS layer
 * couples to so that the store implementation stays host-agnostic.
 */
export interface ContentStoreFilePowers {
  /**
   * Whole-blob byte stream — the `@endo/stream` `Reader<Uint8Array>`
   * the `ContentStoreBlob.makeFileReader` surface hands back.
   */
  makeFileReader: (path: string) => import('@endo/stream').Reader<Uint8Array>;
  makeFileWriter: (path: string) => ContentStoreFileWriter;
  readFileText: (path: string) => Promise<string>;
  /** Windowed read of `[offset, offset + length)`, clamped at EOF. */
  readFileRange: (
    path: string,
    offset: number,
    length: number,
  ) => Promise<Uint8Array>;
  makePath: (path: string) => Promise<void>;
  joinPath: (...components: string[]) => string;
  renamePath: (source: string, target: string) => Promise<void>;
  /**
   * Idempotent removal (missing path is not an error), matching the
   * `ContentStore.remove` contract.
   */
  removePath: (path: string) => Promise<void>;
  statPath: (path: string) => Promise<{
    kind: 'file' | 'directory' | 'symlink';
    size: bigint;
    mtime: bigint;
    atime: bigint;
  }>;
}

/**
 * The content-addressing dependency a `ContentStore` injects: a
 * sha256 digester over the inbound stream plus a random hex source for
 * the temp-file name. Platform-owned so the CAS layer stands on a
 * single shared contract rather than reproducing the daemon's crypto
 * powers.
 */
export interface ContentStoreCryptoPowers {
  makeSha256: () => {
    update(chunk: Uint8Array): void;
    digestHex(): string;
  };
  randomHex256: () => Promise<string>;
}

/**
 * A SnapshotStore is a ContentStore that also knows how to load
 * SnapshotBlob and SnapshotTree remotable Exos.
 */
export type SnapshotStore = ContentStore & {
  loadBlob: (sha256: string) => SnapshotBlob;
  loadTree: (sha256: string) => SnapshotTree;
};

/**
 * A TreeWriter materializes tree entries into a concrete location.
 */
export interface TreeWriter {
  writeBlob: (
    pathSegments: string[],
    readable: AsyncIterator<Uint8Array> | AsyncIterable<Uint8Array>,
  ) => Promise<void>;
  makeDirectory: (pathSegments: string[]) => Promise<void>;
}

/**
 * A File presents a mutable byte-content interface that also satisfies
 * the ReadableBlob read surface.  Concrete implementations supply
 * confinement and provenance (e.g. EndoMountFile constrains writes to
 * a mount root).
 */
export interface File {
  streamBase64: (synPromise: unknown) => Promise<unknown>;
  text: () => Promise<string>;
  json: () => Promise<any>;
  writeText: (content: string) => Promise<void>;
  writeBytes: (readable: unknown) => Promise<void>;
  append: (content: string) => Promise<void>;
  readOnly: () => ReadableBlob;
  snapshot: () => Promise<SnapshotBlob>;
}

/**
 * A Directory presents a mutable handle-first filesystem interface
 * that also satisfies the ReadableTree read surface on the query side.
 * `write` accepts a `ReadableBlob` (materialised as bytes at `path`) or
 * a `ReadableTree` (materialised recursively).  Concrete
 * implementations supply confinement and provenance.
 */
export interface Directory {
  has: (...path: string[]) => Promise<boolean>;
  list: (...path: string[]) => Promise<string[]>;
  lookup: (path: string | string[]) => Promise<unknown>;
  write: (path: string[], value: DirectoryWriteSource) => Promise<void>;
  remove: (path: string[]) => Promise<void>;
  move: (from: string[], to: string[]) => Promise<void>;
  copy: (from: string[], to: string[]) => Promise<void>;
  makeDirectory: (path: string[]) => Promise<Directory>;
  readOnly: () => ReadableTree;
  snapshot: () => Promise<SnapshotTree>;
}

/**
 * A PathEntry is an inert, authority-bearing path selector minted by a
 * filesystem authority such as a mount.
 * The entry carries no read/write
 * authority on its own; callers pass it back to the authority that minted it.
 */
export interface PathEntry {
  segments: () => string[];
  displayPath: () => string;
  child: (name: string) => PathEntry;
  help: (method?: string) => string;
}

/**
 * Authority that mints inert, lineage-bearing path selectors.
 *
 * The issuer is deliberately separate from `Directory`: a capability may
 * need to mint selectors for another operation without exposing a general
 * directory surface.
 */
export interface PathEntryIssuer {
  entry: (path: string | string[]) => PathEntry;
}
