# EndoMount Capability Completion Plan

| | |
|---|---|
| **Created** | 2026-05-18 |
| **Updated** | 2026-05-20 |
| **Author** | 0xPatrick (prompted) |
| **Status** | Proposed |

> **Read in order.**
> This is doc 1 of 3.
> The trio works as one design: (1) [daemon-mount-capabilities](daemon-mount-capabilities.md) (you are here) completes the mount surface; (2) [daemon-git-capability](daemon-git-capability.md) builds a local git capability on top of it; (3) [daemon-git-remotes](daemon-git-remotes.md) adds remote git on top of (2).
> Read in that order.

## Summary

Finish the `EndoMount` capability so it can serve as the live, handle-first filesystem basis for agent tools and the revised git capability.
Three pieces land together.
`EndoMount.snapshot()` becomes real instead of throwing.
An `EndoMountEntry` value type carries mount-scoped descriptors for paths that may not currently exist (its authority is the issuing mount, not the entry itself).
A hidden `EndoMountBacking` Exo facet on the mount formula gives trusted daemon code physical-worktree access without leaking host paths to guests.
The mount surface stays read-compatible with `ReadableTree` / `ReadableBlob`.

## What You Should Know First

This document assumes you know the following Endo primitives in one-line form; the rest of the doc names them without re-introducing them.

- **`EndoMount`** (today) is the daemon's existing live-mount Exo: it grants confined live access to one physical directory and returns `EndoMountFile` handles.
- **`ReadableTree` / `ReadableBlob`** are the shared read-surface interfaces in [platform-fs](platform-fs.md); `EndoMount` and `EndoMountFile` are already structurally compatible with their read side.
- **`Exo`** is the Endo "passable object with an interface guard" primitive (`makeExo(name, interfaceGuard, methods)`); every public capability in this doc is implemented as an Exo or a record under `harden()`.

## What is the Problem Being Solved?

`EndoMount` is already useful: it grants live, confined access to one physical directory, exposes the `ReadableTree` read surface, and returns `EndoMountFile` handles for existing files.
It is also already relied on by higher-level workflows such as staging trees into scratch mounts.

However, the current implementation stops one step short of becoming the general live-filesystem capability that newer agent features need:

- `snapshot()` is part of the interface but still throws.
- The public surface is still primarily path-string based.
- `lookup()` can only produce handles for nodes that already exist.
- There is no mount-scoped descriptor for a deleted, staged, or not-yet-created entry.
- The mount surface lacks metadata-oriented operations such as `stat()`.
- The physical path backing a mount is encoded in the formula, but there is no explicit host-private way for trusted providers to derive adjacent capabilities from that backing without leaking the path through the public mount facet.

These gaps matter on their own, and they are blocking for a principled git capability.
Git needs to discuss files that do not currently have live handles, and it needs a stable bridge between a public mount capability and trusted host-side access to the same physical worktree.

This document completes the current `EndoMount` design into the concrete live-directory capability that [daemon-git-capability](daemon-git-capability.md) will build on.
It narrows the older speculative filesystem work in [daemon-capability-filesystem](daemon-capability-filesystem.md) to the pieces needed by the implementation already in tree.

## Goals

1. Finish the live-mount lifecycle already promised by the interface.
2. Make new filesystem work handle-first while preserving compatibility with the existing `ReadableTree`-compatible methods.
3. Introduce a mount-scoped descriptor for entries that may not currently exist as live nodes.
4. Align `EndoMount` and `EndoMountFile` with the `Directory` / `File` vocabulary in [platform-fs](platform-fs.md).
5. Provide the trusted host-side bridge required for capabilities such as git without exposing ambient host paths to guests.

## Non-Goals

- Designing the full multi-provider VFS namespace.
- Replacing `EndoMount` with a new public type in one step.
- Giving guests ambient path access or raw `FilePowers`.
- Making every VFS backend usable as a writable git worktree.
- Solving stable inode identity on Node.js; descriptors in this design are mount-relative logical identities, not OS inode handles.

