---
'@endo/exo-unzip': minor
---

Add `@endo/exo-unzip` (`unzip(bytes) -> ReadableTree`).
This is the read-side of the in-memory ZIP adapter previously
named `@endo/exo-zip` and exported as `makeExoZip`; the new
package keeps the implementation and renames the entry point to
the plain English verb per the maintainer's directive on PR #160.
The companion write-side `zip(tree) -> bytes` lives in
`@endo/exo-zip`.
Path-segment validation now sources from the new shared
`@endo/zip/path.js` rather than a per-package copy.
A blob's `streamBase64()` may yield multiple chunks; every chunk
except possibly the last has a length divisible by 4 and carries
no `=` padding, so a consumer can decode the joined chunks in a
single `decodeBase64` call.
