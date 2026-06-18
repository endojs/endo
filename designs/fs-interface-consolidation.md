# Filesystem & Name-Hub Interface Consolidation

| | |
|---|---|
| **Created** | 2026-06-18 |
| **Updated** | 2026-06-18 |
| **Author** | Aaron (prompted) |
| **Status** | In Progress |

## Status

This document proposes reducing the overlap in the ~30 filesystem-shaped and
name-hub-shaped `M.interface` guards that now exist across `@endo/platform`,
`@endo/platform/fs/extended` (formerly `@endo/endo-fs`), and `@endo/daemon`.
It builds directly on
[fs-interface-reconciliation.md](fs-interface-reconciliation.md) (which unified
the method *names and signatures* across the three live tree surfaces) and on
[namehub-interface-unification.md](namehub-interface-unification.md) (an
accepted-but-unimplemented design for one slice of this).

The reconciliation work made the names line up. This document is the next
question: now that `lookup` / `move` / `copy` / `makeDirectory` / `remove` /
`subView` mean the same thing on every tree surface, **which of the duplicated
guards can be collapsed, and what blocks each one.**

Each phase below touches core exo guards and therefore needs its own
daemon-test validation pass.

### Implemented so far

The low-risk, shape-identical portions of C1–C5 have landed on this PR; the
parts that need a maintainer canonical-shape decision or that are blocked on
another design are called out below and left as follow-ups.

- **C2 (done).** `@endo/platform/fs` now exports `readableBlobMethodGuards`
  (help / streamBase64 / text / json) and `readableTreeMethodGuards`
  (help / has / list / lookup) as method-guard records. The lite
  ReadableBlob / SnapshotBlob / File and ReadableTree / SnapshotTree /
  Directory guards spread them instead of repeating the shapes.
- **C3 / C4 (done for the daemon read surfaces).** `EndoBlob` is now
  `{ ...readableBlobMethodGuards, sha256 }` (the `SnapshotBlob` shape) and
  `EndoReadableTree` is now `{ ...readableTreeMethodGuards, sha256 }` (the
  `SnapshotTree` shape). Retiring the extended `BlobRef` in favor of
  `SnapshotBlob` (and removing the unbuilt `BlobRef → SnapshotBlob` adapter)
  remains a follow-up — it is woven through the extended snapshot path and CAS
  cache and needs its own validation pass.
- **C1 (done).** `EndoNameHub` and `EndoDirectory` share `nameHubMethodGuards`.
  The canonical-shape question is **resolved: `NameOrPathShape`** — the shared
  `readableNameHubMethodGuards` (has / list / lookup / maybeLookup) and the
  named `ReadableNameHubInterface` standardize on `string | string[]`.
  `EndoMount` satisfies that contract by method name and **widens** its own
  `has` / `lookup` / `maybeLookup` to `PathArgShape` (it accepts a `MountEntry`
  cap; entry-as-path-arg is load-bearing and was verified not to be narrowable
  without a breaking change). `EndoMount.maybeLookup` is now implemented. The
  one remaining C1 item is `followNameChanges` on the mount, blocked on
  [filesystem-watchers.md](filesystem-watchers.md).
- **C5 (done).** The dead `ContentStoreInterface` / `SnapshotStoreInterface`
  (re-exported but never implemented) were removed. The remaining lite
  `M.interface` objects all have real consumers (the daemon imports the
  Directory / File guards; the platform implementers use the rest), so they
  keep their job as the assembled guards alongside the exported records.

The extended cap-FS engine's `Directory` / `File` keep their own richer guards
(eref-returning caps, cursors, `lookupStep` / `subView` / `create`): they are a
genuinely different surface and are out of scope for the shared records.

## What is the Problem Being Solved?

The same conceptual capabilities are declared several times under different
names:

- **A "tree of named things"** is declared three times in live code: the
  extended `Directory` (`packages/platform/src/fs/extended/type-guards.js`),
  the daemon `EndoMount` (`MountInterface`), and the daemon `EndoDirectory`
  (`NameHubInterface`). Each redeclares `lookup` / `move` / `copy` /
  `makeDirectory` / `remove` by hand. The daemon already *imports*
  `PlatformDirectoryInterface` and comments "`EndoMount` extends `Directory`"
  (`interfaces.js:540`), but then re-declares the methods rather than deriving
  them — the alignment is by convention and prone to drift.
