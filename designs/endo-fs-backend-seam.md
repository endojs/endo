# endo-fs FsBackend seam + Mount alignment + p9 readiness

| | |
|---|---|
| **Created** | 2026-05-28 |
| **Updated** | 2026-05-28 |
| **Author** | Aaron Kumavis (prompted) |
| **Status** | **Complete** |

## Status

All six phases shipped. The legacy `in-memory.js` (788 lines),
`node-fs.js` (859 lines), and `from-mount.js` (655 lines) — 2302 LOC
of duplicated exo plumbing — are now thin wrappers
(`wrapBackend(make*Backend())`) totaling ~60 lines. The shared
upper layer (`wrap-backend.js` + `helpers.js`) is ~1300 lines; the
three FsBackend adapters (`backends/{in-memory,node-fs,from-mount}-backend.js`)
total ~700 lines. Net: ~300 lines removed plus a clean seam every
future backing (KV stores, SQLite, S3, IPFS) can plug into.

### Phase 1 — Foundation (commits d2c6dedd → 4e110976)

- `src/backend-types.js` — `FsBackend` JSDoc typedefs (6 required + 5
  optional methods).
- `src/wrap-backend.js` — full shared upper layer that builds all exos
  (Filesystem, Directory, File, OpenFile, Cursor, NodeWatcher) on top
  of any `FsBackend`. Includes the vat-local lock-table, materialise
  loop, refcounted close hygiene, synthesized fallbacks for missing
  optional capabilities, and legacy-method forwarders (`mkdir`,
  `unlink`, `getQid`, `getAttrs`, `setAttrs`, `xattrs` stub).
- `src/backends/in-memory-backend.js` — full in-memory FsBackend
  (kind/list/read/write/makeDirectory/remove + setStat/fsync/rename/watch).
- `src/backends/from-mount-backend.js` — Mount→FsBackend adapter.
- `src/helpers.js` — porcelain (walk, collectBytes, collectStream).
- `src/index.js` — exports the new APIs alongside the existing ones.
- `test/wrap-backend.test.js` — 20 tests exercising the new
  architecture end-to-end against `wrapBackend(makeInMemoryBackend())`.
- `src/type-guards.js` — added `sloppy: true` to the interface guards
  (allows additional methods beyond the declared ones), widened
  `OpenFile.read`/`write` return guards from specific `PassableBytes…`
  remotables to generic `M.promise()` (the wire shape stays the same;
  this just stops the strict guard from forbidding new
  Uint8Array-shaped variants if/when CapTP marshalling allows them).

Phase 1 is strictly additive: every existing test passes unchanged
plus the new 20 wrap-backend tests.

### Phase 2 — Migrate `from-mount.js` (commit 0f6d522e)

655-line legacy implementation replaced with a 6-line wrapper. The
Mount adapter creates files via `E(parent).writeText(name, '')` +
lookup + writeBytes, matching the existing Mount API surface.
xattrs test updated to expect vat-local sidecar (ENODATA when unset)
rather than ENOSYS.

### Phase 3 — Migrate `in-memory.js` (commit 0130a900)

788-line legacy implementation replaced with a 4-line wrapper. To
make the migration test-clean, wrap-backend gained:

- A vat-local xattr table with a real Xattrs exo (sidecar storage
  for user.* metadata).
- A vat-local per-path stat table for mtime/atime/ctime/btime so
  getStat / getAttrs return non-zero timestamps.
- `validateStatPatch` / `narrowStatPatch` — POSIX-only fields rejected
  with EINVAL.
- `backend.statfs?` optional with live size totals.
- BlobRef synthesis for `File.snapshot`.
- A local event bus so xattrs mutations fire 'changed' events.
- A `dirPaths` WeakMap so `Directory.rename` detects same-Filesystem
  destinations (atomic via `backend.rename`) and rejects cross-FS
  with EXDEV.
- Eager-write semantics on `Directory.create` so concurrent
  lookup-after-create batches (e.g. 9p-server's pipelined Tlcreate)
  see the new file synchronously.

### Phase 4 — Migrate `node-fs.js` (commit 8f5f6eb9)

859-line legacy implementation replaced with a 12-line wrapper. The
new `backends/node-fs-backend.js` (~270 lines vs the 859 it replaces)
implements 6 required + setStat (utimes + truncate), fsync, rename,
watch (fs.watch adapter), hash (sha256 of readFile). Symlink
containment via realpath; EACCES on symlink escape is translated to
ENOENT in `kind()` so the holder of a Filesystem cap can't probe for
out-of-sandbox path existence.

### Phase 5 — Consumers (no code changes needed)

`compose.js`, `readonly.js`, `cached-fs.js`, and `layer.js` all
continued to work unchanged thanks to the additive interface design.
The 48 consumer tests passed without modification — the seam refactor
is forward-compatible. New consumers may opt in to the new porcelain
(`walk`, `Cursor.read`, `Cursor.toArray`) where it simplifies their
code.

### Phase 6 — `PosixFs` extension scaffold (commit ec51295c)

`src/posix-fs.js` introduces the `PosixFsInterface` and a
`synthesizePosixFs(fs)` factory that fills POSIX-only fields from
defaults (0o644 / 0o755 modes, uid/gid=0) and reads
size/mtime/atime from the base Filesystem. Real-mode persistence
(disk-truthful mode/uid/gid, real OS locks, native xattrs) is left
as follow-up work via a backing-specific `makeNodeFsPosixBackend`.

The 9p-server will compose `PosixFs` alongside `Filesystem` for
9P2000.L `Tgetattr`/`Tsetattr`/`Txattrwalk` once that follow-up
lands. The 9p-server's existing test surface (basic 9P2000 walks,
opens, reads, writes, readdir, mkdir, unlink) works against any
wrapBackend-built Filesystem — 20/20 tests pass.

