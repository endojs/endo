# @endo/endo-fs — Roadmap and Known Shortcomings

This file is the **honest list** of what's incomplete, what's
overstated, and what's deliberately deferred.
It complements `DESIGN.md` §9 — that section enumerates the F-numbered
feature plan; this file enumerates the *post-implementation reality*.

Three tracks:

- **§1 — Shortcomings inside what this package already ships.**
  Places where the implementation lags the design's claim, where a
  feature is interface-only, or where a known weakness is not yet
  addressed.
  These are owned by `@endo/endo-fs` and tracked here so the design
  prose can be evaluated against the real surface.

- **§2 — Within-package follow-ups.**
  New work that stays inside `packages/endo-fs/`: F6 / F15 / F16 /
  F17 from DESIGN.md, plus internal refactors and the realistic-
  transport CAS test.

- **§3 — Endo daemon refactor (separate track).**
  Replacing `@endo/daemon`'s `Mount` with this `Filesystem` is its own
  initiative, owned by `@endo/daemon`, with its own integration risk.
  Deliberately not part of this PR or the within-package follow-ups.

Items below are written so that anyone evaluating "does endo-fs
deliver X" can find the gap in one place.

---

## 1. Shortcomings inside this package

### 1.1 Design-claim corrections

| Earlier claim | Correct framing |
|---|---|
| **"Eager qid / `BlobRef.getInfo` avoid a round-trip."** Earlier drafts of DESIGN.md §4.10 proposed that CapTP would marshal the qid / blob info alongside the cap's slot, making the getter free on the consumer side. | The slot-state-ride mechanism never landed and won't. The getter is sync on the *responder* (no I/O), but across CapTP it costs one RTT like any other call. Callers always pipeline it into the same batch as the call that produced the cap (`resolveNodeWithQid` in `cached-fs.js`, the `withCachedReads` read path) so the incremental RTT is zero. No deferred work; just usage convention. |
| **"CAS-cached read skips the network entirely on cache hit."** | Reframed: a hit skips the bytes payload, not the `snapshot + getInfo` discovery. With watch-based invalidation in `withCachedReads` (§2.2 — landed), a same-file repeat read with a still-cached payload pays zero RTT. The hit benefit is "no payload over the wire" + (with the hash cache) "no discovery either". |
| **"Pipelined walk is one round-trip."** | True for any CapTP-shaped FS — Mount's lookup chains pipeline too. The endo-fs distinction is **typed pipelining**: the guard discriminates `Directory` vs `File` at the boundary, so a deep chain doesn't bottom out in an `any`-typed leaf. Phrase as "typed pipelining"; reserve "single RTT" for the cost-framework sense (no control-flow dependency). |

### 1.2 Composition primitives

- **`Layer.apply` is intentionally optimistic.**
  Earlier drafts treated this as a "transactional gap" — it isn't.
  Real transactional semantics on a generic `Filesystem` would
  require target-side journal / two-phase-commit support that
  no current backing exposes, and a "record undo ops, replay on
  failure" wrapper is fragile (undo ops themselves can fail
  under concurrent writes). `Layer.apply(target)` therefore
  just plays the buffered diff onto the target as eager writes:
  the result on success is the full diff materialised, the
  result on failure is whatever partial state the writes left
  behind. Callers that need atomicity layer it themselves — for
  example by applying onto a fresh scratch FS and then swapping
  it in.

### 1.3 Surface gaps that aren't where the design claims they are

