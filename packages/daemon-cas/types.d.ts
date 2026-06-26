// Public types for the @endo/daemon-cas package.
//
// The package is an intermediate seam carved out of the daemon's
// `daemon-persistence-powers.js` so that the daemon-side CAS
// implementation can later be swapped for the Rust supervisor's
// `cas-*` envelope verbs without disturbing the daemon's call site.
// See `designs/daemon-cas-management.md` Phase 5 for the
// destination architecture and `designs/daemon-content-store-gc.md`
// for the four-method contract (`store`/`fetch`/`has`/`remove`)
// the daemon's formula GC depends on.

/**
 * Byte reader handed back by `fetch().makeFileReader`.  This is the
 * `@endo/stream` `Reader<Uint8Array>` the platform `ReadableBlob`
 * contract requires; aliased here so the rest of this declaration file
 * reads in package-local terms.
 */
export type ContentStoreReader = import('@endo/stream').Reader<Uint8Array>;

/**
 * Writer shape consumed by `store`.  Structurally compatible with
 * `@endo/stream`'s `Writer<Uint8Array>`.
 */
export interface ContentStoreWriter {
  next(chunk: Uint8Array): Promise<IteratorResult<undefined, undefined>>;
  return(value?: undefined): Promise<IteratorResult<undefined, undefined>>;
}

/**
 * The filesystem powers the content store uses to materialise blobs
 * on disk.  Structurally a subset of the daemon's `FilePowers`; the
 * declaration is reproduced here so the daemon-cas package does not
 * depend on the daemon for its types.
 */
export interface ContentStoreFilePowers {
  makeFileReader(path: string): ContentStoreReader;
  makeFileWriter(path: string): ContentStoreWriter;
  readFileText(path: string): Promise<string>;
  readFileRange(
    path: string,
    offset: number,
    length: number,
  ): Promise<Uint8Array>;
  makePath(path: string): Promise<void>;
  joinPath(...components: string[]): string;
  renamePath(source: string, target: string): Promise<void>;
  removePath(path: string): Promise<void>;
  statPath(path: string): Promise<{
    kind: 'file' | 'directory' | 'symlink';
    size: bigint;
    mtime: bigint;
    atime: bigint;
  }>;
}

/**
 * The crypto powers the content store uses to hash inbound streams
 * and to mint randomly-named temporary files.  Structurally a subset
 * of the daemon's `CryptoPowers`.
 */
export interface ContentStoreCryptoPowers {
  makeSha256(): {
    update(chunk: Uint8Array): void;
    digestHex(): string;
  };
  randomHex256(): Promise<string>;
}

/**
 * Options shared by both factory shapes.
 */
export interface ContentStorePowers {
  filePowers: ContentStoreFilePowers;
  cryptoPowers: ContentStoreCryptoPowers;
}

/**
 * Options for the raw `makeContentStore` factory.  Caller picks the
 * directory; the factory does not assume any layout relative to a
 * daemon state path.
 */
export interface ContentStoreOptions extends ContentStorePowers {
  /** Absolute directory the CAS materialises into. */
  storageDirectoryPath: string;
}

/**
 * Construct a raw `ContentStore` backed by a filesystem directory.
 * The factory writes to a temp file, hashes the stream as it lands,
 * then atomically renames the temp file to its sha256 name.  Returns
 * the `@endo/platform/fs/lite/types`-defined `ContentStore` interface.
 */
export function makeContentStore(
  options: ContentStoreOptions,
): import('@endo/platform/fs/lite/types').ContentStore;
