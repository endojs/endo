# @endo/daemon-cas

Filesystem-backed content-addressed store (CAS) for the Endo daemon.

This package is an intermediate seam carved out of
`packages/daemon/src/daemon-persistence-powers.js` so the daemon's CAS
implementation can later be swapped for the Rust supervisor's `cas-*`
envelope verbs without touching the daemon's call sites.
See [`designs/daemon-cas-management.md`](../../designs/daemon-cas-management.md)
for the destination architecture (Phase 5 replaces this package's
implementation with a thin shim over the Rust CAS).

## What this package provides

- `makeContentStore(storageDirectoryPath, { filePowers, cryptoPowers })`
  builds a raw `ContentStore` (the `store`/`fetch`/`has`/`remove`
  surface defined in `@endo/platform/fs/lite/types`) over a chosen
  filesystem directory.
  The required `storageDirectoryPath` is a positional first argument —
  the directory is not optional — kept separate from the injected
  `filePowers` / `cryptoPowers` capabilities, which travel together in
  the second `options` namespace.
  The caller picks the directory; the factory does not assume any
  daemon layout.
  This generic factory is the package's only export.

## Standing on `@endo/platform`

`@endo/daemon-cas` stands on `@endo/platform` for both halves of its
model, so the package adds an implementation rather than a parallel set
of contracts:

- **The CAS interfaces it produces.** The `store`/`fetch`/`has`/`remove`
  surface and the `ReadableBlob` that `fetch()` returns are the
  `ContentStore` and `ReadableBlob` typedefs in
  [`@endo/platform/fs/lite/types`](../platform/src/fs/types.d.ts). A raw
  store from this package feeds `makeSnapshotStore` from
  `@endo/platform/fs/lite` unchanged.
- **The injected dependencies it consumes.** The `filePowers` and
  `cryptoPowers` it materialises blobs with are the platform-owned
  `ContentStoreFilePowers` and `ContentStoreCryptoPowers` contracts,
  also defined in `@endo/platform/fs/lite/types`. The package no longer
  reproduces a subset of the daemon's `FilePowers`; it names the
  platform contract directly, which keeps the filesystem seam the CAS
  layer couples to in one place.

## What this package does **not** provide

- The daemon-specific path opinion and `SnapshotStore` wrap.
  `@endo/daemon`'s `daemon-persistence-powers.js` owns the
  `${statePath}/store-sha256/` directory layout, calls
  `makeContentStore`, and wraps the result in `makeSnapshotStore` from
  `@endo/platform/fs/lite`.
  Those configuration opinions are daemon concerns, not CAS concerns,
  so they stay at the daemon call site.
- The `SnapshotStore` wrapper itself.
  That lives in `@endo/platform/fs/lite` because it is generic
  (any `ContentStore` can be wrapped) and several non-daemon
  consumers already depend on it from the platform package.
- Reference counting or garbage collection.
  The `remove` method is idempotent and content-blind; the daemon's
  formula GC pass (see
  [`designs/daemon-content-store-gc.md`](../../designs/daemon-content-store-gc.md))
  computes the sweep set and calls `remove(hash)` for each
  orphaned blob.
- A Rust-backed implementation.
  The Phase 5 swap is tracked in
  [`designs/daemon-cas-management.md`](../../designs/daemon-cas-management.md)
  § Phase 5.

## Contract

The four-method `ContentStore` contract this package implements
(per `@endo/platform/fs/lite/types`):

| Method | Signature | Notes |
|--------|-----------|-------|
| `store` | `(readable) => Promise<string>` | Streams to a temp file, hashes as bytes land, atomically renames to the sha256 hex name. |
| `fetch` | `(sha256) => ReadableBlob` | Returns `{ makeFileReader, text, json, size, readRange }` over the blob: a whole-blob byte reader, decoded text and JSON, the blob's byte length (`bigint`), and a windowed `(offset, length)` range read. |
| `has` | `(sha256) => Promise<boolean>` | Probes by attempting a read. |
| `remove` | `(sha256) => Promise<void>` | Idempotent: removing a missing blob is not an error. |

## Status

This package was carved out of
`packages/daemon/src/daemon-persistence-powers.js` so the daemon's
content-store implementation can be swapped without churning call
sites.
The daemon's `daemon-persistence-powers.js` now calls
`makeContentStore` and wraps it in `makeSnapshotStore`, so the sole
consumer in `daemon.js` reads through the package without change.
The 4-method contract is unchanged; the daemon's GC sweep behaviour
is unchanged.