### Test totals after Phase 6

- `@endo/endo-fs`: 215 tests pass (211 from before + 4 new PosixFs).
- `@endo/9p-server`: 20 tests pass.

### Net LOC change

| File | Before | After |
|---|---:|---:|
| `src/in-memory.js` | 788 | 23 |
| `src/node-fs.js` | 859 | 26 |
| `src/from-mount.js` | 655 | 22 |
| (sum) | 2302 | 71 |
| `src/wrap-backend.js` (new) | 0 | 1153 |
| `src/helpers.js` (new) | 0 | 88 |
| `src/backend-types.js` (new) | 0 | 152 |
| `src/backends/in-memory-backend.js` (new) | 0 | 287 |
| `src/backends/node-fs-backend.js` (new) | 0 | 332 |
| `src/backends/from-mount-backend.js` (new) | 0 | 196 |
| `src/posix-fs.js` (new) | 0 | 113 |

The shared upper layer absorbs ~1153 lines of plumbing that used to
be triplicated; each new backing now costs ~200–300 lines of focused
FsBackend implementation rather than 700–900 lines of duplicated exo
construction.

### Design deviation

The original plan called for `OpenFile.read` to return `Uint8Array`
directly for single-RTT bounded reads. Implementation found this
isn't possible — CapTP marshalling rejects mutable typed arrays
("Cannot pass mutable typed arrays"). The wire shape stays as
`PassableBytesReader` (base64-encoded chunks); single-RTT bounded
reads are still achievable via E-pipelining (the existing 9p-server
already does this). When SES adopts an immutable bytes type (e.g.,
`ImmutableArrayBuffer`), the seam supports moving to a direct-bytes
return shape without changing the backend protocol.

## Context

`@endo/endo-fs` today has three full backings (in-memory, node-fs, from-mount)
that **independently reimplement** the entire `Filesystem` exo surface:
each is 650–860 lines of mostly-duplicated exo plumbing (Directory, File,
OpenFile, Cursor, Watcher, Xattrs). What's actually shared is three small
utility modules (`shared/helpers.js`, `shared/lock-table.js`,
`shared/blobref.js`) totaling ~350 lines. There is **no backing protocol**
— adding a new backing today means cloning a backing file and rewriting
~600 lines.

This refactor pulls a thin **`FsBackend` interface** out of the three
existing backings, lands a shared **`wrapBackend(backend) → Filesystem`**
upper layer that contains all the exo plumbing once, and ships the
Mount-alignment ergonomics (renames + one-shot I/O + porcelain) as a
**natural consequence** of the upper layer existing — not as separate
per-backing changes.

Three forces drive this:

1. **Mount alignment.** ROADMAP §3.3 wants the daemon's `Mount` consumers
   to be able to switch to endo-fs `Filesystem` with one-liners. Today
   the per-backing duplication makes the API churn (`unlink → remove`,
   one-shot `File.read/write`, `walk`, `Cursor.toArray`) a 3× change.
   After the refactor it's a 1× change in the shared layer.

2. **New backings.** A KV blob store, SQLite, S3, IPFS backings are all
   plausible. With a backend seam each is ~100 lines instead of ~600.

3. **p9 bridge readiness.** A future 9P-over-CapTP bridge wraps a
   `Filesystem` (and optionally a composed `PosixFs`) and serves the
   9P wire protocol. The bridge talks to the **full Filesystem exo
   interface** — the wire boundary is between the bridge and the
   Filesystem exo, not between the bridge and the backend. So efficiency
   constraints sit on the **exo** surface (single-RTT bounded reads,
   pageable cursors) — not on the backend, which is in-process to
   whatever holds the Filesystem.

   For 9P2000.L attrs / xattrs / locks / Qid identity, the bridge
   composes a `PosixFs` cap alongside `Filesystem`. The base backend
   stays portable; PosixFs has its own backend (or composes over a
   base backend that also offers POSIX hooks). **Not everything the
   bridge needs sits in the base.**

