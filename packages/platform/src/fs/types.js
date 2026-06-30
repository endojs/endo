// @ts-check

// Type-only module providing JSDoc typedefs for the platform fs
// interfaces.  Other modules in this package import these types via
// `@import` from './types.js'.

/**
 * @typedef {AsyncIterator<Uint8Array>} ReadableStream
 *   An async iterator of Uint8Array chunks.
 */

/**
 * A ReadableBlob presents an interface over a stream of bytes.
 * Exposed by platform as an Exo; directly usable locally.
 *
 * @typedef {object} ReadableBlob
 * @property {() => import('@endo/stream').Reader<Uint8Array>} makeFileReader
 * @property {() => Promise<string>} text
 * @property {() => Promise<any>} json
 * @property {() => Promise<bigint>} [size]
 *   Byte length of the blob as a bigint (the `size` half of a
 *   content-addressed `getInfo()` triple). Optional: not every ContentStore
 *   backing surfaces it yet.
 * @property {(offset: number, length: number) => Promise<Uint8Array>} [readRange]
 *   Windowed read of `[offset, offset + length)`, clamped at EOF.
 *   Optional for the same reason as `size`.
 */

/**
 * The `{ algorithm, hash, size }` content-address triple returned by
 * `getInfo()`. `hash` is base64; `algorithm` is `'sha256'`; `size` is the byte
 * length (of the blob, or of a tree's own manifest).
 *
 * @typedef {object} BlobInfo
 * @property {string} algorithm
 * @property {string} hash
 * @property {bigint} size
 */

/**
 * A SnapshotBlob is a ReadableBlob with a content-addressed identity.
 * `sha256()` returns the digest as base64 (the canonical public hash encoding);
 * the hex form is the internal content-store address. `getInfo()` is the
 * uniform identity accessor (the same shape live blobs and trees expose).
 *
 * @typedef {ReadableBlob & {
 *   sha256: () => string,
 *   getInfo: () => Promise<BlobInfo>,
 * }} SnapshotBlob
 */

/**
 * A ReadableTree presents an immutable directory-like interface.
 *
 * @typedef {object} ReadableTree
 * @property {(...petNamePath: string[]) => Promise<boolean>} has
 * @property {(...petNamePath: string[]) => Promise<string[]>} list
 * @property {(petNamePath: string | string[]) => Promise<unknown>} lookup
 */

/**
 * A SnapshotTree is a ReadableTree with a content-addressed identity.
 * `sha256()` returns the digest as base64 (the canonical public hash encoding);
 * the hex form is the internal content-store address. `getInfo()` is the
 * uniform identity accessor (its `size` is the manifest byte length).
 *
 * @typedef {ReadableTree & {
 *   sha256: () => string,
 *   getInfo: () => Promise<BlobInfo>,
 * }} SnapshotTree
 */

/**
 * A ContentStore stores and fetches blobs by sha256.
 *
 * @typedef {object} ContentStore
 * @property {(readable: AsyncIterator<Uint8Array> | AsyncIterable<Uint8Array>) => Promise<string>} store
 *   Store the contents of a readable stream and return the sha256.
 * @property {(sha256: string) => ReadableBlob} fetch
 *   Fetch a blob by its sha256. Returns a ReadableBlob.
 * @property {(sha256: string) => Promise<boolean>} has
 *   Check whether a blob with the given sha256 exists.
 * @property {(sha256: string) => Promise<void>} remove
 *   Remove a blob by its sha256. Idempotent: removing a missing
 *   blob is not an error. Callers are responsible for any
 *   reference-counting; the store does not track references.
 */

/**
 * The writer half handed to a filesystem-backed `ContentStore`'s
 * `store` loop: an `@endo/stream` `Writer<Uint8Array>`-shaped sink the
 * store streams chunks into before the atomic rename. Reproduced as a
 * narrow typedef here (rather than imported wholesale from
 * `@endo/stream`) so the filesystem-dependency contract stays self
 * describing.
 *
 * @typedef {object} ContentStoreFileWriter
 * @property {(chunk: Uint8Array) => Promise<IteratorResult<undefined, undefined>>} next
 * @property {(value?: undefined) => Promise<IteratorResult<undefined, undefined>>} return
 */

