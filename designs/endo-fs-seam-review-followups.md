# Code review feedback — endo-fs backend seam refactor (PR #373)

| | |
|---|---|
| **Source** | Critical design review (sub-agent, 2026-05-28) |
| **Branch** | `claude/keen-bell-W1acD` |
| **Status** | Reference (intake; addressed inline by follow-up commits) |

This document captures the findings from a critical post-merge design
review of the FsBackend seam refactor. It is the working list for the
follow-up cleanup pass; entries are checked off as fixes land.

## 1. Three-layer split / FsBackend shape

### 1a. `statfs` is probed but undeclared in the protocol — design-issue

- `wrap-backend.js` `probeCapabilities` reads `backend.statfs?` and
  the Filesystem exo dispatches to it.
- `backend-types.js` `FsBackend` typedef has no `statfs` property.
- The "6 required + 5 optional" comment in `wrap-backend.js` and the
  design doc is wrong; the actual set is 6 + 6 (counting statfs).
- **Fix**: add `statfs?` to the typedef; update every "5 optional"
  / "5 methods" comment.

### 1b. `hash?` is declared optional but never used — cleanup verging on design-issue

- `backend-types.js` declares `hash?`. `wrap-backend.js`
  `probeCapabilities` reads `caps.hash`. Nothing in wrap-backend or
  the public surface ever reads `caps.hash`.
- `BlobRef` computes its own SHA-256 on captured bytes in
  `shared/blobref.js`; never consults the backend.
- `node-fs-backend.js` implements `hash(path)`. No consumer can
  reach it.
- **Fix**: either remove `hash?` from the protocol + the node-fs
  impl + the cap probe, or wire it through a `File.contentHash()`
  porcelain that prefers `backend.hash?` and falls back to
  read+sha256. Dangling optionals erode trust in the protocol.

### 1c. `kind() | undefined` doubles as "not found" — nit

- Backends overload one return for "missing path" and "kind I don't
  expose" (node-fs uses `undefined` for sockets/symlinks).
- The Filesystem exo treats `kind === undefined` as ENOENT
  uniformly, so a socket on disk presents as ENOENT — a small lie.
- **Fix**: document explicitly in `backend-types.js` that the base
  tree-only model treats non-{file,directory} entries as missing.

### 1d. `rename` is optional but effectively required for directories — nit

- Files can fall back to copy+remove. Directories throw
  `notSupported('rename of directory without backend.rename')` — a
  sharp footgun.
- **Fix**: either promote `rename` to required, or document the
  "required for moving directories" boundary in the typedef.

## 2. Dual new/legacy method surface

### 2a. Permanent kludge with no migration path — design-issue

- `wrap-backend.js` "Legacy" methods (`getQid`, `getAttrs`,
  `setAttrs`, `xattrs`, `mkdir`, `unlink`) are not actually legacy:
  they are the *only* methods declared in `NodeBaseMethods` and
  `DirectoryInterface`.
- The "new" methods (`getStat`, `setStat`, `makeDirectory`, `remove`)
  leak through *only* because of `sloppy: true`. The situation is
  the inverse of what the comments imply: the interface formally
  guarantees the legacy names; the new names are unguarded.
- `setStat` and `setAttrs` are 30-line near-verbatim copies of each
  other (lines 782–811 vs 831–860). Same for `getStat`/`getAttrs`.
  Maintenance trap: every fix must be made twice.
- The design doc reads as if these had been deleted from
  `NodeBaseMethods`. They were not.
- **Fix**: decide. Either (a) delete the legacy block, update the
  interface to declare the new names, and add a thin shim
  (`legacy-shim.js`) for consumers that need the old names, or (b)
  commit to dual-surface and de-duplicate the shared body into a
  single helper called from each method. Don't leave it as parallel
  code claiming "legacy" while the interface guard says otherwise.

### 2b. The new methods have no interface guarantee — design-issue

- A consumer programming to `remove` / `makeDirectory` / `getStat`
  / `setStat` is relying on `sloppy: true` plus implementation
  accident.
- **Fix**: add the new methods to the interface declarations (even
  if the legacy entries stay). That's the job of an interface guard.

## 3. `sloppy: true` on every public interface

### 3a. Defeats the purpose of guards — design-issue

- `type-guards.js` ships `sloppy: true` on every interface (Filesystem,
  Directory, File, Cursor, OpenFile, Xattrs, NodeWatcher, BlobRef).
- New methods can land anywhere without a guard change; nothing
  fails-loud when a consumer accidentally calls a missing method;
  CapTP wire-shape changes are invisible to the type system.
