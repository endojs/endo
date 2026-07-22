---
"@endo/tar": minor
"@endo/daemon": patch
---

`@endo/tar` now also writes: `tarFileHeader`, `tarFilePadding`, and
`tarEndMarker` emit the ustar header, padding, and end-of-archive blocks for
streaming a regular-file tar archive (also on the `@endo/tar/writer.js`
subpath). The daemon's HTTP web-seed route now consumes those primitives
instead of an inline ad hoc tar encoder, and its Gateway splits the former
`fetchContent(hash, kind)` into `provideBlob(hash)` and `provideTree(hash)`
with distinct return types.
