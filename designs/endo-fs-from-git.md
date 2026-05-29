# `@endo/endo-fs` from-git Adapter

| | |
|---|---|
| **Created** | 2026-05-28 |
| **Updated** | 2026-05-28 |
| **Author** | kumavis (prompted) |
| **Status** | In Progress |

> **Read after:**
> - [daemon-git-capability](daemon-git-capability.md) — the `Git` cap this design extends with one method.
> - [endo-fs-backend-seam](endo-fs-backend-seam.md) — the `FsBackend` + `wrapBackend(...)` architecture this adapter targets.
> - The `@endo/endo-fs` `README.md` and `DESIGN.md` — the `Filesystem` / `Directory` / `File` / `OpenFile` shape this adapts to.

## Status

Phase 1 + 2 + 3 + a slice of Phase 4 landed on `claude/adoring-planck-GmRX2`, rebased on `claude/keen-bell-W1acD`:

- `Git.filesystemAt(ref)` exposed on `EndoGit` (`packages/daemon/src/interfaces.js`, `packages/daemon/src/types.d.ts`).
- `GitBackend` contract extended with `resolveTree`, `lsTree`, `readBlobBytes`, `streamBlobBytes` (`packages/daemon/src/git.js`); native git backend exposes the same as public methods (`packages/daemon/src/native-git-backend.js`).
- Adapter lives at `packages/daemon/src/git-filesystem.js` and exports `makeGitFsBackend({ backend, treeOid })` — an `FsBackend` implementation (per `endo-fs/src/backend-types.js`).
  The daemon wraps it as `readOnly(wrapBackend(makeGitFsBackend(...), { description }))` so write verbs reject with `EACCES` at the cap boundary.
- Tests in `packages/daemon/test/git.test.js` cover shape, lookup, range reads, BlobRef, directory listing, mutation rejection, OID memoization, and submodule hiding.

The on-disk design was revised after rebase: the upstream `@endo/endo-fs` seam refactor introduced `FsBackend` + `wrapBackend(...)`.
The original plan called for hand-rolling the full `Filesystem` / `Directory` / `File` / `OpenFile` exo graph; that turned into a tiny `FsBackend` adapter (6 required + 2 optional methods, ~150 lines) and the upstream `wrapBackend` builds the rest.

Two original design choices were dropped as a consequence:

1. **QID `pathId` is no longer the git OID as BigInt.**
   `wrapBackend` synthesizes QIDs via `synthQid(path, kind)` from a path hash.
   Two paths pointing at the same blob therefore report different QIDs — git-style content-address equivalence is not preserved at this layer.
2. **`BlobRef.algorithm` is `'sha256'`, not `'git-sha1'`.**
   The shared `makeBlobRefExo` SHA-256s the captured bytes; the git blob OID is not exposed through the `BlobRef` surface.

Both can be reintroduced as a Phase 5 follow-up (a `synthQidFromOid` option on `wrapBackend`, or a wrap-backend extension hook that lets a backend supply its own QID / hash), but the trade-off — ~200 lines of bespoke exo plumbing versus reusing the shared seam — went the other way given the seam refactor's recent simplification.

## Summary

Add a method `Git.filesystemAt(ref)` to `EndoGit` that returns an `@endo/endo-fs` `Filesystem` lazily backed by the git object database at the given ref's tree.
The Filesystem is immutable: blob reads stream via `git cat-file blob` and directory listings stream via `git ls-tree`.

> The text below describes the original design intent — Section §1 in the prompt was for the version that hand-rolled the `Filesystem` / `Directory` / `File` / `OpenFile` exo graph.
> The shipped implementation targets the upstream `wrapBackend(...)` seam instead and is described in the `## Status` section above; the QID-from-OID and `git-sha1` BlobRef claims in this section are NOT what shipped.
> See the Status section for the authoritative current contract.

`Git.filesystemAt` is the first daemon-side bridge between the `Git` capability and the `@endo/endo-fs` filesystem vocabulary.
The daemon's `EndoMount` and `@endo/endo-fs`'s `Filesystem` remain separate surfaces — the existing one-way `from-mount.js` adapter in `endo-fs` is the only bridge between them, and this design does not unify them.
The new method bypasses `EndoMount` entirely; it builds the `Filesystem` view directly from git's object database via the daemon's existing `GitBackend` primitives.

