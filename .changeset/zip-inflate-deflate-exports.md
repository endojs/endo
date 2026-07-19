---
'@endo/zip': minor
---

`@endo/zip` now exposes `inflate` and `deflate` at
`@endo/zip/inflate` and `@endo/zip/deflate`.
Each is a thin async wrapper over the platform's
`DecompressionStream('deflate-raw')` and
`CompressionStream('deflate-raw')` and is the recommended argument
to pass as `inflate` / `deflate` when constructing a `ZipReader` or
`ZipWriter` that needs to read or write DEFLATE entries.