## Current State

### Implemented Today

`EndoMount` currently provides:

- `has(...pathSegments)`
- `list(...pathSegments)`
- `lookup(path)`
- `readText(path)`
- `maybeReadText(path)`
- `writeText(path, content)`
- `remove(path)`
- `move(from, to)`
- `makeDirectory(path)`
- `readOnly()`
- `snapshot()` placeholder

`EndoMountFile` currently provides:

- `text()`
- `streamBase64()`
- `json()`
- `writeText(content)`
- `writeBytes(readableRef)`
- `readOnly()`

The implementation is symlink-aware and confines all resolved paths to the mount root.
`EndoMount` is already structurally compatible with the read surface of `ReadableTree`; `EndoMountFile` is already structurally compatible with the read surface of `ReadableBlob`.

### Existing Related Designs

| Design | Relationship |
|---|---|
| [daemon-mount](daemon-mount.md) | Current implementation note for mount and scratch-mount formulas.  This plan completes the unfinished capability surface. |
| [platform-fs](platform-fs.md) | Shared type lattice for `ReadableBlob`, `ReadableTree`, `File`, `Directory`, `SnapshotBlob`, and `SnapshotTree`. |
| [daemon-capability-filesystem](daemon-capability-filesystem.md) | Broader VFS vision covering `Dir` / `File`, multi-provider backends, and caretaker control. |
| [virtual-filesystem-design](../docs/virtual-filesystem-design.md) | Earlier handle-oriented sketch and logical-node-identity model. |

## Design Principles

### 1. Public Authority Is an Object, Not a Host Path

The guest should hold `EndoMount`, `EndoMountFile`, and related capabilities.
The guest should not receive the physical path that the daemon uses internally to implement a mount.

### 2. Strings Are Selectors, Not Authorities

Relative strings remain useful for user input and convenience calls, but they should be consumed to mint mount-owned capabilities.
New APIs should prefer passing `EndoMountEntry`, `EndoMountFile`, or `EndoMount` values after that first resolution step.

### 3. Separate Live Handles from Logical Entry References

An existing file can be represented by `EndoMountFile`.
A deleted file, an untracked path before creation, or a staged path that is absent from the worktree cannot.
Those require a separate logical descriptor rooted in a mount.

### 4. Keep the Read Surface Structurally Compatible

Existing code that consumes `ReadableTree` or `ReadableBlob` should continue to work with mounts and mount files on the read path.

### 5. Make Attenuation Structural Where Practical

`readOnly()` should continue to remove mutation authority.
Future read-only views should prefer exposing read-only interfaces rather than only exposing writable methods that throw.

## Capability Model

### Public Facets

| Capability | Role |
|---|---|
| `EndoMount` | Live mutable directory rooted at a confined physical subtree |
| `EndoMountFile` | Live mutable file inside an `EndoMount` |
| `EndoMountEntry` | Mount-scoped logical reference to a normalized relative entry, whether or not that entry currently exists |

### Host-Private Facets

| Capability | Role |
|---|---|
| `EndoMountBacking` | Trusted physical-backing facet or sealed grant for daemon providers that need the real worktree path |
| `EndoMountControl` | Future caretaker facet for host-only mutability / revocation control, if the broader capability-filesystem plan is realized |

`EndoMountBacking` is deliberately not part of the guest-facing interface.
It is the bridge a trusted provider such as native git needs in order to operate on the same physical worktree without making that path observable to the guest.
Its purpose is to keep adjacent capabilities such as `Git` downstream of an already-authorized mount rather than letting them become parallel raw-path grants.

## Proposed Interfaces

The names below are intentionally explicit about their daemon role.
A later package-level migration can map them onto `Directory`, `File`, and related `@endo/platform/fs` vocabulary.

### `EndoMount`