## What is the Problem Being Solved?

The current `Git.tree(ref)` method returns an `EndoReadableTree` — the minimal `has`/`list`/`lookup` read-surface vocabulary from `@endo/daemon`.
It is sufficient for compartment-mapper imports and other generic tree consumers, but it is structurally lossy for callers that already speak `@endo/endo-fs`:

- no range reads — full-blob fetch per `lookup`-then-read pair;
- no QID identity — callers cannot deduplicate references to the same content;
- no `BlobRef` — no path into `@endo/endo-fs`'s CAS-backed read cache (`withCachedReads`);
- no `Cursor` paginated listing — large directories materialize their full entry list per call;
- no `brands()` — cannot participate in `compose` / `bind` cycle detection;
- the `from-mount.js` adapter (Mount → endo-fs) uses path-hashed QIDs and `version: 0n`, which is a sound choice for a *live* worktree but a worse fit for an immutable historical tree where the natural QID source is the OID itself.

The `@endo/endo-fs` README already names the gap:

> | Immutable snapshot | `@endo/daemon` `ReadableTree` | `Node.snapshot() → BlobRef` for content-addressed sub-trees. |

This design fills that row, for the git case specifically.

## Goals

1. Expose a git commit's tree as an `@endo/endo-fs` `Filesystem` without materializing entries that are not read.
2. Make blob OIDs the QID and `BlobRef` hash — give content-addressed callers a strong identity to dedupe and cache against.
3. Stay backend-agnostic at the daemon-internal contract level — `NativeGitBackend` is the first implementation, but a future JS git backend or HTTPS smart-protocol client should be able to implement the same backend method set.
4. Reject mutation cleanly. Git history is immutable, so the Filesystem is natively read-only — no `readOnly(writableFs)` wrapper needed.

## Non-Goals

- Unifying `EndoMount` and `@endo/endo-fs` `Filesystem`. The two surfaces remain parallel; `from-mount.js` is the only bridge and is not extended here.
- Exposing the worktree as an endo-fs Filesystem. That is a separate adapter and is out of scope.
- Live history watchers — `NodeWatcher.events()` on a git-FS Directory always yields zero events (historical trees do not change).
- Submodule traversal — `lookup` into a submodule entry throws; callers obtain a separate `Git` for the submodule's repository.
- Symlink target resolution. Symlinks are exposed as files whose content IS the link target (a single line of bytes), matching how git stores them. Following them is out of scope.

## Design

### Public Method

```ts
interface EndoGit {
  // existing methods...

  /**
   * Returns an `@endo/endo-fs` Filesystem lazily backed by the git object
   * database at the resolved tree of `ref`. The Filesystem is immutable;
   * every mutating verb throws `EACCES`.
   */
  filesystemAt(ref: GitRef | string): Promise<Filesystem>;
}
```

Sample use:

```js
const fs = await E(git).filesystemAt('HEAD');
const root = await E(fs).root();
const readme = await E(root).lookup('README.md');

// Range read — one `cat-file` call.
const opener = await E(readme).open({ read: true });
const reader = await E(opener).read(0n, 4096n);
// reader: PassableBytesReader

// Snapshot — hash is the git blob OID.
const blob = await E(readme).snapshot();
const info = await E(blob).getInfo();
// { algorithm: 'git-sha1', hash: '<40-hex-oid>', size: <bytes> }

// Compose with a writable layer in endo-fs.
const layered = compose([fs, scratchFs]);
```

### Lazy resolution

`filesystemAt(ref)` does one synchronous-shaped piece of work at construction:

1. Resolve `ref` to a canonical tree OID via the new backend method `resolveTree(ref)`.
   This is one `git rev-parse --verify --end-of-options <ref>^{tree}` call.
2. Mint a brand for this Filesystem instance.
3. Return the `Filesystem` exo.

All subsequent navigation is on-demand:

- `Directory.lookup(name)` triggers one `ls-tree` of the current tree OID, finds the named entry, and minted a new `File` or `Directory` exo for it.
- `Directory.list()` returns a `Cursor` over the `ls-tree` results, lazily streamed.
- `File.open({ read: true })` returns an `OpenFile` whose `read(offset, length)` invokes `cat-file blob <oid>` once and slices the result.
- `File.snapshot()` returns a `BlobRef` that defers the bytes-fetch until `fetch(offset, length)` is called.