- **A "minimal vocabulary"** (`@endo/platform/fs/lite`'s `Directory` / `File`)
  exists as guards with **no implementer**. They are the aspirational shape the
  real guards hand-copy.
- **A "handle to immutable bytes"** is declared as `ReadableBlob` (lite),
  `BlobRef` (extended), `SnapshotBlob` (lite), `EndoReadable`, and `EndoBlob`
  (daemon).
- **A "content-addressed immutable tree"** is declared as `ReadableTree` and
  `SnapshotTree` (lite), and `EndoReadableTree` (daemon).

Duplication is not free: it is where drift accumulates (the daemon comment
already worries about it), it forces adapters that would otherwise be
unnecessary (the unbuilt `BlobRef → SnapshotBlob` adapter, fs-reconciliation
F7/D3, is a *symptom* of two shapes for one concept), and it multiplies the
surface a viewer must learn to dispatch over.

## The load-bearing constraint: signatures diverge, names do not

The reconciliation aligned method *names*. It did **not** make the argument
*shapes* identical, because the live surfaces accept genuinely different
inputs. This is the single most important fact for every phase below, so it is
stated once here.

| Method | `EndoMount` (`MountInterface`) | `EndoDirectory` (`NameHubInterface`) | extended `Directory` | genie `LocalMount` |
|---|---|---|---|---|
| arg shape | `PathArgShape` = `string \| string[] \| MountEntry` | `NameOrPathShape` = `string \| string[]` | `string \| string[]` | `PathArgShape` = `string \| string[]` |
| `lookup` | `M.call(PathArgShape)` | `M.call(NameOrPathShape)` | `M.call(M.or(string, arrayOf string))` | `M.call(PathArgShape)` |
| `move` | `M.call(PathArgShape, PathArgShape)` | `M.call(NamePathShape, NamePathShape)` | `M.call(or(string,array), or(string,array))` | `M.call(PathArgShape, PathArgShape)` |
| `remove` | `M.call(PathArgShape)` | `M.call().rest(NamePathShape)` | `M.call(string)` | `M.call(PathArgShape)` |

So `EndoMount` accepts a `MountEntry` cap as a path argument where the others
do not, and `EndoDirectory.remove` is variadic where the others are not. **A
guard cannot be shared verbatim**: merging onto the narrower shape removes
`EndoMount`'s entry-accepting behavior; merging onto the wider shape makes a
guard advertise inputs its implementation rejects. Every consolidation below
therefore requires a maintainer decision on the *canonical* shape per method,
or a layered guard where the shared record carries the common shape and each
surface widens specific methods.

### A fourth mount-shaped surface: genie `LocalMount`

`packages/genie/src/sandbox/local-powers.js` defines its **own**
`LocalMountInterface` / `LocalMountFileInterface` rather than importing any of
the three reconciled surfaces. It is a host-backed, in-process sandbox facet
(`provideScratchMount` / `provideHostPath` mint it) that deliberately mirrors
the daemon's `Mount` *shape* — `has`, `list`, `lookup`, `readText`,
`maybeReadText`, `writeText`, `makeDirectory`, `remove`, `move` — using a
locally-defined `PathArgShape` of `string | string[]` (no `MountEntry` arm: a
genie sandbox never traffics in daemon mount-entry caps). It is the **fourth**
independent definition of the mount vocabulary, and reinforces C1's
canonical-shape question: any `ReadableNameHubInterface` (or shared method
record) that genie could eventually consume must commit to a `string | string[]`
baseline, with the `MountEntry` arm strictly a daemon-side widening.

Genie is **not** a near-term consolidation target. Its interface is load-bearing
for two security gates that must not be perturbed by a refactor:

- `assertIsMountCap` is a *shape* gate — it checks for the presence of
  `['readText','writeText','makeDirectory','has','list']`. Renaming or
  re-homing those methods would silently break the gate.
- `provideHostPath` is an *identity* gate keyed on a `WeakSet`/`WeakMap` of
  powers-minted caps, independent of the interface shape.

The actionable record here is the table column above plus this note: when C1
fixes the canonical path-argument shape, genie's local `PathArgShape` should be
re-pointed at the shared definition (it already matches the `string | string[]`
baseline), but genie keeps its own *interface object* so its security gates stay
self-contained.

This is exactly the choice-point that
[namehub-interface-unification.md](namehub-interface-unification.md) anticipated
("make the choice points visible"); the divergence table above is the concrete
form of it.

## Consolidation candidates

### C1 — Name-hub unification (accepted; now unblocked)

[namehub-interface-unification.md](namehub-interface-unification.md) is
**Accepted, not yet implemented**. Its Decisions section chooses: introduce a
narrower **`ReadableNameHubInterface`** that both `MountInterface` and
`NameHubInterface` extend, add `maybeLookup` (the primitive) and
`followNameChanges` to `EndoMount`, and keep `identify` / `locate` /
`reverseLookup` out of mounts (mount entries have no formulas).

That design was blocked on the name/signature alignment that
[fs-interface-reconciliation.md](fs-interface-reconciliation.md) has now
delivered, so C1 is unblocked. **New constraint discovered here:**
`ReadableNameHubInterface` cannot be a single shared method record, because
`EndoMount` uses `PathArgShape` (entry-accepting) while `NameHubInterface` uses
`NameOrPathShape`. The interface must either (a) standardize on
`NameOrPathShape` and have the mount accept entries through a *separate*
`entry()`-based path (it already has `entry()`), or (b) be defined as a method
record that each surface spreads and then overrides the entry-accepting methods.
Recommendation: (a) — it keeps the shared contract honest and matches Decision 3
(feature-detection is by method name, the interface is a documentation
contract).

*Blast radius:* `daemon/src/interfaces.js`, `mount.js` (add `maybeLookup`;
`followNameChanges` comes from `filesystem-watchers.md`), and the consumers that
discriminate by `__getMethodNames__` (chat inventory tree, `endo locate` /
`endo list`). Daemon gateway + mount tests.

### C2 — One source of truth for the shared `Directory` method shapes

The lite `Directory` / `File` guards are unimplemented and hand-copied by the
extended `Directory` and (via comments) by `EndoMount`. Extract the
*shared-shape* methods into exported **method-guard records** (not just
`M.interface` objects) so the extended `Directory`, `EndoMount`, and
`EndoDirectory` spread one definition and override only where they genuinely
widen it (per the divergence table).

Prerequisite: `@endo/platform/fs/lite` must export the raw method-guard records
(today it exports only the assembled `M.interface` guards). Once it does, the
extended guard becomes `M.interface('Directory', { ...sharedDirectoryMethods,
lookupStep, subView, create, ... })` and the hand-copy drift the daemon comment
warns about is structurally impossible.

*Blast radius:* `platform/src/fs/interfaces.js` (export records),
`platform/src/fs/extended/type-guards.js`, `daemon/src/interfaces.js`. This is
the structural fix that prevents the overlap from re-growing; do it alongside or
just after C1 so both consume the same records.

### C3 — Collapse the immutable-tree caps

`ReadableTree` (lite: `has` / `list` / `lookup`), `SnapshotTree` (lite:
`+ sha256` / `store` / `fetch`), and `EndoReadableTree` (daemon: `help` /
`sha256` / `has` / `list` / `lookup`) are three spellings of "content-addressed
immutable directory snapshot." `EndoReadableTree` and the catalog `SnapshotTree`
are nearly identical (both carry `sha256`). Converge on one shape; the daemon
guard re-exports or extends the platform one.

*Blast radius:* `platform/src/fs/interfaces.js`, `daemon/src/interfaces.js`, and
the `checkin` / `readable-tree` / git-tree formulas. Lower risk than C1/C2
because the read surface is small and stable, but still daemon-deep.

### C4 — Collapse the readable-bytes caps

`ReadableBlob` (lite), `BlobRef` (extended: `getInfo` / `fetch`), `SnapshotBlob`
(lite: `+ sha256`), `EndoReadable`, and `EndoBlob` (daemon: `help` / `text` /
`json`) are all "a handle to immutable bytes you can read or stream." The
fs-reconciliation **D3 / F7** decision already chose `SnapshotBlob` (with
`sha256()`) as the catalog shape over endo-fs's `BlobRef | null`, and flagged
the `BlobRef → SnapshotBlob` adapter as unbuilt (endo-fs ROADMAP F6). That
adapter is the *cost* of this overlap; converging the shape removes the need for
it. Converge on the `SnapshotBlob` shape (`text` / `json` / `streamBase64` /
`sha256`) and retire `BlobRef` / `EndoBlob` / `EndoReadable` onto it.

*Blast radius:* the widest — `BlobRef` is woven through the extended snapshot
path and the CAS cache. Sequence last; it depends on C3's tree decision (a tree
snapshot yields blob snapshots).