```ts
interface EndoMount {
  // Existing ReadableTree-compatible queries.  `has(entry)` is the
  // no-observational-authority existence test for an `EndoMountEntry`
  // value.  Path-bearing methods on this interface use the
  // array-parameter form (`path: string[]`), not the rest-parameter
  // form (`...path: string[]`), so siblings (`has`, `list`, `lookup`,
  // `readText`, and the path-form mutators) stay coherent across the
  // surface.
  has(path: string[]): Promise<boolean>;
  has(entry: EndoMountEntry): Promise<boolean>;
  list(path: string[]): Promise<string[]>;
  lookup(path: string[]): Promise<EndoMount | EndoMountFile>;
  lookup(entry: EndoMountEntry): Promise<EndoMount | EndoMountFile>;

  // Descriptor minting.  No I/O; the resulting entry can name a path
  // that does not currently exist on disk (a deleted git file, a
  // staged-but-absent target, a not-yet-created node).  `entry()` is
  // the documented "string as selector" boundary: it accepts either a
  // slash-joined string or a segment array and normalizes once.
  // Elsewhere the interface uses `string[]` only.
  entry(path: string | string[]): EndoMountEntry;

  // Metadata.  `stat(entry)` is the no-observational-authority
  // metadata query for an `EndoMountEntry` value.
  stat(path: string[]): Promise<EndoMountStat | undefined>;
  stat(entry: EndoMountEntry): Promise<EndoMountStat | undefined>;

  // Existing convenience I/O.  Retain for compatibility.
  readText(path: string[]): Promise<string>;
  maybeReadText(path: string[]): Promise<string | undefined>;
  writeText(path: string[], content: string): Promise<void>;

  // Path-form mutators.  All take a path-segment array and return
  // void.  The path locates where to act; it is not a held reference
  // to a node.  Failure modes are the usual filesystem ones
  // (EEXIST, ENOENT-parent, EACCES).  `makeFile` is the path-form
  // sibling of `makeDirectory` for parallel construction and for
  // binary content; the existing `writeText(path, content)` remains
  // the truncate-and-write path for the text-only case.
  makeDirectory(path: string[]): Promise<void>;
  makeFile(path: string[], content?: string | Uint8Array): Promise<void>;
  remove(path: string[]): Promise<void>;
  move(from: string[], to: string[]): Promise<void>;

  // Attenuation and capture.
  readOnly(): EndoMount;
  snapshot(): Promise<SnapshotTree>;
}
```

`lookup()` is the single handle-minting method.
It returns either an `EndoMount` or an `EndoMountFile` depending on what is at the path, and throws `EndoMountMissingError` for an absent path (see § *`lookup()` semantics on missing nodes* below).
There is no separate `openFile` / `openDirectory` pair: `lookup` already covers both kinds, and the existing `mount.has(entry) → mount.lookup(entry)` idiom (or a runtime `kind` check on the returned handle) handles the cases where the caller wants to discriminate.

### `EndoMountFile`

```ts
interface EndoMountFile {
  // Existing ReadableBlob-compatible surface.
  text(): Promise<string>;
  streamBase64(): AsyncIterator<string>;
  json(): Promise<unknown>;

  // Mutable File surface.
  writeText(content: string): Promise<void>;
  writeBytes(readableRef: AsyncIterator<Uint8Array>): Promise<void>;
  append(content: string): Promise<void>;
  stat(): Promise<EndoMountStat>;

  // Attenuation and capture.
  readOnly(): EndoMountFile;
  snapshot(): Promise<SnapshotBlob>;
}
```

`streamBase64()` already provides binary read access.
The next increment should favor file handles over adding more directory-level path convenience methods for byte I/O.

### `EndoMountEntry`

```ts
interface EndoMountEntry {
  // Copyable presentation data, always mount-relative.
  segments(): string[];
  displayPath(): string;

  // Narrow to a child entry without granting access outside the mount.
  child(name: string): EndoMountEntry;
}
```