We are **not** building the p9 bridge here. We are only ensuring the
base `Filesystem` exo + `FsBackend` shapes don't paint us into a corner
when it does land.

## Architecture after the refactor

```
                ┌─────────────────────────────────────────────┐
                │  Porcelain helpers (free functions)         │
                │  walk, collectBytes, collectStream          │
                └─────────────────────────────────────────────┘
                                    ▲
                ┌─────────────────────────────────────────────┐
                │  Filesystem exo surface — wrapBackend()     │
                │                                              │
                │  Builds all exos: Filesystem, Directory,    │
                │  File, OpenFile, Cursor, Watcher, Xattrs.   │
                │                                              │
                │  Synthesizes (when backend lacks support):  │
                │   • in-vat advisory locks (lock-table)      │
                │   • OpenFile.read/write via readFile +slice │
                │   • Qid identity via sha256(path)           │
                │   • Watcher = empty async generator         │
                │   • Xattrs in inline sidecar map            │
                │   • Content blobref via sha256              │
                │                                              │
                │  Owns: path materialise(), refcount/close   │
                │  hygiene, exo guards (type-guards.js).      │
                └─────────────────────────────────────────────┘
                                    ▲
                                    │  FsBackend protocol
                                    │  (6 required + ~14 optional)
                                    ▼
                ┌──────────────┬──────────────┬──────────────┐
                │  in-memory   │  node-fs     │  from-mount  │
                │  ~110 lines  │  ~230 lines  │  ~60 lines   │
                └──────────────┴──────────────┴──────────────┘
                                    │
                                    │  (future)
                                    ▼
                ┌──────────────┬──────────────┬──────────────┐
                │  kv-store    │  sqlite      │  s3 / ipfs   │
                │   ~80 lines  │  ~150 lines  │  ~150 lines  │
                └──────────────┴──────────────┴──────────────┘
```

## FsBackend interface

Path-keyed everywhere. Paths are `string[]` segments (no separators in
the seam — backends that need string paths join internally). Backends
**advertise optional capability via method existence** — no flags object.
The upper layer checks `typeof backend.X === 'function'` once at wrap
time and remembers.

**Design rule: zero redundancy.** No two backend methods do "almost the
same thing." Where ranged and whole-file variants would otherwise be
redundant, they collapse to one method with optional args. Where two
addressing modes (path vs. handle) would otherwise be redundant, only
paths exist; backends that benefit from handle caching keep an internal
LRU keyed by path.

### Required (6 methods)

Every backend implements these. Toy backends that only do these get a
functional `Filesystem` with vat-local advisory locks, no watchers, no
content hash, and non-atomic rename.

```js
kind(path)                            // → 'file' | 'directory' | undefined
list(dirPath)                         // → AsyncIterable<{ name, kind }>
read(path, offset?, length?)          // → Uint8Array
write(path, bytes, offset?)           // → void   (creates file if missing; pwrite semantics)
makeDirectory(path)                   // → void
remove(path)                          // → void   (file or empty directory)
```

Notes:

- **`kind`** replaces `stat`. The base backend doesn't surface size,
  timestamps, or identity — those are POSIX-shaped attributes that live
  in `PosixFs`. `kind(path)` returns `undefined` for missing paths
  (ENOENT signal) — that's the only "metadata" the base needs to build
  the typed File/Directory exos.
- **`read(path, offset?, length?)`** is the single content-read method.
  `read(p)` returns the whole file. `read(p, 0n, 4096n)` returns the
  first 4 KiB. No separate `readFile`/`readRange`.
- **`write(path, bytes, offset?)`** is pwrite-style: writes `bytes`
  starting at `offset` (default 0n), does **not** truncate. Whole-file
  overwrite = `truncate?(path, 0n)` + `write(path, bytes, 0n)`, composed
  by `wrapBackend`'s `File.write` porcelain.
- **`list`** entries are `{ name, kind }` only — no size, no identity.
  Consumers that need richer metadata compose a `PosixFs` cap and call
  `posixFs.attrs(node)` per entry.

### Optional (5 methods)

```js
setStat?(path, { size?, mtime?, atime? })   // → void   (atomic; partial patch)
fsync?(path)                                // → void   (durability barrier)
rename?(src, dst)                           // → void   (atomic move)
watch?(path)                                // → AsyncIterable<{ kind, name? }>
hash?(path)                                 // → Uint8Array   (native content hash)
```

Notes:

- **`setStat?`** is the single resize-and-timestamp method. Narrow
  shape: only the portable subset (`size`, `mtime`, `atime`).
  POSIX-specific fields (`mode`, `uid`, `gid`, `ctime`, `btime`)
  belong to `PosixFs`. Partial patch — keys omitted from the second
  arg are unchanged. **Subsumes a separate `truncate`** (just call
  `setStat(path, { size })`), so there's no `truncate?` redundancy.
  Matches 9P2000's `Twstat` for the portable fields.

Synthesis when absent:

