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

Two yarn-workspace setup scripts, modelled on the `@endo/fae`
pattern. Each is a `main(agent)` module invoked via
`endo run --UNCONFINED … --powers @agent`; the script calls
`E(agent).makeUnconfined(…)` to register a formulated
`Filesystem` cap that reincarnates across daemon restart. Both
scripts are idempotent — re-running with the same name is a no-op.
No declared runtime dependency on `@endo/cli`; the `endo` binary
is resolved by the user's shell.

- **`yarn workspace @endo/endo-fs attach`** (symmetric with
  `endo mount`) — wraps `src/node-fs-module.js`. Configure via
  env vars:
  - `ENDO_FS_ROOT` (required) — absolute path to the directory.
  - `ENDO_FS_NAME` (required) — pet name.
  - `ENDO_FS_READ_ONLY=1` (optional) — wrap with `readOnly`.
- **`yarn workspace @endo/endo-fs mkmem`** (symmetric with
  `endo mktmp`) — wraps `src/in-memory-module.js`. Configure via:
  - `ENDO_FS_NAME` (required) — pet name.

The cap reincarnates across daemon restart; for `mkmem`, its
contents do not (the in-memory FS is rebuilt empty each time the
module re-instantiates).

Examples:

```sh
ENDO_FS_ROOT=/tmp/workspace ENDO_FS_NAME=workspace \
  yarn workspace @endo/endo-fs attach

ENDO_FS_ROOT=$HOME/code ENDO_FS_NAME=code ENDO_FS_READ_ONLY=1 \
  yarn workspace @endo/endo-fs attach

ENDO_FS_NAME=scratch \
  yarn workspace @endo/endo-fs mkmem
```

## Relation to existing Endo work

| Subject | Where today | What this package adds |
|---|---|---|
| Live FS access | `@endo/daemon` `Mount` | Typed `Directory` / `File` subtypes; stable `qid` identity (inode-style `pathId` + `version`); explicit `open()` ↔ `OpenFile` / `Cursor` split. |
| Immutable snapshot | `@endo/daemon` `ReadableTree` | `Node.snapshot() → BlobRef` for content-addressed sub-trees. |
| Byte streaming over CapTP | `@endo/exo-stream` | Consumed; not replaced. |
| 9P-over-UDS bridge | `@endo/9p-server` | This package is the bridge's *backing store*. |
