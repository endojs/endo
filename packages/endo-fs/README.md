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
- `makeNodeFilesystem` — wraps `node:fs/promises`; symlink-safe
  containment via `realpath` + `O_NOFOLLOW` (no path-escape).
- `mountAsFilesystem` — projects an `@endo/daemon` `Mount` as a
  `Filesystem`.
- `readOnly` — attenuator that rejects mutating verbs.
- `compose` — copy-on-write union over a backing FS and a
  writable layer; `compose.rename` handles both files and
  directories (recursive copy-up); `statfs` aggregates across
  participants; `compose.watch` merges events from layer and
  backing.
- `makeLayer` — writable layer whose mutations can be diffed and
  applied to another FS; `Layer.apply` is intentionally optimistic
  (writes propagate eagerly; callers needing atomicity layer it
  themselves).
- `chroot` / `bind` / `namespace` / `emptyFilesystem` — structural
  primitives with two-tier cycle detection (sync `Symbol`-based
  for local participants, async brand-based for cross-CapTP).
- `Directory.materialise(path, opts)` — server-side
  `lookupOrCreate` across a path; one CapTP round-trip regardless
  of depth.
- `Directory.watchFrom()` — atomic `{ cursor, watcher }` mint;
  closes the `list + watch` TOCTOU race.
- `makeMemoryCas({ capacity? })` — content-addressed store with
  optional LRU eviction.
- `cacheBackedRead(blobRef, cas, { offset?, length? }?)` — direct
  `BlobRef` consumer; range overload returns a slice of the
  cached payload.
- `withCachedReads(fs, cas)` — transparent CAS-backed read cache
  that drops into the composition algebra. Hash discovery
  pipelines alongside the speculative underlying read through one
  CapTP batch (one RTT, hit or miss). With watch-based hash
  invalidation, repeat reads of an unchanged cached file pay
  **zero** RTT.

POSIX-isms (permissions, owner, hard links, symlinks, `system.*` /
`trusted.*` / `security.*` xattrs) are deliberately deferred to
companion caps; the base `Filesystem` is tree-shaped and
ocap-pure.

See `DESIGN.md` for the full interface, design principles, and
the feature roadmap. See `ROADMAP.md` for the post-implementation
honest list — places where claims exceed reality, known
shortcomings, and the separate Endo-daemon-refactor track.

## Daemon attach scripts

Two thin convenience wrappers around `endo make --UNCONFINED`
ship as package bins. They use the existing `makeUnconfined`
formula type — a dedicated `provideRemoteFs` daemon verb isn't
required.

- **`endo-fs-attach <path> --name <petName> [--read-only] [--worker <name>]`** —
  attaches a host directory as a formulated `Filesystem` cap
  bound to `petName`. Wraps `src/node-fs-module.js`; passes
  `ENDO_FS_ROOT` (and `ENDO_FS_READ_ONLY=1` when `--read-only`).
- **`endo-fs-mkmem --name <petName> [--worker <name>]`** —
  mints a fresh in-memory `Filesystem` cap bound to `petName`.
  Wraps `src/in-memory-module.js`. The cap reincarnates across
  daemon restart; its contents do not.

Both default `--worker` to `@node` (the host-side worker, required
because the modules import `node:fs/promises`). Examples:

```sh
endo-fs-attach /tmp/workspace --name workspace
endo-fs-attach ~/code --name code --read-only
endo-fs-mkmem --name scratch
```

The bins resolve the `endo` executable through `@endo/cli`'s
package layout, so a workspace clone works without a global
install.

## Relation to existing Endo work

| Subject | Where today | What this package adds |
|---|---|---|
| Live FS access | `@endo/daemon` `Mount` | Typed `Directory` / `File` subtypes; stable `qid` identity (inode-style `pathId` + `version`); explicit `open()` ↔ `OpenFile` / `Cursor` split. |
| Immutable snapshot | `@endo/daemon` `ReadableTree` | `Node.snapshot() → BlobRef` for content-addressed sub-trees. |
| Byte streaming over CapTP | `@endo/exo-stream` | Consumed; not replaced. |
| 9P-over-UDS bridge | `@endo/9p-server` | This package is the bridge's *backing store*. |
