---
'@endo/daemon-cas': minor
'@endo/platform': minor
'@endo/daemon': patch
---

`@endo/platform/fs/node` now exports `makeContentStoreFilePowers` and
`makeContentStoreCryptoPowers`: the canonical `node:fs` / `node:crypto`
implementations of the platform-owned `ContentStoreFilePowers` /
`ContentStoreCryptoPowers` contracts. Consumers (and their tests) inject these
rather than hand-rolling a duplicate filesystem/crypto powers object.

Extract the filesystem-backed content-addressed store (`makeContentStore`)
out of `@endo/daemon`'s `daemon-persistence-powers.js` into a new
`@endo/daemon-cas` workspace.
The daemon now delegates its content store to the package: it derives the
`<statePath>/store-sha256/` directory, builds the raw store, and wraps it in
`@endo/platform/fs/lite`'s `makeSnapshotStore`.
The `store`/`fetch`/`has`/`remove` contract is unchanged at the daemon call
site, including the `size`/`readRange`/`makeFileReader` range-I/O surface
`EndoBlob` relies on.
This is an intermediate seam toward
[`designs/daemon-cas-management.md`](../designs/daemon-cas-management.md)
Phase 5 (a Rust-backed CAS swap that replaces the package's implementation
without disturbing the daemon).
