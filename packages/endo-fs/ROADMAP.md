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

### 1.1 Performance claims that don't yet hold

| Claim | Reality | Resolution path |
|---|---|---|
| **"Eager qid avoids a round-trip."** §4.10 of DESIGN promises that `Node.qid` is carried alongside the cap's slot and readable without CapTP traffic. | `getQid()` is a regular exo method; CapTP doesn't ship state alongside slots, so every call costs one RTT. See §10.1 of DESIGN.md (`[RT] getQid is one round-trip across CapTP`). | Wait for CapTP to gain passable-cap-state; until then, callers should cache qids client-side after the first lookup. |
| **"Eager `BlobRef.hash` + `size` avoid a round-trip."** Same §4.10 promise. | `getInfo()` is a regular exo method — one RTT per call. The CAS cache-hit test still pays one RTT for `getInfo` before serving from cache. | Same as above. The CAS win is on *payload bytes* saved, not RTT count. |
| **"CAS-cached read skips the network entirely on cache hit."** | True for the `fetch` call and the bytes payload, false for the `getInfo` RTT that precedes it. For small files where the payload is comparable to the `getInfo` envelope, the optimization may not pay off. | Document the break-even (file-size dependent). Add `cacheBackedRead(blobRef, cas, { hash })` overload that lets callers who already know the hash skip the `getInfo` round-trip. |
| **"Pipelined walk is one round-trip."** | True in the sense that the `CTP_CALL` messages go out without intermediate awaits — proven by `test/snapshots/pipelined-rtt.test.js.md`. But Mount's lookup chains also pipeline through CapTP. The endo-fs *unique* advantage is **typed pipelining** (the guard says lookup returns `Directory \| File`), not pipelining-in-general. | Phrase claims as "typed pipelining" rather than "pipelining"; reserve "single RTT" for the cost-framework sense (no control-flow dependency). |

### 1.2 Composition primitives — known functional gaps

These are documented in DESIGN.md §10.1's weakness table; pulling them
into one place here.

- **`compose.rename` returns `ENOSYS`.**
  A rename that crosses the CoW boundary needs whiteout + create +
  possibly copy-up.
  Workaround: caller does `lookup` → `read` → `create` → `write` →
  `unlink` manually.
- **`compose.watch` only surfaces layer events, not backing events.**
  `compose` returns `layerDir.watch()`; backing mutations don't fire.
  Workaround: subscribe to each participant separately.
- **`compose` doesn't auto-copy-up parent directories.**
  Creating a new file under a directory that exists only in the
  backing errors `EROFS`.
  Workaround: pre-`mkdir` matching parent paths in the layer.
- **`Layer.apply` is not transactional.**
  A failure partway through leaves the target in a partial state.
  v2 plan in DESIGN.md §10: `apply` returns a sub-cap with
  `commit()` / `rollback()`.

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
- **`Filesystem.statfs` doesn't aggregate across mounts.**
  `namespace`/`bind` return zeros from their participants' `statfs`;
  no cross-mount aggregation. In-memory and from-mount also return
  zeros — only `node-fs` reports real values.
- **`Cursor.skip(n)` is O(n) for `in-memory` and `from-mount`.**
  The interface contract permits O(log n) on sorted-index backings,
  but only the disk-backed implementation could realistically do
  better.

### 1.4 Security gaps

- **`node-fs.js` does not resolve symlinks for containment.**
  `assertChildName` rejects `/` and `NUL` in names, but the
  implementation joins paths with `nodePath.join` and calls
  `fsp.stat` without `realpath` resolution. A symlink that exists
  inside the rooted tree and points outside it would be walked
  through.
  `@endo/daemon`'s `Mount` uses `realPath(target).startsWith(realPath(root))`
  and is the prior art for the safe pattern.
  **Until this is fixed, callers should not hand a `makeNodeFilesystem({ rootPath })` cap
  to untrusted code if the underlying directory might contain
  attacker-controlled symlinks.**

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

- **Eager-only.** `bind` / `namespace` / `compose` check participant
  tags at construction time and reject overlapping sets.
  Once a composed `Filesystem` cap has been minted, an adversarial
  cap-passing pattern (e.g., re-introducing the same cap through a
  third-party CapTP connection) can defeat the check.
  Documented as the chosen tradeoff in DESIGN.md §10's open questions;
  the lazy-traversal alternative would cost every `lookup` a tag-set
  check.

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

### 2.2 Internal refactors

- **Consider deleting `src/guards.js`.**
  Per kumavis review (PR #326): "we should consider deleting this
  file. instead we can look to replace mount with this filesystem in
  an upcoming change."
  Currently this module centralises every `M.interface` consumed by
  the implementations; folding the guards into the implementations
  (or removing them when the Mount-replacement lands) is the
  refactor.
  Decision deferred pending §3 below.

- **`assertChildName` consistency across the three backings.**
  Currently exported from `shared/helpers.js` and used by `node-fs`
  and `from-mount`; `in-memory` doesn't call it.
  Adding name validation to `in-memory` is a strictly-tightening
  change — should land with a behavioural-change note.

- **Range-only `cacheBackedRead`.**
  Current consumer reads the whole blob into the CAS.
  Add a `cacheBackedRead(blob, cas, { offset, length })` overload
  that serves a range from the cached bytes; on miss, still fetches
  the whole blob (for cache coherence).

- **Streaming `Layer.apply`.**
  `enumerateLayerOps` materialises each file's full content into a
  single `write-bytes` op.
  For files larger than `~1 MiB` this should chunk into multiple
  ops, or stream into a `write` writer rather than allocating the
  full `Uint8Array`.

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
- **`realPath`-based confinement** (see §1.4).
  `Mount.assertConfined` resolves symlinks before checking
  containment.
  When the refactor ports this into `makeNodeFilesystem` it closes
  endo-fs's only outstanding security gap.
- **`ReadableTree` integration.**
  Mount-world has `ReadableTree.sha256()` for tree-level content
  addressing.
  Remote-fs has file-level `BlobRef.hash` and `Layer.seal()` but no
  tree-level Merkle hash.
  The refactor either re-implements `ReadableTree` on top of
  `Filesystem` (probably as a sealed `Layer` + tree hash), or keeps
  it as a separate immutable-snapshot cap.
- **Text-convenience methods.**
  `readText` / `maybeReadText` / `writeText` / `json` — one-line
  whole-file operations.
  Could land as helpers in `@endo/endo-fs` (`src/text-helpers.js`)
  or as a thin Mount-compat wrapper in the daemon.

### 3.3 Migration sequencing (suggested)

The refactor naturally splits into phases that can land independently:

1. **Symlink-safe confinement in `makeNodeFilesystem`.**
   Port Mount's `realPath`-based check.
   This is the prerequisite — without it, the daemon-side replacement
   would be a security regression.
2. **`provideRemoteFs(path, petName, opts)` formula type.**
   Mirror `provideMount`'s formula lifecycle (disk-before-graph etc.
   per `@endo/daemon/CLAUDE.md`).
3. **`MountInterface`-compat wrapper.**
   Thin shim that satisfies the `EndoMount` interface guard by
   delegating to a `Filesystem`.
   Lets existing Mount consumers migrate without code changes.
4. **`ScratchMount` analogue.**
5. **`ReadableTree` integration** (decision point: keep separate cap
   or fold into `Layer.seal()` + tree hash).
6. **Deprecate `@endo/daemon/src/mount.js`.**
   Once all callers route through `provideRemoteFs` + the compat
   wrapper, drop the original Mount implementation.
7. **Delete `from-mount.js` and (per kumavis) consider deleting
   `guards.js`** in the same wave.
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