- The justification ("New methods land in wrap-backend.js … while
  these guards stay focused on the canonical wire shape") is
  backwards: if the guards are the canonical wire shape, they
  should track the implementation, not lag it.
- **Fix**: smaller escape — three options:
  1. (preferred) Add the new methods to the interface declarations
     and drop `sloppy: true`. Use a versioned `M.interface` if
     forward-compat is needed (newer extends older).
  2. Keep `sloppy: true` only on the *evolving* interfaces
     (Filesystem, Directory, File) and tighten the others (Cursor,
     OpenFile, Xattrs, NodeWatcher) which are not evolving.
  3. Replace with explicit method-list union: declare both old and
     new names in the guard.

## 4. Vat-local stat / xattr tables

### 4a. Empty xattrs after restart, stale mtime on node-fs — design-issue (correctness regression)

- The xattrTable is vat-local. A daemon restart, or even a second
  `makeNodeFilesystem({rootPath})` call in the same vat, loses
  every xattr ever set.
- For mtime/atime, `getStat()` returns the wrap-backend's vat-local
  mtime (initialized to "now" on first observation), *not* the real
  disk mtime. An external `touch file` won't be visible. A fresh
  `makeNodeFilesystem({rootPath})` over a populated disk reports
  made-up timestamps.
- The class of bug is "vat thinks it owns stats it does not in fact
  own."
- **Fix**: add `backend.getStat?(path)` to the protocol. Have
  wrap-backend prefer the backend's value over `statOf(path)`; the
  vat-local table becomes a fallback for toy backings, not a
  divergent source of truth.

### 4b. No invalidation on rename or remove — bug

- `backend.rename(src, dst)` moves data; xattrTable entries keyed
  by `lockKeyOf(src)` and statTable entries stay under the old key.
- After `remove(path)`, the same orphaned entries remain forever.
- For rename: an xattr set on `/a/foo`, renamed to `/b/foo`, will
  report ENODATA on the new path and still exists under the old
  path — a later `create('/a/foo')` will inherit ghost xattrs.
- A long-running daemon's tables grow without bound.
- **Fix**: in `Directory.rename`, `Directory.remove`, and the
  parent's `Directory.unlink`, sweep xattrTable, statTable, and
  localSubs for keys matching `path` or prefixed `path + SEP`. For
  rename, transplant entries to the new key. Mirror the in-memory
  backend's subtree-walk at lines 245–261.

### 4c. `dirPaths` WeakMap is keyed by ephemeral exo identities — cleanup (latent bug)

- The WeakMap stores the path *at construction time*; if the
  directory is renamed, entries continue to refer to the old path.
- The wrap-backend mints a fresh Directory exo on every `lookup`
  (line 1057), so the WeakMap is keyed by ephemeral identities;
  long-lived directory references that survive many lookups end up
  with multiple exo identities mapping to the same path.
- **Fix**: for stale paths after rename, recompute the path or
  invalidate. For ephemeral identities, either cache canonical
  Directory exos by `lockKeyOf(path)` in a regular Map, or
  document that lookup returns fresh exos.

## 5. CapTP wire-shape compromise

### 5a. Deviation documented but body still describes original promise — design-issue (docs)

- The "Design deviation" sub-block explains the issue clearly.
- The main body — including the 9P wire-mapping table — still claims
  `read` returns `Uint8Array` directly. A reader picking up the doc
  finds conflicting statements separated by 300 lines.
- The "Critical wire-efficiency changes" section, the `type-guards.js`
  change-list, and the "git grep unlink returns zero hits" exit
  criterion all describe deletions that were not performed.
- **Fix**: 30-minute pass on the doc to fold the deviations into the
  body. Move the Status acknowledgments into the relevant
  subsections. Strike or mark "Deferred to follow-up" any deletion
  claim that wasn't executed.

### 5b. Single-RTT bounded read claim isn't pinned by a test — nit

- `wrap-backend.test.js` `walk + File.read pipelines` asserts the
  bytes round-trip but does not assert the RTT count.
- **Fix**: add an explicit RTT-count assertion using the
  `pipelined-rtt` harness so the "still one RTT under pipelining"
  claim is regression-protected.

### 5c. No recorded "alternatives considered" — nit

- Future contributors will re-litigate why `Uint8Array` doesn't
  work, why not base64 envelopes, etc.
- **Fix**: add a 6-line "Alternatives considered" block to the
  deviation note.

## 6. `PosixFs` scaffold

### 6a. Premature scaffolding that misleads — design-issue

- `synthesizePosixFs(_fs)` exports an interface and a synth impl
  that's actively misleading. Calling `posix.attrs(node)` returns
  `mode: 0o644` for every file regardless of disk state.
- `setAttrs` accepts the call but throws on the only non-trivial
  fields — the "accepts call but rejects patch" anti-pattern.
- Worse than not existing: gives consumers a misleading "I am a
  PosixFs cap" signal.
- **Fix**: either pull it from the PR entirely and reintroduce when
  the real PosixFs backend lands, or rename to
  `synthesizePosixFsForTests` and drop the `index.js` export. The
  current export invites real consumers to depend on a stub.

### 6b. Unused `_fs` parameter is a smell — nit

- `synthesizePosixFs(_fs)` doesn't use `fs`; `attrs(node)` reads
  via E directly from the node remotable.
- The CLAUDE.md guidance says don't rename intentionally-unused
  params with underscore (conflicts with `no-underscore-dangle`).
- **Fix**: drop the parameter; make this `synthesizePosixFs()`.

### 6c. `btime: stat.mtime ?? null` mixes `null` and `bigint` — bug (interface drift)

- Other timestamp fields are `bigint`. Mixing `null` for btime
  breaks any consumer doing arithmetic on the field. `sloppy: true`
  doesn't catch this.
- **Fix**: use `0n` for "unknown" or document the polymorphic shape.

## 7. Mutual recursion forward refs

### 7a. Acceptable shape; `eslint-disable` is targeted wrong — nit

- The `let`-then-assign-arrow shape works and is fine.
- `prefer-const` flags the declaration, not the assignment. The
  `eslint-disable-next-line prefer-const` comments are placed
  before the *assignments* (lines 766, 979) — wrong target.
- **Fix**: either (preferred) extract the bodies into top-of-module
  helper function declarations taking a `ctx` object, or just
  delete the dead `eslint-disable` lines at the assignment sites.

## 8. `touch()` semantics

### 8a. Vat-local stat drifts from disk — design-issue (correctness regression)

- Already captured under #4a. The vat-local table is the source of
  truth for getStat/getAttrs even on node-fs, where disk has its
  own mtime/atime that diverges.
- **Fix**: as in 4a, add `backend.getStat?(path)` and have
  wrap-backend prefer it over the vat-local table.

## 9. Test cheats / weakness checks

### 9a. `drainEvents` races a timer — nit

- `wrap-backend-fixes.test.js:48-67` uses a 50ms inner sleep and 1s
  outer deadline. Race-prone on slow CI.
- **Fix**: have the producer signal explicit completion rather than
  racing a timer.

### 9b. Watcher pump test could flake — nit

- `wrap-backend-fixes.test.js:181-217` races a 1.5s timer; if the
  pump beats `close` to reporting, may flake.
- **Fix**: assert both `done: true` and that a second `next()` also
  returns done.

### 9c. from-mount tests only pin the negative path — nit

- Tests assert `lookup` throws synthetic errors match a substring;
  a real Mount cap throwing the same shape would pass without
  invoking the new try/catch.
- **Fix**: add a positive case where mount's `lookup` throws ENOENT
  and the backend returns `undefined`.

### 9d. "legacy mkdir alias works" only checks the return type — nit

- Doesn't verify legacy semantics (idempotency on existing dirs,
  EEXIST on file collisions).