/**
 * The filesystem dependency a filesystem-backed `ContentStore` stands
 * on. This is the platform-owned contract a content store such as
 * `@endo/daemon-cas` injects to materialise blobs on disk: stream a
 * temp file, hash as the bytes land, atomically rename to the sha256
 * name, then read back by whole-value, range, or stat. Path-keyed and
 * `node:fs`-shaped, it is the small filesystem seam the CAS layer
 * couples to so that the store implementation stays host-agnostic.
 *
 * @typedef {object} ContentStoreFilePowers
 * @property {(path: string) => import('@endo/stream').Reader<Uint8Array>} makeFileReader
 *   Whole-blob byte stream — the `@endo/stream` `Reader<Uint8Array>`
 *   the `ReadableBlob.makeFileReader` surface hands back.
 * @property {(path: string) => ContentStoreFileWriter} makeFileWriter
 * @property {(path: string) => Promise<string>} readFileText
 * @property {(path: string, offset: number, length: number) => Promise<Uint8Array>} readFileRange
 *   Windowed read of `[offset, offset + length)`, clamped at EOF.
 * @property {(path: string) => Promise<void>} makePath
 * @property {(...components: string[]) => string} joinPath
 * @property {(source: string, target: string) => Promise<void>} renamePath
 * @property {(path: string) => Promise<void>} removePath
 *   Idempotent removal (missing path is not an error), matching the
 *   `ContentStore.remove` contract.
 * @property {(path: string) => Promise<{
 *   kind: 'file' | 'directory' | 'symlink',
 *   size: bigint,
 *   mtime: bigint,
 *   atime: bigint,
 * }>} statPath
 */

/**
 * The content-addressing dependency a `ContentStore` injects: a
 * sha256 digester over the inbound stream plus a random hex source for
 * the temp-file name. Platform-owned so the CAS layer stands on a
 * single shared contract rather than reproducing the daemon's crypto
 * powers.
 *
 * @typedef {object} ContentStoreCryptoPowers
 * @property {() => {
 *   update(chunk: Uint8Array): void,
 *   digestHex(): string,
 * }} makeSha256
 * @property {() => Promise<string>} randomHex256
 */

/**
 * A SnapshotStore is a ContentStore that also knows how to load
 * SnapshotBlob and SnapshotTree remotable Exos.
 *
 * @typedef {ContentStore & {
 *   loadBlob: (sha256: string) => SnapshotBlob,
 *   loadTree: (sha256: string) => SnapshotTree,
 * }} SnapshotStore
 */

/**
 * A TreeWriter materializes tree entries into a concrete location.
 *
 * @typedef {object} TreeWriter
 * @property {(pathSegments: string[], readable: AsyncIterator<Uint8Array> | AsyncIterable<Uint8Array>) => Promise<void>} writeBlob
 * @property {(pathSegments: string[]) => Promise<void>} makeDirectory
 */

/**
 * A File presents a mutable byte-content interface that also satisfies
 * the ReadableBlob read surface.  Concrete implementations supply
 * confinement and provenance (e.g. EndoMountFile constrains writes to
 * a mount root).
 *
 * @typedef {object} File
 * @property {(synPromise: unknown) => Promise<unknown>} streamBase64
 * @property {() => Promise<string>} text
 * @property {() => Promise<any>} json
 * @property {(content: string) => Promise<void>} writeText
 * @property {(readable: unknown) => Promise<void>} writeBytes
 * @property {(content: string) => Promise<void>} append
 * @property {() => ReadableBlob} readOnly
 * @property {() => Promise<SnapshotBlob>} snapshot
 */

/**
 * A Directory presents a mutable handle-first filesystem interface
 * that also satisfies the ReadableTree read surface on the query side.
 * `write` accepts a `ReadableBlob` (materialised as bytes at `path`) or
 * a `ReadableTree` (materialised recursively).  Concrete
 * implementations supply confinement and provenance.
 *
 * @typedef {object} Directory
 * @property {(...path: string[]) => Promise<boolean>} has
 * @property {(...path: string[]) => Promise<string[]>} list
 * @property {(path: string | string[]) => Promise<unknown>} lookup
 * @property {(path: string[], value: unknown) => Promise<void>} write
 * @property {(path: string[]) => Promise<void>} remove
 * @property {(from: string[], to: string[]) => Promise<void>} move
 * @property {(from: string[], to: string[]) => Promise<void>} copy
 * @property {(path: string[]) => Promise<Directory>} makeDirectory
 * @property {() => ReadableTree} readOnly
 * @property {() => Promise<SnapshotTree>} snapshot
 */

// This module has no runtime exports.
export {};