- `setStat?` absent → wrapBackend's `File.setStat()` throws ENOSYS.
  No silent read-whole/slice/write-whole fallback — the cost is high
  and the semantics (atomicity) can't be honestly synthesized.
- `fsync?` → wrapBackend's `OpenFile.fsync()` is a no-op (the only
  honest answer for in-memory).
- `rename?` → wrapBackend's `Directory.rename(name, newName)` falls
  back to copy + remove. Non-atomic; flagged in the help text.
- `watch?` → wrapBackend's `Watcher.events()` returns an empty stream
  (no events ever fire). Consumers that need polling roll it themselves.
- `hash?` → wrapBackend computes SHA-256 by reading the whole file.

**Locks are not a backend concern.** `OpenFile.lock(opts) → Lock` is
served entirely from wrapBackend's in-vat `lockTable` (today's
behavior; vat-local advisory). Real OS-level locks (`fcntl(F_SETLK)`,
`flock(2)`, `LockFileEx`) are POSIX-shaped and live in the future
`PosixFs` extension — see "Removed from base" below. There is no
`flock?` method on `FsBackend`.

**Xattrs are not a backend concern.** PosixFs. See "Removed from base".

**Reads of attrs (the `Attrs` shape, `Qid`, `identity`) are not a backend
concern.** PosixFs. The base backend's only metadata query is `kind`.
Writes of attrs use the narrow `setStat?` above (size/mtime/atime only);
POSIX-extended writes (mode/uid/gid) are PosixFs.

Absent → wrapBackend hashes via `readFile` + `crypto.subtle.digest`.
Present → wrapBackend delegates (e.g., for backings that store
content-addressed blobs natively: IPFS, restic, git).

## Removed from base interface

This refactor takes the opportunity to slim the base `Filesystem` exo
to a truly portable subset. Two things go:

### Xattrs

**Final shape (deviated from the original plan).** The original plan
called for removing xattrs from base entirely and deferring them to a
future PosixFs cap. In implementation we found that's an unnecessarily
disruptive break for existing in-vat consumers (the legacy `in-memory.js`
xattr round-trip tests, for instance). The shipped design keeps the
`Node.xattrs() → Xattrs` sub-cap on the base interface but serves it
from a **wrap-backend-level vat-local sidecar** — a per-path
`Map<name, Uint8Array>` in `xattrTable` that wrap-backend mints
unconditionally regardless of which backing it wraps.

Concretely:

- `xattrs()` stays in `NodeBaseMethods` in `src/type-guards.js`.
- `XattrsInterface` stays exported from `type-guards.js`.
- The `Xattrs` exo is built in `wrap-backend.js` (`makeXattrsExo`),
  not in the backings. All backings — in-memory, node-fs, from-mount —
  get identical xattr support for free.
- Only the `user.*` namespace is accepted. Other namespaces
  (`security.*`, `trusted.*`, `system.*`) are POSIX-specific and
  rejected with `ENOTSUP` — those are PosixFs's job.
- Unset xattrs return `ENODATA` (POSIX-correct signal).
- Mutations fire `'changed'` events on the node via the wrap-backend
  local event bus.
- The `FsBackend` protocol has **no** `getXattr?/setXattr?/listXattrs?/
  removeXattr?` methods. Backings that have native disk xattrs would
  surface them via a future backing-specific `PosixFs` impl that reads
  real disk metadata; the base sidecar is purely vat-local.

**Limitation, by design.** The vat-local sidecar is scoped to the
`Filesystem` cap — a fresh `makeNodeFilesystem({ rootPath })` over the
same disk sees an empty xattr table. Persistence to disk is PosixFs's
remit. The node-fs test suite has an explicit
`'vat-local sidecar does not persist to disk'` assertion that pins this
behavior.

### All attrs (size, mtime, atime, mode, uid, gid, identity, ctime, btime)

The entire `Attrs` shape (DESIGN §4.9) and the `getAttrs` / `setAttrs`
methods on `NodeBaseMethods` (DESIGN §4.2) are pulled out of the base.
Concretely:

- `getAttrs` and `setAttrs` removed from `NodeBaseMethods` in
  `src/type-guards.js`.
- `Attrs` typedef removed from base (lives in PosixFs).
- `Qid` (DESIGN §4.9: `{ type, pathId, version }`) — base no longer
  exposes `getQid` on Nodes. The kind ('file' vs 'directory') is
  carried by the cap's interface tag (File exo vs Directory exo).
  `pathId` and `version` are POSIX-shaped identity — PosixFs.
- `list` entries become `{ name, kind }` only (was `{ name, type,
  size?, identity? }`).
- The backend has no `stat`, no `setStat`, no `identity`. Just `kind`.

The PosixFs cap (F15) layers on top of a base `Filesystem` and exposes
`attrs(node) → PosixAttrs` (with the full POSIX shape — `size`, all
three timestamps, `btime`, `mode`, `uid`, `gid`, `nlink`, `pathId`,
`version`) plus `setAttrs(node, patch)`. The cap holds its own backend
that can answer those queries against the same underlying store.

