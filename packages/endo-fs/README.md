# @endo/endo-fs

Pipelinable, stream-friendly filesystem capabilities for Endo.

`Filesystem` mints a typed `Directory` / `File` graph keyed by a
stable `qid` (inode-style `pathId` + `version`).
A deep `E(root).lookup(a).lookup(b).lookup(c).open(flags).read(0,
len)` chain dispatches as a single batch of pipelined CapTP
messages — every call in the chain is sent before any reply
comes back, rather than waiting one round-trip per step.
Bulk transfers ride `@endo/exo-stream` readers and writers — not
method-sized buffers — and `File.snapshot()` optionally returns a
content-addressed `BlobRef` so a peer holding a CAS can serve
reads locally and skip the `fetch` round-trip on cache hits.

`qid` and `BlobRef.getInfo` are sync getters on the responder, but
callers reach them across CapTP — one round-trip per call. The
intended usage is to pipeline the getter alongside the call that
produced the cap (lookup + `getQid` in one batch, snapshot + getInfo
+ fetch in one batch), so the incremental round-trip is zero;
`cached-fs.js` and `readonly.js` are the realisations. See
`DESIGN.md` §4.10. CAS hits skip the bytes payload; with
`withCachedReads`'s watch-based hash cache they also skip the
discovery RTT on repeat reads of unchanged files.

Key pieces:

- `makeInMemoryFilesystem` — ephemeral, all in JS.
- `makeNodeFilesystem` — wraps `node:fs/promises`.
- `mountAsFilesystem` — projects an `@endo/daemon` `Mount` as a `Filesystem`.
- `readOnly` — attenuator that rejects mutating verbs.
- `compose` — copy-on-write union over a backing FS and a writable
  layer.
- `makeLayer` — writable layer whose mutations can be diffed and
  applied to another FS.
- `chroot` / `bind` / `namespace` / `emptyFilesystem` — structural
  primitives, with eager cycle detection.
- `makeMemoryCas` + `cacheBackedRead` — content-addressed-store
  primitives for direct `BlobRef` consumers.
- `withCachedReads(fs, cas)` — transparent CAS-backed read cache
  that drops into the composition algebra. Hash discovery
  pipelines alongside the speculative underlying read through one
  CapTP batch, so a wrapper read costs one round-trip — same as
  plain `read`, regardless of hit or miss.

POSIX-isms (permissions, owner, hard links, symlinks, `system.*` /
`trusted.*` / `security.*` xattrs) are deliberately deferred to
companion caps; the base `Filesystem` is tree-shaped and
ocap-pure.

See `DESIGN.md` for the full interface, design principles, and
the feature roadmap. See `ROADMAP.md` for the post-implementation
honest list — places where claims exceed reality, known
shortcomings, and the separate Endo-daemon-refactor track.

## Relation to existing Endo work

| Subject | Where today | What this package adds |
|---|---|---|
| Live FS access | `@endo/daemon` `Mount` | Typed `Directory` / `File` subtypes; stable `qid` identity (inode-style `pathId` + `version`); explicit `open()` ↔ `OpenFile` / `Cursor` split. |
| Immutable snapshot | `@endo/daemon` `ReadableTree` | `Node.snapshot() → BlobRef` for content-addressed sub-trees. |
| Byte streaming over CapTP | `@endo/exo-stream` | Consumed; not replaced. |
| 9P-over-UDS bridge | `@endo/9p-server` | This package is the bridge's *backing store*. |