- **Fix**: add the missing assertions if dual-surface is permanent;
  delete the test if the legacy block goes away.

### 9e. from-mount `list()` catch-and-ignore swallows real errors — bug (missed sibling of #11)

- `from-mount-backend.js:123-128`:
  ```js
  try {
    const child = await E(mount).lookup(name);
    kind = await probeMountChild(child);
  } catch {
    kind = undefined;
  }
  ```
- A connection error during enumeration silently drops the entry.
- Same fix-shape as `resolve()` (commit 338c83d3) — re-raise non-ENOENT.

### 9f. `posix-fs.test.js` pins the bad PosixFs behavior — design-issue

- `posix-fs.test.js:39-49` tests that `setAttrs(root, {mode})`
  throws ENOSYS. This is the "accepts call but rejects patch"
  anti-pattern from #6 — the test calcifies the wrong design.
- **Fix**: rewrite when PosixFs is reshaped per #6a.

### 9g. `@ts-nocheck` everywhere in test files — nit

- Wrap-backend, wrap-backend-fixes, posix-fs tests all opt out of
  type checking. Combined with `sloppy: true` interfaces, we've
  removed all type-driven feedback.
- **Fix**: at least pin the `wrap-backend-fixes.test.js` regression
  tests with `@ts-check` so future drift is caught.

## 10. Is `wrapBackend` doing too much?

### 10a. Yes, but the split isn't urgent — cleanup

- 1211 lines, many orthogonal concerns:
  - capability probing
  - Qid synth
  - xattr table + Xattrs exo (~100 lines)
  - stat table + touch (~40 lines)
  - lock table + key (~10 lines)
  - dirPaths WeakMap (~10 lines)
  - local event bus (~30 lines)
  - Cursor exo (~110 lines)
  - NodeWatcher exo (~100 lines)
  - OpenFile exo (~120 lines)
  - File exo (~210 lines, doubled by legacy duplication)
  - Directory exo (~190 lines)
  - Filesystem exo (~40 lines)