Tree entries are cached per tree OID within the Filesystem instance — they are immutable, so caching is safe.
Blob bytes are NOT cached at this layer; callers that want a CAS-backed cache compose `withCachedReads(gitFs, cas)` in endo-fs.

### QID and BlobRef contracts

> **Superseded by the `## Status` section.**
> The shipped implementation delegates QID and `BlobRef` synthesis to `wrapBackend`, so:
> - `qid.pathId` is the path hash from `synthQid(path, kind)`, not the git OID.
> - `BlobRef.getInfo()` reports `algorithm: 'sha256'` (SHA-256 of the captured bytes), not `git-sha1`; the git OID is not exposed through the `BlobRef` shape.
>
> The original design called for the shape below, which would require either a hand-rolled exo graph (the wrap-backend rewrite eliminated) or a backend-supplied QID / hash hook on `wrapBackend` (deferred).

The original intent was:

```ts
// File QID
{
  type: 'file',
  pathId: BigInt('0x' + blobOid),  // git OID as BigInt
  version: 0n,                      // never changes — blob is immutable
}

// Directory QID
{
  type: 'directory',
  pathId: BigInt('0x' + treeOid),
  version: 0n,
}

// BlobRef.getInfo()
{
  algorithm: 'git-sha1',   // or 'git-sha256' for sha256-formatted repos
  hash: blobOid,           // hex string, the git OID itself
  size: blobSize,          // from ls-tree --long
}
```

The `git-sha1` vs `sha256` distinction would have been load-bearing: git's hash is over the framed payload (`blob <size>\0<bytes>`), not the raw bytes, so a downstream consumer comparing hashes across sources must distinguish `git-sha1(framed)` from `sha256(raw)`.
With the shipped shape, callers that need git-OID identity must consult the parent `Git` cap or the design's deferred backend-hook follow-up.

### Brands

Per `@endo/endo-fs`'s brand contract, every primitive Filesystem mints a passable `bigint` brand via `mintBrand()`.
For this adapter:

- A fresh brand is minted per `(Git instance, canonical tree OID)` pair.
- Repeated calls to `filesystemAt(sameOid)` on the same `Git` are memoized and return the same Filesystem cap (same brand). HEAD moving causes the next call to mint a new Filesystem.
- Two different `Git` capabilities pointing at the same repo do NOT share brands. Brand sharing across distinct authority boundaries would leak the implication that the two `Git` caps come from the same repo, which is information the public surface does not otherwise expose.

This makes `compose` cycle detection and cross-Filesystem `rename` (`EXDEV`) work without further plumbing.

### Mutating verbs

The Filesystem is natively read-only; mutating verbs throw `EACCES` with a structured error citing the read-only posture:

- `Directory.create`, `Directory.mkdir`, `Directory.unlink`, `Directory.rename`, `Directory.materialise`, `Directory.fsync` → `EACCES`.
- `Directory.setAttrs`, `File.setAttrs` → `EACCES`.
- `OpenFile.write`, `OpenFile.truncate`, `OpenFile.lock`, `OpenFile.fsync` → `EACCES`.
- `Xattrs.set`, `Xattrs.remove` → `EACCES`.

The exo throws `EACCES` directly rather than wrapping the Filesystem through `readOnly()` — there is no underlying writable cap to attenuate, so the wrapper would add a round-trip per call with no benefit.

### Unsupported endo-fs surface

These methods exist in the endo-fs contract but have no meaningful mapping for an immutable tree; they return empty streams or throw `ENOSYS`:

- `Xattrs.{get, list}` — empty stream / empty reader. Git has no xattrs.
- `NodeWatcher.events()` — empty reader. Historical trees never change.
- `Directory.watchFrom()` — returns `{ cursor, watcher }` where the cursor enumerates current entries and the watcher's events are always empty. The TOCTOU contract holds vacuously.
- `Filesystem.named(viewName)` — `ENOTSUP`. Git-FS has one root.

`Filesystem.statfs()` returns zeros (`totalBytes: 0n`, `freeBytes: 0n`, `availableBytes: 0n`) matching `from-mount.js`.

