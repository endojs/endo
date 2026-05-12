---
'@endo/exo-zip': minor
---

`@endo/exo-zip` now hosts the write-side of the readable-tree ↔
ZIP adapter pair: `zip(tree) -> Promise<Uint8Array>` walks a
`ReadableTree` exo (local or borne over CapTP) and serializes its
blobs into in-memory ZIP archive bytes.
The previous read-side implementation under this name has moved to
the new `@endo/exo-unzip` package and is exported as `unzip(bytes)`.
Entries are emitted with `STORE` compression, matching the
constraint of `@endo/zip`'s `ZipWriter`.
The walker accumulates each blob's `streamBase64()` chunks as
encoded strings and decodes the concatenation in a single pass,
relying on the producer's contract that every non-final chunk is
unpadded.
