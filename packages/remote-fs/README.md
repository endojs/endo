# @endo/remote-fs

Pipelinable, stream-friendly filesystem capabilities for Endo.

`Filesystem` mints a typed `Directory` / `File` graph whose
`lookup` results carry their `qid` eagerly, so a deep
`E(root).lookup(a).lookup(b).lookup(c).open(flags).read(0, len)`
chain pipelines into a single CapTP round-trip.
Bulk transfers ride `@endo/exo-stream` readers and writers — not
method-sized buffers — and `File.snapshot()` optionally returns a
content-addressed `BlobRef` so peers with a CAS can skip the
network entirely.

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
| Live FS access | `@endo/daemon` `Mount` | Typed `Directory` / `File` subtypes; eager qid; explicit `open()` ↔ `OpenFile` / `Cursor` split. |
| Immutable snapshot | `@endo/daemon` `ReadableTree` | `Node.snapshot() → BlobRef` for content-addressed sub-trees. |
| Byte streaming over CapTP | `@endo/exo-stream` | Consumed; not replaced. |
| 9P-over-UDS bridge | `@endo/9p-server` | This package is the bridge's *backing store*. |