### Submodule and symlink behavior

A tree entry whose `type` field is `commit` denotes a submodule pointer (a 40-char OID into a different repository's object DB).

**Shipped behavior (wrap-backend rewrite):** the git-FS backend filters submodule entries out of `list()` and reports `kind('sub') → undefined` for them, so `Directory.lookup('sub')` surfaces as `ENOENT`.
Base endo-fs only knows file and directory kinds; introducing a third "submodule" kind would require widening the `FsBackend` contract and the wrapBackend exo plumbing.
Callers that need submodule traversal obtain a separate `Git` capability for the submodule's repository, exactly as the original design intended.

The original design described a distinct `EIO` error:

```
EIO: lookup of submodule 'name' is not supported; obtain a separate Git
capability for the submodule's repository
```

A tree entry whose `mode` begins with `120` is a symlink blob whose content is the target path string.
`Directory.lookup(name)` returns a `File` whose `open()` and `snapshot()` yield the link target text.
The git-FS does NOT follow symlinks — symbolic-link semantics are deferred to a higher layer (or to a future enhancement).

### Backend contract additions

The `GitBackend` typedef in `git.js` gains four primitives.
These are not novel — `NativeGitBackend` already implements them as internal helpers (`listTreeEntries`, `readBlobBytes`, `streamBlobBytes`, and the rev-parse used inside `tree()`); this design lifts them to the public backend contract so any future backend can implement them with the same shape:

```ts
/**
 * @typedef {object} GitTreeEntry
 * @property {string} mode    e.g. '100644', '040000', '120000', '160000'
 * @property {'blob' | 'tree' | 'commit'} type
 * @property {string} oid
 * @property {number} [size]  present for blobs, undefined for trees / commits
 * @property {string} name
 */

interface GitBackend {
  // existing methods...

  /**
   * Resolve a ref to a tree OID and (when applicable) the commit OID
   * that points at it. Used at filesystemAt(ref) construction.
   */
  resolveTree(ref: string): Promise<{ treeOid: string; commitOid?: string }>;

  /** Enumerate entries at a tree OID. */
  lsTree(treeOid: string): Promise<GitTreeEntry[]>;

  /** Read full bytes of a blob. */
  readBlobBytes(blobOid: string): Promise<Uint8Array>;

  /** Stream blob bytes for range reads. */
  streamBlobBytes(blobOid: string): AsyncIterable<Uint8Array>;
}
```

The existing `backend.tree(ref) → ReadableTree` keeps its shape unchanged; `filesystemAt` does not consume it.

### No formula type

`Git.filesystemAt(ref)` returns an ephemeral exo (no formula persistence), matching `Git.tree(ref)`.
Daemon restart causes any cap holders to re-derive the Filesystem from the parent `Git` formula by calling `filesystemAt(ref)` again.
The brand changes across restart.
The shipped `wrapBackend` implementation hashes captured bytes with SHA-256 and does NOT expose the git blob OID through `BlobRef` (see the `## Status` section), so callers that need cross-restart identity cannot rely on `BlobRef.getInfo().hash` matching the git OID directly.
Pair `Git.filesystemAt(ref)` with `Git.resolveTree(ref)` / `lsTree(treeOid)` from the backend contract (or hold the parent `Git` cap) to recover OID-level identity until the Phase 5 wrap-backend hook lets the git-FS supply its own hashes.

## Dependencies

| Design | Relationship |
|---|---|
| [daemon-git-capability](daemon-git-capability.md) | The `EndoGit` capability this method lives on; the backend primitives are also wired here. |
| [platform-fs](platform-fs.md) | Parallel read-surface vocabulary in `@endo/platform`. Not consumed; named for orientation. |

The daemon package takes a new dependency on `@endo/endo-fs` to import its interface guards (`FilesystemInterface`, `DirectoryInterface`, etc.) and shared helpers.

## Phased Implementation

### Phase 1: Backend primitives and public shape

- [ ] Add `resolveTree`, `lsTree`, `readBlobBytes`, `streamBlobBytes` to the `GitBackend` typedef in `src/git.js`.
- [ ] Stub the four methods in `makeNotYetImplementedBackend`.
- [ ] Expose the four methods on `NativeGitBackend` by promoting the existing internal helpers.
- [ ] Add `filesystemAt` to `GitInterface` in `src/interfaces.js` and `EndoGit` in `src/types.d.ts`.
- [ ] Tests: method advertised on the exo; `filesystemAt` is rejected on a backend that throws "not yet implemented".

### Phase 2: Filesystem, Directory, File construction

- [ ] New `src/git-filesystem.js` module exporting `makeGitFilesystem({ backend, treeOid, commitOid })`.
- [ ] Implement `Filesystem.{ root, named, statfs, brands, help }`.
- [ ] Implement `Directory.{ getQid, getAttrs, watch, xattrs, lookup, list, watchFrom, fsync, help }` and the EACCES-throwing mutating verbs.
- [ ] Implement `File.{ getQid, getAttrs, watch, xattrs, open, snapshot, help }` and EACCES-throwing `setAttrs`.
- [ ] Tests: navigate root → subdirectory → blob; QIDs equal across path-equivalent caps; mutation methods throw EACCES.

### Phase 3: OpenFile, Cursor, BlobRef

- [ ] Implement `OpenFile.read(offset, length)` over `readBlobBytes`. Caching: single buffer per OpenFile instance; subsequent reads slice it.
- [ ] Implement `Cursor.{ stream, skip, rewind, help }` over a snapshotted `lsTree` result.
- [ ] Implement `BlobRef.{ getInfo, fetch, help }` with `algorithm: 'git-sha1'` and `hash: blobOid`.
- [ ] Tests: range reads return correct bytes; large blob streaming completes; BlobRef.fetch returns matching bytes; Cursor pagination via skip.

### Phase 4: Compose interop and integration

- [ ] Verify `compose([gitFs, scratchFs])` works end-to-end.
- [ ] Verify `withCachedReads(gitFs, cas)` short-circuits on second read of the same blob.
- [ ] Cross-FS `rename` throws `EXDEV` from brand mismatch.
- [ ] Document the integration patterns in the package README or DESIGN.

### Phase 5 (deferred): SHA-256 repo support

- [ ] Detect `extensions.objectFormat = sha256` in `.git/config` and set `BlobRef.algorithm = 'git-sha256'` accordingly.
- [ ] Adjust `pathId` derivation if needed (sha256 OIDs are 64 hex chars, fits in BigInt fine).

## Design Decisions

1. **`Git.filesystemAt(ref)` returns `Filesystem`, not `Directory`.**
   The Filesystem level is the conventional endo-fs entry point; it carries `brands()` and `statfs()` which `Directory` cannot.
   Callers that want the root Directory walk one method: `await E(fs).root()`.
2. **Filesystem is natively read-only, not `readOnly(writableFs)`.**
   Git history is immutable; there is no underlying writable cap to attenuate.
   Throwing `EACCES` from the exo directly avoids one wrapper layer per call.
3. **QID `pathId` is the git OID as `BigInt`.**
   Two paths to the same blob share a QID.
   This matches git's content-addressed identity and is the strongest stability the protocol allows.
4. **`BlobRef.algorithm` is `'git-sha1'` (or `'git-sha256'`), not `'sha256'`.**
   Git's hash is over the framed payload `blob <size>\0<bytes>`, not raw bytes.
   A consumer comparing hashes across sources must distinguish.
5. **Brands are per `(Git, treeOid)`, memoized within one `Git`.**
   Repeated `filesystemAt(sameOid)` on the same `Git` returns the same cap.
   Different `Git` caps over the same repo do not share brands — that would leak co-repository identity.
6. **The daemon depends on `@endo/endo-fs`.**
   The new method is on the daemon-side `Git` exo, so the daemon takes the dependency.
   The alternative (an adapter in endo-fs consuming a public `LazyTreeView` from the daemon) is deferred — see "Alternatives Considered".
7. **No formula type for the Filesystem.**
   `Git.filesystemAt(ref)` returns an ephemeral exo matching `Git.tree(ref)`.
   Restart re-derives via the parent `Git` formula.

## Alternatives Considered

### Adapter lives in `endo-fs` (parallel to `from-mount.js`)

`endo-fs/src/from-git.js` would export `gitTreeAsFilesystem(lazyTreeView)`.
The daemon would add a public `Git.lazyTree(ref) → LazyTreeView` exposing the four backend primitives via a small public exo.

**Pros:** No daemon → endo-fs dependency; the public `LazyTreeView` shape becomes reusable by other lazy tree providers (HTTPS smart-protocol clients, isomorphic-git, daemon-local CAS-backed commit storage).

**Cons:** Two-step caller path; no obvious second `LazyTreeView` consumer today; the public `LazyTreeView` vocabulary would need its own design and version bump if it ever evolved.

Rejected for now in favor of the direct method.
If a second provider surfaces, the public `LazyTreeView` can be extracted later without breaking the `Git.filesystemAt` surface.

### Return a `Directory` directly (skip the Filesystem wrapper)

`Git.filesystemAt(ref) → Directory`.

**Pros:** Fewer wrappers; one-step lookup.

**Cons:** Loses `brands()` (breaks compose cycle detection) and `statfs()`.
Callers who want to compose would have to wrap a synthetic Filesystem around the Directory.

Rejected.

### Build on top of `Git.tree(ref) → ReadableTree`

Reuse the existing tree method and lift the result into an endo-fs Filesystem on the caller side.

**Pros:** No backend changes.

**Cons:** `ReadableTree` does not expose OIDs, sizes, or range reads, so the adapter would have to fetch and hash each blob client-side to populate `BlobRef.getInfo()` — defeating the content-addressing benefit.

Rejected.

## Testing Plan

In `packages/daemon/test/git.test.js`:

### Shape and authority

- `Git.filesystemAt('HEAD')` returns an exo advertising the `Filesystem` interface methods.
- `Filesystem.brands()` returns an array with exactly one passable `bigint`.
- Two `filesystemAt` calls with the same canonical OID on the same `Git` return caps whose `brands()` arrays match.
- Two `filesystemAt` calls across an intervening commit return caps whose `brands()` differ.

### QID and content addressing

- `Filesystem.root().getQid()` has `type === 'directory'` and `pathId === BigInt('0x' + headTreeOid)`.
- `Directory.lookup('README.md').getQid()` has `type === 'file'` and `pathId === BigInt('0x' + readmeBlobOid)`.
- Two paths pointing at the same blob report identical `getQid()` values.

### Reads

- `File.open({ read: true }).read(0n, 4096n)` returns the first 4 KB of the blob.
- Reading a blob larger than the cat-file buffer succeeds (full bytes returned via streaming).
- `File.snapshot().getInfo()` reports `algorithm === 'git-sha1'`, `hash === blobOid`, `size === blobSize`.
- `File.snapshot().fetch(0n, length).next()` returns bytes matching `git cat-file blob <oid>`.

### Listing

- `Directory.list()` returns a `Cursor`.
- `Cursor.stream().next()` yields `{ name, qid }` entries in `git ls-tree` order.
- `Cursor.skip(2n)` advances; the next `stream().next()` skips the first two.
- `Cursor.rewind()` resets the position.

### Mutation rejection

- `Directory.create`, `Directory.mkdir`, `Directory.unlink`, `Directory.rename`, `Directory.materialise`, `Directory.fsync`, `Directory.setAttrs`, `File.setAttrs`, `OpenFile.write`, `OpenFile.truncate`, `OpenFile.lock`, `OpenFile.fsync` all throw with a message matching `/EACCES/`.

### Submodule and symlink

- Looking up a submodule entry (mode `160000`, type `commit`) throws with `/submodule/`.
- Looking up a symlink (mode `120000`) returns a File whose `open().read()` contains the link target text; `snapshot().getInfo().algorithm === 'git-sha1'`.

### Compose interop

- `compose([gitFs, scratchFs]).root()` works.
- Cross-FS `rename` from a git-FS Directory to a scratch-FS Directory throws `EXDEV`.

## Prompt

> plan a new interface method for exposing a lazy read-only endo-fs tree at a git commit

Authored 2026-05-28 in response to the prompt after a clarifying exchange that distinguished `@endo/daemon` `EndoMount` (the existing live-mount cap) from `@endo/endo-fs` `Filesystem` (a separate package), and selected the placement option "method on `Git` directly" with a focused adapter-only design doc.