- The forward-ref shape forces `makeFileExo` and `makeDirectoryExo`
  to live together; Cursor and NodeWatcher are essentially
  standalone.
- **Fix** (incremental):
  1. Extract `makeCursorExo` and `makeNodeWatcherExo` to their own
     files.
  2. Extract `synthQid` into `shared/qid.js` (pure).
  3. Extract `makeXattrsExo` to `shared/xattrs-exo.js`.
  4. Extract `touch`/`statOf` into `shared/stat-table.js`.
- Not blocking, but treat the 1200-line module as a code smell.

## 11. from-mount: real errors mixed with ENOENT in some paths

### 11a. `list()` swallows non-ENOENT errors per-child — bug

- Same class as fix #19 (commit 338c83d3), missed in the same
  backend.
- See 9e.

### 11b. `probeMountChild` swallows everything — cleanup

- `from-mount-backend.js:61-79` — any non-introspectable cap is
  treated as "unknown kind." For a corrupt Mount that throws on
  `__getMethodNames__`, this surfaces as ENOENT.
- **Fix**: at least add a comment justifying why introspection
  failure is treated as "not present."

### 11c. `read()` and `write()` look correct — nit

- Drain re-throws; no try/catch wrapping. Documented at lines
  140–141 and 179.

## 12. Documentation quality

### 12a. Design doc describes original aspiration; deviation pin doesn't reconcile body — design-issue (docs)

- The body (lines 197–500) describes the original plan; the
  deviations are in the status section and a brief inline note.
- Specific drifts:
  - Lines 380–401 describe deletion of `getAttrs`/`setAttrs`/`getQid`/
    `xattrs` from `NodeBaseMethods`. Not done.
  - Lines 456–460 claim `OpenFile.read` returns `Uint8Array` directly.
    Doesn't.
  - Lines 639–655 list "Delete `getAttrs`…" as a type-guards change
    item. Not done.
  - Lines 720–722 require `git grep -nE '\bunlink\b'` returns zero
    hits. Multiple hits remain.
  - Phase 5 ("no code changes needed for compose / readonly / …")
    is presented as architectural success but is really evidence
    the deletion plan was abandoned.
- **Fix**: 30-minute editing pass to fold deviations into the body.
  Strike claims that weren't executed; mark deferred items inline.

### 12b. "Net LOC change" table is misleading — nit

- Counts the legacy-block duplication inside `wrap-backend.js` as
  shared upper layer. The "net ~300 lines removed" claim is
  plausible only by treating the legacy methods as zero-cost.
- **Fix**: update the table after the legacy block is reshaped per
  #2a.

## Cross-cutting summary

- The **seam shape is sound** — 7 (counting statfs) + 1 (counting
  the unused hash) methods is the right ballpark.
- The **execution is half-shipped**. Biggest gap: the design
  promised three deletions (xattrs/attrs/getQid from
  `NodeBaseMethods`) that were not made. The legacy block in
  `wrap-backend.js` is the visible scar.
- `sloppy: true` on every interface is the single most consequential
  design smell. Tightening these guards is the highest-leverage
  cleanup.
- The **stat/xattr tables are vat-local with no eviction, no
  rename-tracking, and shadow disk state for node-fs**. The most
  likely correctness bug to bite a real consumer.
- The **from-mount `list()` error handling** missed the fix that
  `resolve()` got — a 4-line follow-up.
- The **PosixFs scaffold should not be exported** until it has a
  real backend; right now it actively misleads.
- **Doc-vs-code drift** is real but bounded to one file.

## Priority order for follow-up

1. (correctness) Add `backend.getStat?` and wire wrap-backend to
   prefer it — fixes node-fs disk mtime regression. (4a, 8a)
2. (correctness) Add stat/xattr cleanup on rename/remove. (4b)
3. (cleanup) from-mount `list()` re-raise non-ENOENT. (9e, 11a)
4. (cleanup) Add `statfs` to FsBackend typedef. (1a)
5. (cleanup) Remove or wire `hash?`. (1b)
6. (design) Reshape PosixFs — drop misleading synth or unexport. (6)
7. (design) Tighten interface guards — add new methods formally,
   drop `sloppy: true` from non-evolving interfaces. (2b, 3a)
8. (design) Deduplicate the legacy block — factor shared bodies. (2a)
9. (cleanup) Doc reconciliation pass. (5a, 12a, 12b)
10. (cleanup) Test improvements — `@ts-check`, race tightening,
    drop the bad-behavior-pinning posix-fs test. (9a, 9b, 9g, 9f)
11. (cleanup, deferred) Extract Cursor / NodeWatcher / Qid /
    Xattrs / stat-table modules. (10a)
12. (cleanup) Remove dead `eslint-disable prefer-const` at
    assignment sites. (7a)