An `EndoMountEntry` is a **value**, not a handle.
It carries:

- mount-lineage provenance (so another mount rejects it on identity);
- normalized relative segments;
- enough presentation data for status reports.

It carries **no live-filesystem authority at all** — no observational queries like `exists()` or `stat()`, and no handle-minting methods.
Existence and metadata queries live on `EndoMount` and accept an entry: `mount.has(entry)` for the existence test and `mount.stat(entry)` for the metadata query.
Handle-minting also lives on `EndoMount` and accepts an entry as the path-bearing argument: `mount.lookup(entry)`.
This keeps the entry shape value-shaped — a deeply read-only value an agent can pass around freely — and concentrates *both* observational authority and handle-minting authority on the mount where they can be revoked or attenuated as a unit.

An entry:

- can represent a missing path;
- cannot be fabricated by the caller for a different mount;
- does not claim inode stability;
- can carry enough relative presentation data for user interfaces and status reports without leaking host absolute paths.

The implementation can model an entry as `{ mountGrant, normalizedSegments }` inside an Exo (or as a passable record under SES `harden`), with `mountGrant` checked by identity when another capability accepts the entry.

#### Alternative Considered: Entries as Mini-Capabilities

An earlier shape put **both** observational authority (`exists()`, `stat()`) and handle-minting (`lookup()`, `openFile()`, `openDirectory()`) on the entry itself:

```ts
// Considered and rejected:
interface EndoMountEntry {
  // ...value-shaped members...
  exists(): Promise<boolean>;
  stat(): Promise<EndoMountStat | undefined>;
  lookup(): Promise<EndoMount | EndoMountFile>;
  openDirectory(): Promise<EndoMount>;
  openFile(): Promise<EndoMountFile>;
}
```

That shape made entries mini-capabilities that both observed the live filesystem (every `entry.exists()` / `entry.stat()` call reaches the backing storage) and minted handles on themselves, ergonomic per call site (`await E(entry).openFile()` rather than `await E(mount).lookup(entry)`).

Rejected for these reasons:

- **Diffuses authority across many handles.**
  Every entry holding both a reference to its mount's observational authority *and* its handle-minting authority means the mount's effective surface is everywhere a passed-around entry lives.
  The mount becomes the sum of its issued entries plus itself; revoking or attenuating the mount has to chase down the entries too.
  An entry that looks like a value but invokes the backing filesystem on every call is not really a value — it is a mini-capability with the syntax of a value, which is harder to reason about than either pole.
- **Harder to reason about authority lineage.**
  When a handle is minted via `entry.openFile()`, the lineage is `mount → entry → handle`; the entry might be from a `readOnly()` view, or it might predate a mount attenuation, and the resulting handle's authority is the *minimum* of all three layers.
  When the same mint goes through the mount (`mount.lookup(entry)`), the mount's current state is the single-point authority.
  The same argument applies to observational authority: `entry.exists()` against a stale mount-attenuation state is harder to reason about than `mount.has(entry)` against the current mount.
- **Concentrates authority where the panel-flagged ocap-discipline says it should be.**
  The same reasoning the maintainer applied to MF1 (`provideGit` should accept a cap, not a pet name that triggers a name-table lookup) applies here: both observational queries and handle-minting are the mount's authority, exercised by the mount.
  Entries are values you pass to the mount; they don't carry authority of their own.
- **Matches the existing `EndoMount.readOnly()` attenuation idiom.**
  A `readOnly()` mount minting handles via `mount.lookup(entry)` and answering `mount.has(entry)` / `mount.stat(entry)` is trivially attenuated.
  A `readOnly()` mount returning entries that carry their own observational or handle-minting methods would have to attenuate every issued entry too, or fail to attenuate at all.