### Locks (real OS-level)

Removed from the backend interface. The base `OpenFile.lock(opts) →
Lock` keeps today's vat-local advisory semantics via wrapBackend's
shared `lockTable` (`shared/lock-table.js`) — which is what "keep locks
as is" from the earlier discussion preserves. Real OS file locks
(`fcntl(F_SETLK)`, `flock(2)`, `LockFileEx`) are POSIX-shaped and move
to `PosixFs` (F15), which can offer `posixFs.flock(node, opts) →
Lock` with cross-process semantics on top of a node-fs backend.

### Why these removals land cleanly here

The pulled-out features are pure deletions for the current consumer
base — no consumer currently relies on the in-memory xattr impl in
production (Mount, the migration target, doesn't expose xattrs at all),
and the attrs surface is only stat-shaped today (no setAttrs use
sites). PosixFs (F15) absorbs them later as a clean extension cap.

## p9 wire-protocol mapping (validation)

The wire boundary sits between the 9P bridge and the **Filesystem exo**
(plus optionally a `PosixFs` cap for 9P2000.L extensions). The backend
is in-process behind the exo; bridge calls go CapTP → exo → in-process
→ backend. So this table records what the **exo surface** must offer.

For 9P2000 (basic, no Linux extensions) the bridge needs only the base
`Filesystem` exo. For 9P2000.L (the typical Linux mount target) the
bridge holds a `Filesystem` cap **and** a `PosixFs` cap.

| 9P op | Cap(s) the bridge calls | Wire-facing exo method |
|---|---|---|
| `Tattach` | `Filesystem` | `.root` accessor |
| `Twalk` | `Filesystem` | `walk(root, names)` porcelain — E-pipelined; one CapTP batch |
| `Topen` | `Filesystem` | `File.open({read, write})` |
| `Tcreate` | `Filesystem` | `Directory.makeFile/makeDirectory` + `File.open({create, write})` (E-pipelined) |
| `Tread` | `Filesystem` | `OpenFile.read(offset, length) → Uint8Array` — **single CapTP RTT, bounded** |
| `Twrite` | `Filesystem` | `OpenFile.write(bytes, offset?) → void` — **single CapTP RTT, bounded** |
| `Tclunk` | `Filesystem` | `OpenFile.close()` |
| `Tremove` | `Filesystem` | `Directory.remove(name)` |
| `Treaddir` | `Filesystem` | `Cursor.read(limit?) → { entries, atEnd }` — bounded page per RTT |
| `Tstat` (9P2000) | `Filesystem` (cap interface tag) + `PosixFs` (size/mtime if needed) | — / `posixFs.attrs(node)` |
| `Tstat` (9P2000.L extended) | `PosixFs` | `posixFs.attrs(node) → PosixAttrs` |
| `Twstat` size/mtime/atime | `Filesystem` | `Node.setStat({ size?, mtime?, atime? })` → `backend.setStat?` |
| `Twstat` mode/uid/gid (9P2000.L) | `PosixFs` | `posixFs.setAttrs(node, patch)` |
| `Trename` (9P2000.L) | `Filesystem` | `Directory.rename(name, newName)` |
| `Tflock` / `Tgetlock` (9P2000.L) | `PosixFs` (real OS locks) **or** `Filesystem` (vat-local advisory) | `posixFs.flock(node, opts) → Lock` / `OpenFile.lock(opts) → Lock` |
| `Tgetattr` / `Tsetattr` (9P2000.L) | `PosixFs` | `posixFs.attrs` / `posixFs.setAttrs` |
| `Txattrwalk` / `Txattrcreate` (9P2000.L) | `PosixFs` | `posixFs.xattrs(node) → Xattrs` |
| `Tlink` / `Tsymlink` / `Treadlink` | `PosixFs` (deferred) | — |

**Critical wire-efficiency changes** to the existing `Filesystem` exo
surface:

- `OpenFile.read(offset?, length?)` returns `Uint8Array` directly (was
  `PassableBytesReader`). Bounded single-RTT — essential for `Tread`.
- `OpenFile.write(bytes, offset?)` accepts `Uint8Array` directly (was
  returning `PassableBytesWriter`). Bounded single-RTT — essential for
  `Twrite`.
- `Cursor.read(limit?)` added — returns a bounded page per RTT for
  `Treaddir`. The existing `Cursor.stream()` stays for very large dirs
  (rare; ENAMETOOLONG territory).
- `getAttrs`/`setAttrs`/`getQid`/`xattrs` all leave `NodeBaseMethods`.

The streaming sink variants (`PassableBytesReader`/`Writer`) remain
useful for "I have a 4 GB blob to ship" scenarios — kept as separate
methods `OpenFile.stream(offset?) → PassableBytesReader` and
`OpenFile.streamWrite(offset?) → PassableBytesWriter`. These two **are**
redundant with `read`/`write` — justified by the bounded-vs-unbounded
distinction (`Uint8Array` doesn't fit a 4 GB read in one message;
streams give back-pressure). Two methods per direction, with clear
purpose split.

## wrapBackend(backend) layer

Public factory: `wrapBackend(backend) → Filesystem`. Lives in
`src/wrap-backend.js`. Internally:

1. **Probes capabilities once.** Caches which optional methods exist.
2. **Builds all exos**: Filesystem, Directory, File, OpenFile, Cursor,
   Watcher. Single source of truth for guards and method bodies.
   (Xattrs exo removed from base — see "Removed from base".)
3. **Synthesizes missing capabilities**:
   - In-vat lock table via `shared/lock-table.js` — **always** owns
     `OpenFile.lock`/`getLock` (no backend `flock?`; real OS locks are
     a PosixFs concern).
   - `setStat?` absent → `Node.setStat` throws ENOSYS.
   - `rename?` fallback: copy + remove (non-atomic; flagged).
   - `fsync?` fallback: no-op.
   - `watch?` fallback: empty event stream.
   - `hash?` fallback: SHA-256 over `read(path)`.
4. **Owns the porcelain methods**: `Directory.remove` (the renamed
   `unlink`), `File.read(opts)` / `File.write(bytes, opts)`,
   `Cursor.toArray()`.
5. **Owns path materialise** (recursive mkdir for `materialise(path[])`).
6. **Owns refcount/close hygiene** on `OpenFile`.

The result is that **every backing's `make()` becomes**:

```js
export const makeInMemoryFilesystem = () => {
  const backend = makeInMemoryBackend();
  return wrapBackend(backend);
};
```

Backings stay tiny. The interface shape is enforced in one place.

## Porcelain (unchanged from prior plan)

Free-function helpers in `src/helpers.js`, exported from `index.js`.
Bytes-only; no text/JSON.

```js
export const walk = (root, path) =>
  path.reduce((dir, name) => E(dir).lookup(name), root);

export const collectBytes = async reader => { /* ... */ };
export const collectStream = async reader => { /* ... */ };
```

These work against any `Filesystem` exo — they don't know or care that
it was built by `wrapBackend`.

## Migration sequencing (incremental, 4 PRs)

Big-bang would be ~2000 lines of churn in one go. Incremental:

### PR 1 — `FsBackend` design + `wrapBackend` skeleton

Adds:
- `src/backend-types.js` — JSDoc typedefs for `FsBackend` and capability
  shape. Reference-only; no runtime.
- `src/wrap-backend.js` — full implementation of all exos on top of the
  backend protocol. Includes synthesis of missing capabilities.
- `src/shared/backend-conformance.js` — shared test suite that any
  `FsBackend` implementation can run through (~30 cases covering
  required methods, optional-method probing, edge cases).

Does **not** migrate any existing backing. Both old `makeInMemoryFilesystem`
and a new `wrapBackend(makeInMemoryBackend())` could coexist if needed
during validation, but in this PR `wrapBackend` is tested against an
inline test-only `FsBackend` so the existing backings stay untouched.

Tests: `test/wrap-backend.test.js` (new) — runs the conformance suite
against a test-only in-memory backend; asserts capability probing,
synthesis fallbacks, exo guard enforcement.

Includes `DESIGN.md` updates documenting the three-layer architecture.

### PR 2 — Migrate `from-mount.js`

Smallest backend (655 → ~60 lines). Easy validation: only `lookup`,
`list`, `readBytes`, `writeBytes` are exercised against Mount.

- New `src/backends/from-mount-backend.js` — implements `FsBackend`,
  ~60 lines. Required methods only: `kind`, `list`, `read`, `write`,
  `makeDirectory`, `remove`. Skips every optional.
- `src/from-mount.js` becomes a 5-line `wrapBackend(makeFromMountBackend(...))`.
- All existing `from-mount.test.js` cases pass unchanged.
- The Mount-alignment ergonomics (`remove`, `File.read/write`,
  `Cursor.toArray/read`, `walk`) now exist on this backend automatically.

This PR is the smallest migration and proves the architecture works
end-to-end before churning the other two backings.

### PR 3 — Migrate `in-memory.js`

In-memory backend (788 → ~110 lines after xattr + attr removal).
Implements 6 required + `setStat` (mutates record's buffer length /
timestamp fields) + `fsync` (no-op) + `rename` (Map key swap) +
`watch` (in-process event bus). Skips `hash` (synthesizes fine). No
`flock` — wrapBackend's vat-local lock table serves `OpenFile.lock`
directly.

This PR also lands the xattr-removal cleanup and the attr-removal
cleanup: deletes the in-memory `NodeRecord.xattrs` Map, deletes the
per-record mtime/atime/ctime fields and the `getAttrs/setAttrs` exo
methods, removes corresponding test cases, and strikes DESIGN.md
§4.8 + §4.9 (or relocates §4.9 to the PosixFs extension docs).

- New `src/backends/in-memory-backend.js`.
- `src/in-memory.js` becomes a thin wrapper.
- Existing `test/in-memory.test.js` passes unchanged (minus the
  xattr/attr cases).

### PR 4 — Migrate `node-fs.js`

Largest backend (859 → ~230 lines after xattr + attr + fd-handle
removal). Implements 6 required (via `fs.promises.readFile` /
`writeFile` / `mkdir` / `rmdir` / etc.) + every optional except
`hash`: `setStat` (composes `fsp.truncate` for size, `fsp.utimes` for
mtime/atime — both atomic at the syscall level when called separately;
wrapBackend's `Node.setStat({size, mtime, atime})` doesn't promise
cross-field atomicity), `fsync` (`FileHandle.sync` — opens a transient
handle), `rename` (`fsp.rename`), `watch` (`fs.watch` adapter). No
`flock` here either; real OS locks are PosixFs's job when F15 lands.

Internal perf optimization (not part of the seam): the backend can
keep a small LRU of `FileHandle`s keyed by path to avoid open+close
on every hot `read(path, offset, length)`. This is purely an
implementation detail — the interface stays path-keyed.

`assertConfined()` (symlink containment) stays in the backend — it's
the only path-safety check that's filesystem-specific.

- New `src/backends/node-fs-backend.js`.
- `src/node-fs.js` becomes a thin wrapper.
- Existing `test/node-fs.test.js` passes unchanged (minus xattr/attr
  ENOSYS-assertion cases that are now deletions).

After PR 4, the package is on the new architecture end-to-end.

## Critical files

### New

- `src/backend-types.js` — `FsBackend` JSDoc typedefs.
- `src/wrap-backend.js` — the shared upper layer (~800 lines).
- `src/helpers.js` — porcelain (`walk`, `collectBytes`, `collectStream`).
- `src/backends/in-memory-backend.js` — backend impl.
- `src/backends/node-fs-backend.js` — backend impl.
- `src/backends/from-mount-backend.js` — backend impl.
- `src/shared/backend-conformance.js` — shared test suite.
- `test/wrap-backend.test.js` — exercises wrapBackend against a
  test-only backend; capability probing; synthesis fallbacks.
- `test/test-helpers.js` — consolidated `readFile`/`writeFile` test
  helpers (currently duplicated across every `test/*.test.js`).

### Modified

- `src/in-memory.js` — collapses to `wrapBackend(makeInMemoryBackend())`.
- `src/node-fs.js` — collapses to `wrapBackend(makeNodeFsBackend(...))`.
- `src/from-mount.js` — collapses to `wrapBackend(makeFromMountBackend(...))`.
- `src/index.js` — export `walk`, `collectBytes`, `collectStream`,
  `wrapBackend`, `makeInMemoryBackend`, `makeNodeFsBackend`,
  `makeFromMountBackend`.
- `src/type-guards.js` —
  - `unlink → remove` in `DirectoryInterface`.
  - `OpenFileInterface.read` returns `Uint8Array` (was `PassableBytesReader`);
    args optional.
  - `OpenFileInterface.write` accepts `Uint8Array + offset?` (was
    returning `PassableBytesWriter`).
  - Add `OpenFileInterface.stream` and `streamWrite` for the unbounded
    cases.
  - Add `FileInterface.read(opts?) → Uint8Array` /
    `FileInterface.write(bytes, opts?) → void`.
  - Add `CursorInterface.read(limit?) → { entries, atEnd }` and
    `CursorInterface.toArray()`.
  - Delete `getAttrs`, `setAttrs`, `getQid`, `xattrs` from
    `NodeBaseMethods`.
  - Add `setStat({ size?, mtime?, atime? })` to `NodeBaseMethods`
    (replaces the deleted `setAttrs` with a narrow portable subset).
  - Delete `XattrsInterface` and `Attrs` exports.
  - Update Cursor entry shape to `{ name, kind }`.
- `src/readonly.js` — attenuator updates for `remove` rename and the
  new methods. Stays a Filesystem-layer wrapper (above wrapBackend).
- `src/cached-fs.js` — same.
- `src/compose.js` — composed Directory/Cursor get the `remove` rename
  and new methods. Stays a Filesystem-layer wrapper.
- `src/layer.js` — internal `unlink` call sites renamed to `remove`.
- `test/*.test.js` — every `unlink` call site renamed to `remove`.
- `DESIGN.md` — adds the three-layer architecture section, updates
  §4.3/4.4/4.5/4.6 for renames and new methods, documents `FsBackend`.
- `ROADMAP.md` — strikes §3.2 "Text-convenience methods"; updates §3.3
  migration sequencing; adds note that §1.3 (real `flock`) is now an
  optional backend method instead of a separate refactor.

### Not modified

- `packages/daemon/src/mount.js` — Mount is left untouched. The
  Mount-returns-Filesystem switch is a separate PR (ROADMAP §3.3).
- `packages/cli/` — no endo-fs usage.

## Reused existing utilities

- `shared/lock-table.js` — wrapBackend uses it for the in-vat advisory
  lock fallback. Unchanged.
- `shared/blobref.js` — wrapBackend uses it; unchanged.
- `shared/helpers.js` — `assertChildName`, `computeOpenMode`,
  byte-reader/writer utilities. Mostly absorbed into wrapBackend; the
  truly generic bits stay in shared/.
- `iterateBytesReader`/`iterateBytesWriter`/`iterateReader` from
  `@endo/exo-stream` — used in wrapBackend's stream plumbing.
- `materialiseViaWalk` — used inside wrapBackend's `materialise`.

## Verification

1. **Conformance suite passes for all backends.**
   `cd packages/endo-fs && npx ava test/wrap-backend.test.js
   test/in-memory.test.js test/node-fs.test.js test/from-mount.test.js`.
   Every existing test passes unchanged (the rename + new methods are
   additive at the consumer level).

2. **Backend code size dropped as projected.** `wc -l
   src/backends/*.js` reports the per-backing files within 20% of the
   targets (in-memory ~150, node-fs ~300, from-mount ~80). If not,
   audit what didn't factor into wrapBackend.

3. **Capability synthesis works.** `test/wrap-backend.test.js` includes
   a "minimal backend" (just the 6 required methods) and asserts:
   - `OpenFile.lock()` works (synthesized in-vat advisory).
   - `OpenFile.read(0n, length)` works (whole-file + slice).
   - `Watcher` returns empty stream.
   - `Xattrs` round-trip through the inline sidecar.

4. **p9-shaped translation works end-to-end.** A new
   `test/p9-shape.test.js` simulates the 9P op sequence on
   `wrapBackend(makeNodeFsBackend({rootPath: tmp}))`: attach → walk →
   open → read → write → stat → setStat → close → remove. Validates
   that the surface composes the way the future 9P bridge would need.
   Does **not** import any 9P library — just exercises the exo methods
   in 9P-op order.

5. **Pipelining property retained.** `test/helpers.test.js` (carried
   over from prior plan) uses the harness from
   `test/pipelined-rtt.test.js` to assert that `await E(await walk(root,
   ['a','b','c'])).read()` produces exactly one CapTP batch.

6. **Rename sweep clean.** `git grep -nE '\bunlink\b' packages/endo-fs/`
   returns zero hits.

7. **Surface didn't regress.** `npx tsc --build` from the package; no
   missing-export or signature errors.

8. **Lint + format clean.** `yarn format` then `yarn lint` in the
   package.

## Out of scope (deliberate)

- **Daemon-side Mount → Filesystem switch.** ROADMAP §3.3 phase 2+ —
  separate PR after this refactor lands.
- **Actual p9 bridge implementation.** This refactor only ensures the
  `FsBackend` shape doesn't preclude it. The bridge itself (9P wire
  framing, transport, server loop) is its own design.