### C5 — Retire the unimplemented `lite` vocabulary, or give it a job

Once C2 makes the lite `Directory` / `File` the *source* of the shared method
records (rather than a parallel unimplemented guard), decide whether the
assembled `lite` `M.interface` objects still earn their keep or whether the
**catalog document** (fs-interface-reconciliation.md) is the vocabulary and the
code should ship only records + the real extended guard. This is a cleanup that
falls out of C2; no separate analysis needed.

## Target consolidated inventory

After C1–C5 the fs/name-hub interface set collapses roughly as:

- **Tree surfaces:** one shared `Directory` method record (C2); `EndoMount` and
  `EndoDirectory` are `ReadableNameHubInterface` + their own extensions (C1);
  extended `Directory` is the record + cap-FS extensions.
- **Immutable trees:** one `SnapshotTree` / `ReadableTree` shape (C3).
- **Immutable bytes:** one `SnapshotBlob` shape (C4); `BlobRef` retired.
- **Vocabulary:** records exported from `lite`; the catalog doc is the prose
  vocabulary (C5).

Net: roughly a third fewer fs-shaped guards, no hand-copied method shapes, and
no `BlobRef → SnapshotBlob` adapter.

## Sequencing

1. **C1** — name-hub unification (accepted; unblocked). Lands `ReadableNameHubInterface` and the canonical-shape decision.
2. **C2** — export shared `Directory` records; consume them in C1's interfaces. (1 and 2 are naturally one PR.)
3. **C3** — immutable-tree convergence.
4. **C4** — readable-bytes convergence (removes the unbuilt adapter); depends on C3.
5. **C5** — `lite` vocabulary cleanup; falls out of C2.