The chosen shape — entries hold neither observational authority nor handle-minting authority — is the strict ocap version.
The trade-off is a small ergonomic loss (`mount.lookup(entry)` and `mount.has(entry)` are one extra noun per call vs. `entry.openFile()` and `entry.exists()`) for a substantial authority-reasoning gain.
If a real use case surfaces where the value shape is awkward enough to warrant revisiting, the implementation can re-add either axis to the entry as a sugar layer over the mount's authority; that addition would not break the mount-is-authority discipline as long as the entries continue to delegate to the mount rather than holding authority directly.

### `EndoMount.lookup()` semantics on missing nodes

`EndoMount.lookup(entry)` returns a live handle for an existing node and **throws** `EndoMountMissingError` for a missing one.
Callers that want to test before opening use `mount.has(entry)` first; the `mount.has(entry) → mount.lookup(entry)` pattern is the recommended idiom.
No `maybeLookup` sibling is part of the initial design; if usage warrants one later, it can be added without contract breakage.
The throw-on-missing default is consistent with the existing `lookup(path)` behavior that exists today.

### `EndoMountStat`

```ts
type EndoMountStat = {
  kind: 'file' | 'directory' | 'symlink';
  sizeBytes?: number;
  modifiedMs?: number;
};
```

This is intentionally narrower than Node's `Stats` object.
It exposes the portable facts callers commonly need without coupling public APIs to Node.

## Path and Descriptor Semantics

### Path Input

Path strings remain accepted only as relative selectors within an already granted mount.
They are normalized once when turned into an `EndoMountEntry`.

Recommended rules:

- Reject empty segments.
- Reject embedded `/`, `\`, or NUL bytes in segment-oriented APIs.
- For descriptor minting, reject `..` rather than silently clamping it.
- Preserve compatibility behavior for older convenience methods until callers migrate.

Rejecting traversal when minting descriptors is preferable to preserving a representation that only becomes safe after later clamping.

### Descriptor Provenance

Any operation accepting `EndoMountEntry` must verify that:

1. The entry was minted by the same mount lineage.
2. The caller is not using an entry from an attenuated view to regain write authority removed by `readOnly()`.
3. The normalized path remains confined at operation time after symlink resolution.

The third condition preserves the current TOCTOU-resistant confinement check already used by `EndoMount`.

## Snapshot Semantics

`snapshot()` should become the canonical bridge from live mutable storage to immutable snapshot storage:

```mermaid
flowchart TD
  call["EndoMount.snapshot()"]
  walk["recursively check in the mount read surface"]
  persist["persist readable-blob / readable-tree formulas"]
  result["return SnapshotTree"]
  call --> walk --> persist --> result