- **PosixFs / LinuxFs extensions** (F15/F16). Those become consumers of
  `wrapBackend` over node-fs + real `flock`/`fcntl`. Unblocked but
  unrelated.
- **New backends** (KV, SQLite, S3, IPFS). The whole point is that
  these become tractable after this refactor — but each is its own PR.
- **Tree-level Merkle hash** (ROADMAP §3.2 ReadableTree). Backend has
  optional `hash?(path)` for whole-file hashing; tree-level Merkle is
  upper-layer work, separate.
- **Text/JSON porcelain** (`readText`, `writeText`, `readJson`).
  Intentionally pushed to consumer code (the synthesis from the prior
  conversation declined these in the base).
- **Symlinks and hard links.** Base endo-fs is tree-shaped (DESIGN §4.3).
  Adding these is its own design and would extend the backend with
  `readSymlink?`/`makeSymlink?`/`hardLink?` optionals.

## Risk

Medium. The refactor is bigger than the original alignment plan
(~2000 lines of churn vs. ~500), but the risk is bounded by the
4-PR incremental sequencing: each PR leaves the package working with
all existing tests passing.

The two specific risks:

1. **wrapBackend gets the synthesis wrong.** The shared lock-table,
   xattr sidecar, watcher fanout, and identity fallback all need to
   match today's behavior exactly. Mitigated by running every
   existing `test/*.test.js` unchanged against the migrated backings.

2. **The p9 escape-valve design is wrong.** If the actual 9P bridge
   discovers it needs something the backend doesn't expose, we revisit
   the backend interface. The escape valves chosen here (fd-style
   handles, `setStat`, `identity`) cover the documented 9P2000.L op
   set; the gap would have to be in an extension we didn't account
   for. Mitigated by the `test/p9-shape.test.js` validation in PR 1.

The Mount-alignment ergonomics ride along for free at no incremental
risk — they're consequences of wrapBackend existing, not separate
changes.
