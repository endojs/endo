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
//
// `@endo/daemon-cas` stands on `@endo/platform` for both halves of
// its model: the CAS interfaces it produces (`ContentStore`, the
// `ReadableBlob` `fetch()` returns) and the filesystem/crypto
// dependencies it injects (`ContentStoreFilePowers`,
// `ContentStoreCryptoPowers`). Those contracts live in
// `@endo/platform/fs/lite/types`; this file re-exports them so the
// package's public surface keeps naming them, and adds only the
// daemon-cas-specific factory options on top.

/**
 * Byte reader handed back by `fetch().makeFileReader`.  This is the
 * `@endo/stream` `Reader<Uint8Array>` the platform `ReadableBlob`
 * contract requires; aliased here so the rest of this declaration file
 * reads in package-local terms.
 */
export type ContentStoreReader = import('@endo/stream').Reader<Uint8Array>;

/**
 * The `ReadableBlob` read surface `fetch()` returns — re-exported from
 * `@endo/platform` so callers see the shared CAS interface.
 */
export type ContentStoreReadableBlob =
  import('@endo/platform/fs/lite/types.js').ReadableBlob;

/**
 * Writer shape consumed by `store`.  The platform-owned
 * `ContentStoreFileWriter` (structurally compatible with
 * `@endo/stream`'s `Writer<Uint8Array>`).
 */
export type ContentStoreWriter =
  import('@endo/platform/fs/lite/types.js').ContentStoreFileWriter;

/**
 * The filesystem powers the content store materialises blobs with.
 * Owned by `@endo/platform/fs/lite/types`; re-exported here so the
 * daemon-cas surface keeps naming the dependency it stands on rather
 * than reproducing a subset of the daemon's `FilePowers`.
 */
export type ContentStoreFilePowers =
  import('@endo/platform/fs/lite/types.js').ContentStoreFilePowers;

/**
 * The crypto powers the content store hashes inbound streams and mints
 * temp-file names with.  Owned by `@endo/platform/fs/lite/types`;
 * re-exported here for the same reason as `ContentStoreFilePowers`.
 */
export type ContentStoreCryptoPowers =
  import('@endo/platform/fs/lite/types.js').ContentStoreCryptoPowers;

/**
 * The injected dependencies shared by the factory: the filesystem and
 * crypto powers the content store stands on, both sourced from
 * `@endo/platform`.
 */
export interface ContentStorePowers {
  filePowers: ContentStoreFilePowers;
  cryptoPowers: ContentStoreCryptoPowers;
}

/**
 * Options for the raw `makeContentStore` factory: the injected
 * capabilities the store materialises blobs with, gathered into a
 * single `options` namespace. The storage directory is *not* part of
 * this bag — it is a required positional argument to `makeContentStore`
 * — so the mandatory path stays visibly separate from the optional
 * powers wiring.
 */
export type ContentStoreOptions = ContentStorePowers;

/**
 * Construct a raw `ContentStore` backed by a filesystem directory.
 * The required `storageDirectoryPath` is positional (the directory is
 * not optional at all); the injected `filePowers` / `cryptoPowers`
 * capabilities travel in the second `options` namespace.  The factory
 * writes to a temp file, hashes the stream as it lands, then
 * atomically renames the temp file to its sha256 name.  Returns the
 * `@endo/platform/fs/lite/types`-defined `ContentStore` interface.
 */
export function makeContentStore(
  storageDirectoryPath: string,
  options: ContentStoreOptions,
): import('@endo/platform/fs/lite/types.js').ContentStore;