```

Implementation should reuse the existing platform checkin machinery rather than reimplementing traversal:

- `EndoMount` already satisfies the `ReadableTree` read surface.
- `EndoMountFile` already satisfies the `ReadableBlob` read surface.
- The daemon already delegates tree ingestion to `@endo/platform/fs/lite` `checkinTree()`.

`snapshot()` must state its consistency guarantee.
The minimum viable contract is **per-file consistency, no per-tree guarantee**.
Each captured blob is the exact bytes that were present in that file at some moment during the snapshot operation.
Each captured tree-entry name is the exact name that existed at some moment during the snapshot operation.
The captures of different files may correspond to different moments.
A concurrent writer that touches file A and then file B during the operation may produce a snapshot in which A reflects the post-write state while B reflects the pre-write state.
The snapshot is hash-consistent per file, not per tree.

**Missing-file and missing-directory races.**  A file removed mid-snapshot (the directory walk listed it, the per-file open found it absent) and a directory renamed or removed mid-snapshot (its listing succeeded, its child traversal found the path gone) **omit that entry from the snapshot tree** rather than fail the whole operation with a structured error.  The captured tree represents what was reachable from the mount root during the operation; an entry that vanished before its bytes could be captured was reachable for less than the whole walk and is excluded.  Reasoning: the per-file consistency contract above already permits the snapshot to represent different files at different moments, so omitting a moment-zero-existed-then-vanished entry is the natural extension of that mode, and the existing `@endo/platform/fs/lite` `checkinTree()` ingestion already accommodates a tree whose listing reflects what was reachable at walk time.  The structured-error alternative ("a missing-file race fails the whole snapshot") would push the burden onto every caller to retry against a sufficiently quiescent worktree, which the per-file mode already promises not to require.  If a downstream consumer surfaces a need to distinguish "absent because never present" from "absent because raced", the structured-error variant can be added as a stricter consistency mode alongside the future transactional mode.

Stronger transactional capture (single filesystem instant across the whole tree) can be future work.

## Host-Private Physical Backing

Some trusted providers need more than the public read/write surface.
A git provider, for example, needs to operate on repository metadata and the physical worktree together.

Add a host-private backing abstraction:

```ts
interface EndoMountBacking {
  kind(): 'physical';
  // Returned only to trusted daemon code, never to guests.
  getPhysicalRoot(): string;
  grantFor(entry?: EndoMountEntry): SealedMountGrant;
}
```

### Implementation: Hidden Facet on the Mount Formula

The mount formula gains an additional Exo facet — `EndoMountBacking` — that lives alongside the guest-visible `EndoMount` and `EndoMountFile` facets but is never returned by any public method.
Trusted daemon code holds a reference to the backing facet through a private host-side name table keyed on the mount's formula identifier; guest-visible introspection (`__getMethodNames__`, `inspect`, etc.) sees only the public facets.

Trade-off rationale (WeakMap vs sealer/unsealer were the other live options):

- a hidden Exo facet **survives daemon restart trivially** because it is reconstituted from the same formula as its sibling public facet, which matches `provideGit()`'s expectation that "the mount-derived `Git` capability re-derives correctly after restart" without any extra persistence machinery;
- a `WeakMap` keyed on the public Exo would not survive restart; every `provideGit()` after restart would have to re-derive the backing out-of-band, doubling the surface that has to know about mount internals;
- a sealer/unsealer pair would need a persisted seal key with its own threat model (where does the key live, how is it rotated, who else has unseal authority) and adds a separate first-class secret to the daemon.

The hidden-facet implementation:

- guests can pass mounts and entries around without ever observing the backing facet;
- trusted providers prove two values belong to the same physical mount by identity-checking against the backing facet keyed on the public mount's formula id;
- no public method reveals ambient filesystem paths; `getPhysicalRoot()` is on the backing facet only.

## Relationship to `@endo/platform/fs`

The intended convergence is:

| Current daemon term | Shared filesystem role |
|---|---|
| `EndoMountFile` | `File` |
| `EndoMount` | `Directory` |
| `EndoMountFile.readOnly()` | `ReadableBlob` view |
| `EndoMount.readOnly()` | `ReadableTree` view |
| `EndoMountFile.snapshot()` | `SnapshotBlob` |
| `EndoMount.snapshot()` | `SnapshotTree` |

This plan does not require renaming the current daemon interfaces first.
Instead, it requires every new method to move toward the shared shape so a later adapter or migration is mostly mechanical.

## Security Considerations

- **No public physical path leak.**
  `displayPath()` is mount-relative only.
- **Descriptor provenance is enforced.**
  Callers cannot fabricate entries for another mount by passing arbitrary host strings.
- **Symlink confinement remains operation-time.**
  A descriptor does not bypass realpath checks.
- **Read-only attenuation remains irreversible.**
  A read-only mount should mint read-only entries and read-only handles.
- **Descriptors are not ambient authority.**
  They are useful only with the mount lineage that minted them.
- **Missing paths are representable without write authority.**
  Merely naming a possible entry does not create it or grant mutation.

## Implementation Plan

### Phase 1: Finish the Existing Contract

- [ ] Implement `EndoMount.snapshot()`.
- [ ] Add integration tests for snapshot round-tripping:
  - [ ] live mount -> snapshot tree
  - [ ] nested directories
  - [ ] binary file streaming
  - [ ] symlink confinement behavior
- [ ] Update `daemon-mount.md` status once shipped.

### Phase 2: Add Entry Descriptors

- [ ] Add `EndoMountEntryInterface`.
- [ ] Add `entry(path)` to `EndoMount`.
- [ ] Store normalized relative segments plus mount lineage provenance.
- [ ] Add `segments()`, `displayPath()`, and `child()` on entries (value-shaped, no observational authority and no handle-minting per Design Decision 3).
- [ ] Observational queries (`has(entry)`, `stat(entry)`) and handle-minting (`lookup(entry)`) all live on `EndoMount` and accept an entry as the path-bearing argument; see next phase.
- [ ] Add descriptor provenance tests:
  - [ ] entries from one mount rejected by another mount
  - [ ] read-only entries (via `readOnly()` mount) cannot regain write authority through handle-minting on a sibling mutable mount
  - [ ] missing entries can round-trip without creating files

### Phase 3: Add Entry Overloads, Metadata, and the `makeFile` Sibling

- [ ] Add the `lookup(entry)`, `has(entry)`, and `stat(entry)` overloads on `EndoMount`.
  Each accepts an entry as the path-bearing argument (the no-observational-authority queries an earlier draft had on the entry itself).
- [ ] Add `stat(path)` for the path-form metadata query.
- [ ] Add `makeFile(path, content?)` as the path-form sibling of `makeDirectory` (parallel construction; binary content via `Uint8Array`).
  Existing path-form mutators (`writeText`, `remove`, `move`, `makeDirectory`) keep their current signatures unchanged.
- [ ] Add `stat`, `append`, and `snapshot` on `EndoMountFile`.
- [ ] Keep existing path convenience methods for compatibility.
- [ ] Update help text and TypeScript declarations together with interface guards.

### Phase 4: Add Trusted Backing Provenance

- [ ] Introduce the host-private physical-backing facet or sealed-grant mechanism.
- [ ] Ensure public mounts do not expose backing paths.
- [ ] Add tests proving trusted code can correlate a mount with its backing while guest-visible introspection cannot recover that path.

**Prerequisite.** The rationale claim that the hidden-facet implementation "survives daemon restart trivially because it is reconstituted from the same formula" assumes the daemon's formula machinery can reconstitute a sibling facet alongside the public `EndoMount` facet on the same formula.  Today's `mount` formula in `packages/daemon/src/mount.js` returns a single `makeExo('EndoMount', ...)` and `packages/daemon/src/daemon.js`'s formula switch (`case 'mount':`) returns one Exo per formula id.  The phase therefore depends on one of:
- adding multi-facet support to the formula reconstitution path (a sibling Exo on the same formula id, addressable through a host-private name table keyed by formula id), or
- expressing the backing facet as a derived formula that reconstitutes from the same mount formula id but lives in a separate host-private name table.

The current implementation supports neither out of the box; the phase's first task is to choose between those two paths (or a third that the maintainer prefers) and to add the supporting formula-machinery change before any backing-facet code lands.

### Phase 5: Converge with Shared Filesystem Types

- [ ] Add adapters or aliases to make `EndoMount` / `EndoMountFile` satisfy the `Directory` / `File` contracts where practical.
- [ ] Decide whether `EndoMount` remains a daemon-specific wrapper around `Directory` or becomes a daemon-local specialization.
- [ ] Keep `ReadableTree` / `ReadableBlob` compatibility tests in place during migration.

## Migration Notes

- Existing users of `list`, `lookup`, `readText`, `writeText`, `remove`, `move`, and `makeDirectory` continue to work with their current signatures.
  `makeDirectory` keeps its name and shape; it is the established convention across `daemon-mount`, `platform-fs`, `daemon-weblet-application`, `filesystem-watchers`, the implemented `packages/platform/src/fs` surface, and its consumers in `packages/chat`, `packages/fae`, and `packages/lal`.
- `makeFile(path, content?)` is the new path-form sibling of `makeDirectory`.
  It is additive: no existing method is renamed, removed, or re-typed.
  `writeText(path, content)` remains the truncate-and-write path for the text-only case; `makeFile` is the constructive sibling for parallel use with `makeDirectory` and for binary content.
- Entry overloads (`has(entry)`, `stat(entry)`, `lookup(entry)`) are additive overloads on existing query / handle-minting methods; the path-form callers remain unchanged.
- New code that performs more than one operation on the same node should prefer entries and handles.
- Git should depend on `EndoMountEntry`, not on free-form relative path strings.
- Future Fae / Lal filesystem tools should expose user-friendly path arguments at the tool boundary, then immediately convert them into mount entries internally.

## Open Questions

1. **Descriptors mount-local or namespace-local?**
   When the full VFS namespace arrives, descriptors need to compose across providers (physical mount, git tree, memory backend, CAS).
   This is a real open question whose answer depends on VFS-namespace design that lives in [daemon-capability-filesystem](daemon-capability-filesystem.md) and is out of scope for this trio.

### Resolved (recorded as Design Decisions)

The following questions were carried in early drafts; their resolutions live in *Design Decisions* below.

- `readOnly()` interface narrowing — decision 6.
- `entry(path)` accepting both arrays and slash strings — already in the `EndoMount` interface (`string | string[]`).
- `displayPath()` public — decision 7.

### Spike Tasks

These are open questions that need measurement or a concrete use case before the answer is design-stable.
Each lives as a checklist item under its associated phase.

- **Snapshot consistency for build-reproducibility.**
  The current contract is per-file-consistent, per-tree best-effort ([§ Snapshot Semantics](#snapshot-semantics)).
  If a downstream caller (caplet build, deterministic test fixture) actually needs single-instant capture, run a spike during the snapshot-consumer's design pass to measure whether the per-file guarantee is sufficient or whether a stronger mode is required, then either accept the current contract or add a `snapshot({ consistency: 'transactional' })` option in a follow-up doc.
  Until a real consumer surfaces the need, the per-file guarantee stays.

## Design Decisions

1. **Mount authority is an object.**
   The guest holds `EndoMount`, `EndoMountFile`, and `EndoMountEntry`; the guest never holds the physical host path.
2. **Strings are selectors, not authorities.**
   Relative paths remain accepted as convenience inputs but are normalized into entries at the boundary.
3. **`EndoMountEntry` is a value, not a handle.**
   The entry carries no live-filesystem authority at all: no observational queries (`exists`, `stat`) and no handle-minting (`lookup`).
   Both axes live on `EndoMount` and accept an entry as the path-bearing argument (`mount.has(entry)`, `mount.stat(entry)`, `mount.lookup(entry)`).
   The entry is a passable, deeply read-only value the agent can hand around without conferring access.
4. **`EndoMountBacking` is a hidden Exo facet on the mount formula.**
   Restart-trivial, no extra persistence machinery, no separate seal key.
5. **Snapshot consistency is per-file, best-effort per-tree.**
   Stronger modes are a future addition gated on a real consumer.
6. **`readOnly()` keeps the same-named-throwing-Exo convention initially.**
   The structural-narrowing form (returning a `ReadableTree` / `ReadableBlob` that has no mutation methods at all) lands in Phase 5 alongside the shared `Directory` / `File` adoption; the initial form preserves source compatibility for the existing daemon callers.
7. **`displayPath()` is public.**
   The data is mount-relative-only (no host-path leak) and the convenience is worth more than the alternative "callers carry their own presentation string"; treating presentation as a property of the capability keeps the rendering consistent across consumers.