- **`Xattrs` only works on the in-memory FS.**
  `node-fs` returns `ENOSYS` on every xattr operation (Node's `fs`
  module doesn't expose xattr syscalls); `from-mount` also returns
  `ENOSYS`.
  As a portable feature this is interface-only; only one of three
  backings implements it.
- **`OpenFile.lock` is in-process advisory only.**
  No `flock(2)` integration; locks don't propagate to other OS
  processes touching the same file.
  Useful only for cooperating clients within the same vat.
- **`Cursor.skip(n)` is O(1) per skip, but the snapshot materialisation
  underlying it is O(N) on every backing.**
  Each backing builds a list-snapshot at the first `stream()` /
  `skip()` call (in-memory: `Map.entries()`, node-fs: `fsp.readdir`,
  from-mount: `Mount.list`); after that, `skip(n)` is just a
  position-update. True O(log N) skip-to-position would need a
  sorted-index backing (B-tree, sorted directory). None of the
  current three qualifies, so the contract's O(log N) clause
  applies only to a hypothetical future backing with such an index.

### 1.4 Security gaps

_None outstanding._ `makeNodeFilesystem` now performs `realpath`-based
containment on every leaf operation (patterned after Mount's
`assertConfined`) and uses `O_NOFOLLOW` on `create` / `open` so a
leaf symlink can't hijack the open. See `src/node-fs.js`
`assertConfined` and the regression tests in `test/node-fs.test.js`
covering leaf symlinks, mid-tree symlink swap, and `O_NOFOLLOW` on
`create`.

### 1.5 Test coverage that proves less than it appears to

- **The CapTP transcript tests (`test/pipelined-rtt.test.js`,
  `test/cas.test.js`) use an in-process CapTP loopback.**
  The two vats share a Node process, an SES realm, and a heap.
  Cross-side delivery is `queueMicrotask` (or `setTimeout` for the
  latency variant) — there is no socket, no syscall, no IPC.
  The transcripts capture every `@endo/captp` wire message, so the
  *message-order properties* the snapshots pin (pipelined chain ↔
  N consecutive `CTP_CALL`s; CAS cache hit ↔ no `CTP_CALL` for
  `fetch`) are real.
  What the tests *don't* prove: real wire latency, real bytes-on-the-
  wire savings, or behavior under a real transport's failure modes.
  Same convention as `@endo/captp`'s own tests.

### 1.6 Cycle detection

Two-tier check, both run at composer construction:

- **Sync, local: Symbol-based.** `bind` / `namespace` / `compose`
  still brand each primitive Filesystem with a unique `Symbol` via
  a `WeakMap`; the sync `assertNoCycle` rejects overlapping tag
  sets immediately. Catches local cycles before any work happens.
- **Async, cross-CapTP: brand-based.** Each primitive Filesystem
  also exposes a passable `brands(): bigint[]` minted at
  construction. Wrappers union their participants' brands. The
  composer kicks off `computeBrands(name, participants)` in the
  background — every user-facing method (`root`, `named`, `statfs`,
  `brands`) awaits it, so a cross-CapTP cycle surfaces on first
  use rather than going undetected. A Filesystem cap marshalled
  out and back through CapTP reports the same brand both sides,
  so `compose(fs, remotePresenceOfFs)` rejects with a cycle error.

Participants that don't expose `brands()` (non-endo-fs caps) are
treated as brand-less for the cycle check; this is the safe fallback
— the Symbol check still applies for any local participant.
Pinned by `PATTERN: brand-based cycle detection catches a
CapTP-mediated cycle` in `test/optimal-querying.test.js`.

### 1.7 Other documented weaknesses (DESIGN §10.1)

Items from the cost-framework analysis in `DESIGN.md` §10.1 that
aren't already captured above. Where present, each cites the
`WEAKNESS:` test in `test/optimal-querying.test.js` that pins the
current behavior so the gap doesn't regress silently.

- **No field-selection on `getAttrs` — bandwidth.**
  The full `Attrs` record rides the wire even when the caller only
  needs `size`.
  POSIX-style `statx` masks were deliberately omitted to keep the
  ocap shape clean; the cost is the unmasked transfer (one
  round-trip either way).
  Pinned by `WEAKNESS [bandwidth]: no field-selection on getAttrs`
  in `optimal-querying.test.js`.

- _(closed)_ **`watch + list` TOCTOU.**
  Resolved by the new `Directory.watchFrom() → { cursor, watcher }`
  primitive (DESIGN.md §4.3): the entries cursor and the event
  watcher are both minted inside a single exo method invocation,
  so any mutation observable after `watchFrom` returns is in the
  watcher. Pinned by `PATTERN: Directory.watchFrom atomically
  snapshots entries + subscribes` in `optimal-querying.test.js`.

---

## 2. Within-package follow-ups

Owned by `@endo/endo-fs`. None of these are blocking the current PR.

### 2.1 DESIGN.md §9 F-items still open

- **F6 — `from-readable-tree.js` adapter.**
  Project an `@endo/daemon` `ReadableTree` (immutable, content-
  addressed) as a `Filesystem` whose `File`s have eager `BlobRef`s.
  The natural complement to F5's `from-mount.js`.
- **F15 — `PosixFs` companion cap.**
  POSIX `permissions`, owner (`uid`/`gid`), `chmod`, `chown`, POSIX
  ACLs as structured ops, `system.*` / `trusted.*` / `security.*`
  xattrs, and hard links (DAG relaxation of the tree invariant).
- **F16 — `LinuxFs : PosixFs`.**
  Symlinks (open questions in §9.1 of DESIGN.md), Linux capabilities,
  SELinux contexts, `asFilesystem()` projection.
- **F17 — `GraphFs`.**
  Arbitrary cap-target edges; far future; documented so the base
  interface can be honest about what it excludes.

### 2.2 Internal refactors and improvements landed

- **`src/type-guards.js` naming.**
  Renamed from `guards.js` per the `type-guards.js` convention
  (kriskowal review on PR #326). Centralises every `M.interface`
  consumed by the implementations.
- **Symlink-safe `makeNodeFilesystem`** (§1.4).
  `realpath`-based containment on every leaf op + `O_NOFOLLOW` on
  `create` / `open` so a leaf symlink can't hijack the open.
  Closes the only outstanding security gap; was the prerequisite
  for §3.3 phase 1 of the daemon refactor.
- **`assertChildName` consistency across all three backings.**
  In-memory now validates names on `lookup` / `create` / `mkdir`
  / `unlink` / `rename`, matching node-fs and from-mount.
- **Streaming `Layer.apply`.** `enumerateLayerOps` emits files
  in 1-MiB chunks plus a terminal `truncate` instead of one
  giant `Uint8Array`; bounds the per-op allocation and CTP_CALL
  payload for files of arbitrary size.
- **Range-only `cacheBackedRead({ offset, length })`.** Returns
  a slice of the cached payload; still fetches the full blob on
  a miss (CAS contract is whole-blob).
- **LRU eviction for `makeMemoryCas({ capacity })`.** `put`
  evicts least-recently-used on overflow; `get` re-inserts to
  the back. Keeps memory bounded for long-running consumers.
- **Watch-based hash cache in `withCachedReads`.** Subscribes to
  each File's `watch()` at first read; subsequent reads with a
  known hash and a still-cached payload pay zero RTT.
- **`Directory.materialise(path, opts)` primitive** (§1.7
  formerly).
  Server-side lookup-or-create across N segments; one CapTP RTT
  regardless of depth.
- **`Directory.watchFrom() → { cursor, watcher }`** (§1.7
  formerly).
  Atomic snapshot + subscribe; closes the `list + watch` TOCTOU
  race.
- **Cross-CapTP cycle detection via `Filesystem.brands()`**
  (§1.6).
  Two-tier (sync `Symbol` for local + async `bigint`-set for
  CapTP-marshalled participants).
- **`compose` composition primitives** — `statfs` aggregation,
  merged `watch` events, auto-copy-up of parent directories,
  file-AND-directory `rename` via copy-up + whiteout.

### 2.3 More-realistic CAS / pipelined-rtt tests

- **Wire-latency variant of the CAS test.**
  The harness already supports `deliveryLatencyMs`; add a "hit
  completes faster than miss" assertion to back the wall-clock
  claim.
- **Payload-bytes accounting in the transcript.**
  Capture `msg.method.body.length` and the resolved bytes from
  `CTP_RETURN`s; assert "miss transferred N bytes; hit transferred
  0."
- **`worker_threads` transport variant.**
  Run the right vat in a `worker_thread` connected over a
  `MessageChannel`.
  Heavyweight; not standard in the Endo ecosystem.
  Worth doing only when a specific transport-level claim needs
  evidence.

---

## 3. Endo daemon refactor (separate track)

This is **not** within-package work.
It is the larger initiative kumavis was pointing at on PR #326 with
"replace mount with this filesystem in an upcoming change."
Capturing it here so the boundary between this PR and that
initiative is explicit.

### 3.1 Scope

Replace `@endo/daemon`'s `Mount` / `MountFile` / `ScratchMount` with
adapters or first-class wrappers over `@endo/endo-fs` `Filesystem`,
and migrate consumers (daemon-internal and downstream).

### 3.2 Gaps the refactor would close

Each of these is something `Mount` provides today that
`@endo/endo-fs` doesn't, and that the refactor would either fold in
or replace:

- **`provideMount(path, petName, opts)` as a formula type.**
  Mount is wired into `@endo/daemon`'s formula graph; the cap
  reincarnates across daemon restart, is registered in the petstore,
  and is reachable through the form workflow.
  `@endo/endo-fs` has none of this — `makeNodeFilesystem` is a
  library call, not a daemon-side provisioning verb.
- **`ScratchMount`** — daemon-managed scratch directory.
  No endo-fs analogue.
- _(closed)_ **`realPath`-based confinement** — `makeNodeFilesystem`
  now performs `realpath`-based containment on every leaf op with
  `O_NOFOLLOW` on `create` / `open`. See §1.4 / §2.2. This was the
  prerequisite for any daemon-side replacement; it's now in place.
- **`ReadableTree` integration.**
  Mount-world has `ReadableTree.sha256()` for tree-level content
  addressing.
  Remote-fs has file-level `BlobRef.hash` and `Layer.readOnly()`
  (an authority attenuator, not a content snapshot) but no
  tree-level Merkle hash.
  The refactor either re-implements `ReadableTree` on top of
  `Filesystem` (a content-addressed snapshot cap that pairs the
  authority attenuation with a tree hash), or keeps it as a
  separate immutable-snapshot cap.
- **Text-convenience methods.**
  `readText` / `maybeReadText` / `writeText` / `json` — one-line
  whole-file operations.
  Could land as helpers in `@endo/endo-fs` (`src/text-helpers.js`)
  or as a thin Mount-compat wrapper in the daemon.

### 3.3 Migration sequencing (suggested)

The refactor naturally splits into phases that can land independently:

1. ✅ **Symlink-safe confinement in `makeNodeFilesystem`.**
   _Landed in §1.4 / §2.2._ `realpath`-based containment on every
   leaf op + `O_NOFOLLOW` on `create` / `open`. The prerequisite
   for any daemon-side replacement is now in place.
2. **`provideRemoteFs(path, petName, opts)` formula type.**
   Mirror `provideMount`'s formula lifecycle (disk-before-graph etc.
   per `@endo/daemon/CLAUDE.md`).
3. **`MountInterface`-compat wrapper.**
   Thin shim that satisfies the `EndoMount` interface guard by
   delegating to a `Filesystem`.
   Lets existing Mount consumers migrate without code changes.
4. **`ScratchMount` analogue.**
5. **`ReadableTree` integration** (decision point: keep separate cap
   or land a content-addressed snapshot cap that pairs
   `Layer.readOnly()`'s authority attenuation with a tree hash).
6. **Deprecate `@endo/daemon/src/mount.js`.**
   Once all callers route through `provideRemoteFs` + the compat
   wrapper, drop the original Mount implementation.
7. **Delete `from-mount.js`** in the same wave.
   Per kumavis review (PR #326): "we should consider deleting this
   file. instead we can look to replace mount with this filesystem
   in an upcoming change."
   The from-mount adapter exists only to bridge old → new;
   once Mount is gone, it has no purpose.

Each phase is its own PR; nothing about phase N forces phase N+1.

### 3.4 What's deliberately out of scope here

- This file does not propose a timeline for §3.
- This file does not specify the API of `provideRemoteFs` — that's a
  design decision for the daemon refactor's own design doc.
- Cross-realm / cross-process FS sharing (a `@endo/daemon` consumer
  pulling a `Filesystem` from another daemon over OCapN) is a third
  track, distinct from both §2 and §3.

---

## Cross-references

- `DESIGN.md` §9 — feature plan (F1–F17 with status).
- `DESIGN.md` §10.1 — cost framework and round-trip weaknesses,
  including the `[RT]` items §1.1 pulls from.
- PR #326 review thread — origin of items in §1.6 and §3.2.
- `@endo/daemon/src/mount.js` — prior art for symlink-safe
  containment (§1.4, §3.2).