## Design decisions

- **Records, not inheritance.** `M.interface` has no native `extends`; the
  mechanism throughout is *exported method-guard records spread into multiple
  `M.interface()` calls*, with per-surface overrides where the divergence table
  requires. This is the only way to share shapes without a runtime introspection
  surface, and it matches namehub Decision 3 (the narrower interface is a
  documentation contract; runtime discrimination stays structural via
  `__getMethodNames__`).
- **Canonical shape = the narrower one + an explicit widener.** Per the
  divergence table, standardize the shared record on `NameOrPathShape`
  (`string | string[]`); surfaces that accept more (mount entries) expose that
  through their own additional methods (`EndoMount.entry()`), not by widening
  the shared method. This keeps the shared contract honest.
- **No big-bang.** Unlike the reconciliation's D3, this is sequenced
  (C1 → C5) because each phase is independently validatable and the blast radii
  differ by an order of magnitude (C1 is daemon-local; C4 touches the CAS path).

## Dependencies

| Design | Relationship |
|---|---|
| [fs-interface-reconciliation.md](fs-interface-reconciliation.md) | Prerequisite — aligned the names/signatures this builds on. |
| [namehub-interface-unification.md](namehub-interface-unification.md) | C1 *is* this design's accepted plan; folded in and unblocked here. |
| [filesystem-watchers.md](filesystem-watchers.md) | Supplies `followNameChanges` on `EndoMount`, a C1 input. |
| [platform-fs.md](platform-fs.md) | Owns the `lite` vocabulary that C2/C5 refactor. |

## Known gaps and TODOs

- [x] C1: unify `EndoNameHub` + `EndoDirectory` on `nameHubMethodGuards`.
- [x] C1: define `ReadableNameHubInterface` + `readableNameHubMethodGuards`
      (canonical shape resolved: `NameOrPathShape`); `EndoMount` satisfies it by
      method name, widening `has`/`lookup`/`maybeLookup` to `PathArgShape`; add
      `EndoMount.maybeLookup`.
- [ ] C1: add `followNameChanges` to the mount (blocked on
      filesystem-watchers.md).
- [x] C2: export `readableBlobMethodGuards` / `readableTreeMethodGuards` from
      `@endo/platform/fs/lite`; consume them in the lite + daemon read surfaces.
- [x] C3 / C4: `sha256` confirmed as the content-address accessor; `EndoBlob` /
      `EndoReadableTree` converged onto the shared records + `sha256`.
- [ ] C4: retire the extended `BlobRef` onto `SnapshotBlob` and remove the
      unbuilt `BlobRef → SnapshotBlob` adapter (endo-fs ROADMAP F6).
- [x] C5: remove the dead `ContentStore` / `SnapshotStore` guards.

## Prompt

> where's the doc that describes what interfaces exist and how they relate to
> each other. are there good candidates for reducing overlap and simplifying the
> inventory of interfaces? … do all
