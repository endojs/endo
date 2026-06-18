# Filesystem Interface Reconciliation

| | |
|---|---|
| **Created** | 2026-06-18 |
| **Updated** | 2026-06-18 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

## Status

Adopted onto `claude/fs-object-interfaces-m9tcat` and verified against the
live code (not just the prior designs).
The catalog and migration plan below are accurate as written, with two
corrections folded in from the code audit:

1. **endo-fs already names `remove` and `makeDirectory` as canonical**, with
   `unlink` / `mkdir` retained as legacy aliases.
   See `packages/endo-fs/src/type-guards.js` lines 93-102.
   The [Migration plan](#migration-plan) Phase 2 therefore only needs to add
   `write` (whole-blob) and `move` (versus endo-fs's wider-arity `rename`) to
   the endo-fs `DirectoryInterface`; `remove` / `makeDirectory` are already
   the catalog names on the wire.
2. **The full verified interface inventory is larger than the three headline
   surfaces.**
   The cap-FS surface fans out into sub-caps (`OpenFile`, `Cursor`, `Xattrs`,
   `NodeWatcher`, `BlobRef`, `Lock`, `Layer`, `PosixFs`) and the daemon
   carries its own content-addressed trees (`EndoReadableTree`, `EndoGitTree`,
   `EndoReadable`) plus the host-powers seam (`FilePowers`) and the
   byte-stream substrate (`@endo/exo-stream`'s `Passable*` family).
   These are enumerated, with file and line references, under
   [Appendix: verified interface inventory](#appendix-verified-interface-inventory).
   Design Decision 8 keeps most of them out of the *catalog* deliberately;
   the appendix exists so the *catalogue* of what currently exists is
   complete and grounded in code.

### Seam-hardening landed on this branch

The endo-fs `from-mount` adapter is the concrete bridge that lets an
`@endo/endo-fs` `Filesystem` (surface 3) wrap a daemon `Mount` (surface 2) —
the single place where two of the three headline surfaces meet in running
code.
Three fixes cherry-picked from `llm-kumavis-floot` make that seam actually
support create / write / truncate over a Mount, which the
[conformance matrix](#backing-implementation-conformance-matrix) marks **I**
for the mount and scratch-mount columns:

- `fix(daemon): keep mount errors host-path-safe and ENOENT-recognizable` —
  `packages/daemon/src/mount.js` renders error paths relative to the
  confinement root (no host-absolute-path leak) and tags not-found with
  `ENOENT` so the from-mount adapter creates a missing path instead of
  re-throwing.
- `fix(endo-fs): write to mounts via Mount.write with a reader ref` —
  routes writes through `Mount.write` with a base64 `ReadableBlob` reader ref
  (CapTP-passable) instead of handing a raw `Uint8Array` to `writeBytes`
  (which is not passable over CapTP), symmetric to how the adapter already
  reads via `streamBase64`.
- `fix(endo-fs): emulate setStat resize so mount truncate works` —
  implements `setStat` resize on the from-mount backend (read-current +
  rewrite-at-length through `Mount.write`) so `open({ truncate: true })`,
  `create`, and whole-file overwrite succeed over a Mount.

These are bug fixes, not interface changes: they validate that the catalog's
**I** cells for the mount-backed rows are honest.
`packages/endo-fs` (233 tests) and `packages/daemon` `mount.test.js` (63
tests) pass with the fixes applied.

## What is the Problem Being Solved?

Endo today has three live filesystem-shaped surfaces:

1. **`@endo/platform/fs`** ([platform-fs.md](platform-fs.md)): the canonical type lattice (Readable / Snapshot / Mutable) by (Blob / Tree).
   Exports `ReadableBlob`, `ReadableTree`, `SnapshotBlob`, `SnapshotTree`, `File`, `Directory`, `SnapshotStore`, `TreeWriter` from `packages/platform/src/fs/interfaces.js`.
   This is the storage-shaped surface.
2. **`@endo/daemon` `MountInterface`** ([daemon-mount.md](daemon-mount.md)): the live, mutable, symlink-confined wrapping of a physical filesystem directory.
   Names methods `has`, `list`, `lookup`, `write`, `remove`, `move`, `makeDirectory`, `readOnly`, `snapshot`, `help`, plus mount-specific extensions (`entry`, `stat`, `readText`, `writeText`, `makeFile`).
3. **`@endo/endo-fs`** ([packages/endo-fs/DESIGN.md](../packages/endo-fs/DESIGN.md)): the pipelinable, stream-friendly, cap-typed `Filesystem` cap with `Directory` / `File` subtypes, `qid` identity, range-I/O `OpenFile`, sub-cap `Xattrs` / `NodeWatcher` / `Lock`, and a `BlobRef` content-address bridge.
   The cap-FS surface tuned for cross-CapTP round-trip cost.

The three were drafted independently to solve overlapping but not identical problems.
A method to do a particular job has different names in each.
`Directory.lookup(['a', 'b'])` (platform-fs) is `E(dir).lookup('a').lookup('b')` (endo-fs) is `mount.lookup(['a', 'b'])` (daemon-mount).
`Directory.write(path, blob)` (platform-fs) covers what `Directory.create(name).write(offset)` (endo-fs) covers what `mount.write(path, value)` (daemon-mount) covers.
`File.snapshot() → SnapshotBlob` (platform-fs) overlaps with `File.snapshot() → BlobRef` (endo-fs).

The maintainer's framing (recorded verbatim under [Prompt](#prompt)):

> ... we need to close the gap better so that the filesystem viewer has a coherent foundation on which to stand, regardless of whether the backing implementation of a file-system-like-interface is a mount, scratch, memfs, content address store, or virtual filesystem like an endo directory or name hub.
> Some of these are partial implementations of shared interfaces, but where a method exists to do a job, that method should consistently have the same name and signature.

The five backings the maintainer named are not equally capable.
A CAS-backed `ReadableTree` is immutable by construction.
A `mount` is mutable but cannot pipeline a deep walk in one round-trip.
A `name hub` is mutable but does not carry filesystem semantics (no blob content).
A purely-in-memory FS can be synchronous on its own host but loses that property the moment it travels across CapTP.

The reconciliation does not collapse these into one shape.
It picks one **catalog of method names and signatures** that all five conform to, where they implement the method at all, and an **honest absence story** for each method any backing does not implement.
The filesystem viewer (per [chat-view-edit-commands.md](chat-view-edit-commands.md) and [formula-inspector.md](formula-inspector.md)) reads against the catalog, not against any one backing.
A control disabled with a tooltip naming the gap is a first-class outcome.

## Library and project references

The maintainer's hint "this work has been done before" maps to two
recently-active designs in the corpus that the new design must reconcile
with explicitly rather than re-derive: `designs/daemon-capability-filesystem.md`
(Reference vision; the wider three-layer architecture with four backends)
and `designs/platform-fs.md` (the recently-landed canonical type lattice
plus `packages/platform/src/fs/interfaces.js` as the actual exported
guards). Both are the prior art. The new design should cite them, build on
their vocabulary, and either supersede or extend rather than parallel.

### Library concepts and sections

- [`journal/library/sections/endo-but-for-bots--llm-designs-daemon-capability-filesystem--reference-vision-with-three-layer-architecture-and-four-backends-and-materialization-bridge.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-daemon-capability-filesystem--reference-vision-with-three-layer-architecture-and-four-backends-and-materialization-bridge.md)
  is the prior-art design the maintainer's "this work has been done before"
  refers to. The 966-line Reference document proposes a three-layer
  architecture (Guest Dir/File + VFS Namespace + Backends) and four
  backends sharing one Dir/File interface (Physical / Git Tree / Memory /
  CAS). The Endo-already-has-this-pattern section enumerates six existing
  pieces the design extends (pet-name directory, VFS-design-sketch,
  FilePowers, OS-sandbox-plugin, EndoDirectory, attenuate). The Seven
  Open Questions section names the still-unresolved decisions (backend
  interface shape, glob, overlapping mounts, atomicity across mounts,
  large-subtree materialization, `subDir` naming, attenuated-exo
  ownership). The new design either supersedes this Reference (with a
  migration map) or builds atop it.
- [`journal/library/sections/endo-but-for-bots--llm-designs-platform-fs--platform-package-with-conditional-exports-and-type-lattice-and-elevator-module-and-roadmap-calibration-per-git-blame-and-structural-attenuation.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-platform-fs--platform-package-with-conditional-exports-and-type-lattice-and-elevator-module-and-roadmap-calibration-per-git-blame-and-structural-attenuation.md)
  is the recently-landed canonical type lattice the new design must adopt
  as vocabulary. The Type-lattice-as-2x3-axis-table section names the
  six types (File / Directory / ReadableBlob / ReadableTree / SnapshotBlob
  / SnapshotTree) along three roles (Readable / Snapshot / Mutable) by two
  kinds (Blob / Tree); the Relationship-to-existing-interfaces section
  already explicitly maps each existing interface to the lattice
  (EndoNameHub / EndoDirectory to ReadableTree + Directory mutation
  surface; EndoReadable to SnapshotBlob; daemon-capability-filesystem's
  Dir/File to Directory/File). The Seven-numbered-Design-Decisions section
  is the recent canonical statement of the layer's discipline (notably
  Decision 4: readOnly returns the readable interface, not a frozen copy;
  structural attenuation, not behavioral). The Four-phase-implementation
  plan section reports phases 1-3 shipped, phase 4 (Mutable Directory and
  File with readOnly) outstanding; the new design's catalog must align
  with the live `packages/platform/src/fs/interfaces.js` exports.
- [`journal/library/sections/endo-but-for-bots--llm-designs-platform-fs--platform-package-with-conditional-exports-and-type-lattice-and-elevator-module-and-roadmap-calibration-per-git-blame-and-structural-attenuation--relationship-to-existing-interfaces-section.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-platform-fs--platform-package-with-conditional-exports-and-type-lattice-and-elevator-module-and-roadmap-calibration-per-git-blame-and-structural-attenuation--relationship-to-existing-interfaces-section.md)
  is the specific subsection that already does part of the reconciliation
  job the new design extends. It names stops-at-the-filesystem-boundary
  as a design discipline (platform/fs deliberately excludes
  formula-system concepts like `identify`, `locate`,
  `followNameChanges`) and explicitly defers `subDir()` to a future-VFS
  layer that composes `@endo/platform/fs` primitives. The new design
  IS that future VFS layer; it stitches platform/fs's tree primitives
  into the broader mount / scratch / memfs / CAS / virtual-filesystem
  surface.
- [`journal/library/sections/endo-but-for-bots--llm-designs-platform-fs--platform-package-with-conditional-exports-and-type-lattice-and-elevator-module-and-roadmap-calibration-per-git-blame-and-structural-attenuation--push-interface-treewriter-vs-p.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-platform-fs--platform-package-with-conditional-exports-and-type-lattice-and-elevator-module-and-roadmap-calibration-per-git-blame-and-structural-attenuation--push-interface-treewriter-vs-p.md)
  carries the canonical `TreeWriter` minimal-push-interface (writeBlob +
  makeDirectory) that decouples checkout target from any specific mutable
  tree implementation. Filesystem-viewer write paths against
  graceful-degradation backings (read-only CAS, snapshot-only tree)
  consume this distinction directly: a viewer's "save" path can be a
  TreeWriter target rather than a full Mutable Directory; partial
  implementations are first-class via the push/pull split.
- [`journal/library/sections/endo-but-for-bots--llm-designs-daemon-mount--two-formula-type-split-with-shared-exo-interface-and-realpath-at-operation-time-confinement--single-exo-interface-the-surface.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-daemon-mount--two-formula-type-split-with-shared-exo-interface-and-realpath-at-operation-time-confinement--single-exo-interface-the-surface.md)
  is the canonical `MountInterface` definition (has / list / lookup /
  write / remove / move / makeDirectory / readOnly / snapshot / help).
  This is the load-bearing prior art for the method catalog the new
  design must produce. The Five-method-groupings section (reads +
  mutation + attenuation + snapshot + help) is the existing template;
  the new catalog either adopts these names directly or supersedes
  them with a migration map. Note: `move` covers rename; permissions
  are host-controlled-not-mount-controlled (no chmod).
- [`journal/library/sections/endo-but-for-bots--llm-designs-daemon-mount--two-formula-type-split-with-shared-exo-interface-and-realpath-at-operation-time-confinement--two-formula-type-split.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-daemon-mount--two-formula-type-split-with-shared-exo-interface-and-realpath-at-operation-time-confinement--two-formula-type-split.md)
  is the two-formula-type-split (`mount` host-managed + `scratch-mount`
  daemon-managed) sharing one exo interface; the lifecycle-asymmetry
  versus implementation-symmetry pattern. Two of the five backing
  implementations the maintainer named (mount + scratch) are this design;
  the catalog must respect the shared-exo discipline.
- [`journal/library/sections/endo-but-for-bots--llm-designs-daemon-capability-filesystem--reference-vision-with-three-layer-architecture-and-four-backends-and-materialization-bridge--four-backend-types-sharing-one-dir-file-interface.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-daemon-capability-filesystem--reference-vision-with-three-layer-architecture-and-four-backends-and-materialization-bridge--four-backend-types-sharing-one-dir-file-interface.md)
  is the prior-art conformance-row table (Physical / Git tree / Memory /
  CAS, each with Mutability column and Use-case column). The new design's
  conformance enumeration extends this table with the maintainer's named
  fifth row (Virtual filesystem / endo directory / name hub) and folds
  scratch-mount into the Physical row (or splits Mount and Scratch as
  separate rows per the daemon-mount two-formula-type split).
- [`journal/library/sections/endo-but-for-bots--llm-designs-daemon-cas-management--content-address-store-as-supervisor-owned-subsystem-with-typed-content-retain-release-and-background-mark-sweep-gc.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-daemon-cas-management--content-address-store-as-supervisor-owned-subsystem-with-typed-content-retain-release-and-background-mark-sweep-gc.md)
  defines the CAS substrate the new design must conform with. The seven
  envelope verbs (`cas-store`, `cas-fetch`, `cas-has`, `cas-retain`,
  `cas-release`, `cas-store-tree`, `cas-gc`) plus the streaming variants
  (`cas-store-stream`, `cas-content-stream`) bound how a CAS-backed
  ReadableTree / SnapshotTree exposes blob retrieval and tree walking.
  The four content-types table (blob / snapshot / tree / archive) shows
  the typed-content discipline the reconciled interface must preserve.
- [`journal/library/sections/endo-but-for-bots--llm-designs-daemon-content-store-gc--design-and-api-extension.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-daemon-content-store-gc--design-and-api-extension.md)
  carries the refcount semantics for `readable-blob` / `readable-tree`
  content. A filesystem-viewer that "saves" a CAS-resident snapshot
  reduces to refcount changes, not byte motion; the reconciled interface
  must align with sweep-time refcount, not introduce a parallel counter.
- [`journal/library/sections/endo-but-for-bots--llm-designs-daemon-checkin-checkout--bidirectional-bridge-between-local-FS-and-formula-store-with-CLI-side-formulation--decision-3-readable-tree-stores-formula-ids-not-content-hashes.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-daemon-checkin-checkout--bidirectional-bridge-between-local-FS-and-formula-store-with-CLI-side-formulation--decision-3-readable-tree-stores-formula-ids-not-content-hashes.md)
  is the bidirectional bridge between local filesystem and daemon's
  immutable formula store. The pair-design-with-daemon-mount observation
  (mount = live-mutable; checkin/checkout = point-in-time-snapshot-and-
  restore) is the round-trip the new design must support: a filesystem
  viewer can both observe a live Mount and snapshot it through checkin,
  yielding the same readable-tree / readable-blob hierarchy. The
  no-metadata-preservation discipline (content-only, not filesystem-
  replica) bounds what the reconciled interface promises across backings.
- [`journal/library/sections/endo-but-for-bots--llm-designs-exo-zip-package--in-memory-zip-as-exo-readable-tree-with-asymmetric-by-design-read-API-and-resolved-questions-trail--the-reuse-platform-interface-not-daemon-interface-discipline.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-exo-zip-package--in-memory-zip-as-exo-readable-tree-with-asymmetric-by-design-read-API-and-resolved-questions-trail--the-reuse-platform-interface-not-daemon-interface-discipline.md)
  names `packages/platform/src/fs/interfaces.js` explicitly as the
  canonical interfaces source (`ReadableTreeInterface` with
  `has`/`list`/`lookup`; `ReadableBlobInterface` with `streamBase64`/
  `text`/`json`). The reuse-platform-interface-not-daemon-interface
  discipline is the load-bearing precedent: the reconciled interface
  catalog lives in this package, not in daemon-specific shapes. The
  which-side-of-CapTP-determines-the-interface observation (client side
  has narrower surface than daemon side) is relevant when the
  filesystem viewer is a CapTP client of the daemon.
- [`journal/library/sections/endo-but-for-bots--llm-designs-endo-posix-sandbox--cap-not-string-mounts-with-three-rule-security-boundary-and-pluggable-driver-interface--cap-not-string-mounts-the-load-bearing-constraint.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-endo-posix-sandbox--cap-not-string-mounts-with-three-rule-security-boundary-and-pluggable-driver-interface--cap-not-string-mounts-the-load-bearing-constraint.md)
  carries the cap-not-string-mounts discipline the new catalog must
  honor: every method signature takes a capability (a Mount, a
  Directory, a File), never a string host path. This applies as a
  constraint on `lookup(name)` (name is a path-segment string within
  the holder's confinement; not a host path) and `move(source, target)`
  (both arguments are capabilities or relative path-segments within one
  holder's confinement).
- [`journal/library/sections/endo-but-for-bots--llm-designs-chat-view-edit-commands--commands-viewer-editor-and-panel-layout--viewer-panel-view.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-chat-view-edit-commands--commands-viewer-editor-and-panel-layout--viewer-panel-view.md)
  is the existing chat-side `/view` viewer (and editor-panel-edit for
  `/edit`) that the filesystem-viewer-contract section of the new design
  builds atop. Renderer table (text / markdown / json / images), Monaco
  read-only mode, extension-as-content-type discipline. The reconciled
  interface defines what the viewer reads via its `text()`,
  `streamBase64()`, and `lookup()` calls; the viewer's
  graceful-degradation surface (write disabled when readOnly, mutation
  surface absent on a snapshot) is the contract this design must spell
  out.
- [`journal/library/sections/endo-but-for-bots--llm-designs-daemon-message-streaming--streamReply-and-streamSend-with-stream-formula-and-CapTP-rides-method-calls--streamreply-and-streamsend-with-stream-formula-and-captp-rides-method-calls.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-daemon-message-streaming--streamReply-and-streamSend-with-stream-formula-and-CapTP-rides-method-calls--streamreply-and-streamsend-with-stream-formula-and-captp-rides-method-calls.md)
  is the streaming substrate. The reconciled interface must decide
  whether reads of large blobs use a synchronous `read(path) -> Bytes`
  on small payloads with a separate `streamRead` / `streamBase64` for
  large; the design's open-question on streaming maps to this design's
  streamReader / streamWriter interfaces.
- [`journal/library/sections/endo-but-for-bots--llm-designs-formula-inspector--pop-the-bonnet-on-pet-named-capabilities-with-edit-toggle-and-retention-path-reveal.md`](../../journal/library/sections/endo-but-for-bots--llm-designs-formula-inspector--pop-the-bonnet-on-pet-named-capabilities-with-edit-toggle-and-retention-path-reveal.md)
  is the type-aware UI surface the filesystem-viewer extends. Formula-
  inspector's `@info` name hub and the 26-formula-types-with-type-
  specific-metadata table (live count today: 33 per the cc9a57
  designer's note; includes `mount`, `readable-tree`, `scratch-mount`,
  `make-from-tree`) is the inventory the viewer surfaces. The
  reconciled interface tells the viewer which methods are present on
  each type instance and which graceful-degradation messages to render
  when a method is absent.
- [`journal/library/sources/endo-but-for-bots--llm-designs-filesystem-watchers.md`](../../journal/library/sources/endo-but-for-bots--llm-designs-filesystem-watchers.md)
  is the followNameChanges parity-fix design: gives EndoMount a
  `followNameChanges` method matching EndoDirectory so polymorphic hub
  abstractions stop breaking at the subscription edge. Relevant to the
  filesystem viewer's "observe" surface: the reconciled interface should
  enumerate which backings can followNameChanges (mount, scratch, name
  hub) and which cannot (CAS is immutable; memfs may or may not).

### Project context

- [`journal/projects/endo-but-for-bots/README.md`](../../journal/projects/endo-but-for-bots/README.md)
  carries the project's standing rules: designs land DRAFT against the
  `llm` branch (Rules of engagement), the standing relaxation lets the
  designer open the PR without per-action authorization (Standing
  authorizations covers comment + review + reactji + cross-reference on
  this repo only), and every commenter is maintainer-equivalent for
  routing purposes (Authority structure). The designer can open the
  DRAFT PR and reply on inline threads without additional authorization.
- Related designs on the `llm` branch the designer should cite by
  relative path from this design:
  - [daemon-capability-filesystem.md](daemon-capability-filesystem.md) (the prior-art Reference
    vision; the new design either supersedes with a migration map or
    builds atop).
  - [platform-fs.md](platform-fs.md) (the canonical 2x3 type lattice and the
    `packages/platform/src/fs/interfaces.js` export source; the new
    design's catalog MUST adopt this vocabulary).
  - [daemon-mount.md](daemon-mount.md) (the live MountInterface with
    has/list/lookup/write/remove/move/makeDirectory/readOnly/snapshot/
    help; the catalog's reference shape).
  - [daemon-cas-management.md](daemon-cas-management.md) (the CAS substrate; the
    conformance row for CAS-backed reads).
  - [daemon-content-store-gc.md](daemon-content-store-gc.md) (refcount semantics for the
    CAS conformance row).
  - [daemon-checkin-checkout.md](daemon-checkin-checkout.md) (the snapshot round-trip;
    pair-design with daemon-mount).
  - [daemon-move-transfer-negotiation.md](daemon-move-transfer-negotiation.md) (PR #432; the move
    method's negotiated transfer ladder; the catalog's `move(source,
    target)` signature defers to this design's negotiation contract).
  - [endo-posix-sandbox.md](endo-posix-sandbox.md) (the cap-not-string-mounts
    discipline; constraint on every catalog signature).
  - [chat-view-edit-commands.md](chat-view-edit-commands.md) (the existing chat-side
    /view and /edit; the filesystem-viewer-contract builds on these).
  - [formula-inspector.md](formula-inspector.md) (the type-aware UI surface; the
    `@info` name hub and 33-formula-type inventory).
  - [filesystem-watchers.md](filesystem-watchers.md) (followNameChanges parity; the
    observe surface for the reconciled interface).
  - [exo-zip-package.md](exo-zip-package.md) (the reuse-platform-interface-not-
    daemon-interface discipline; the precedent for catalog reuse).
  - [daemon-message-streaming.md](daemon-message-streaming.md) (the streaming substrate;
    relevant to the streamRead open question).

## Divergence survey

### Purpose differences

| Package | Targets | Design center |
|---|---|---|
| `@endo/platform/fs` | Storage shape: the type lattice for what a value-of-the-filesystem IS. Both daemon and CLI consume it. Lite (platform-agnostic) and node (elevator) modules. | Snapshot / Readable / Mutable lattice. `SnapshotStore`. `TreeWriter` push interface. Conditional exports. |
| `@endo/daemon` `MountInterface` | One daemon-side concrete capability: a live, mutable, symlink-confined wrap of a physical host directory. Two formula types (`mount`, `scratch-mount`) sharing the exo. | Operation-time symlink confinement. Host-managed vs daemon-managed path lifecycle. `snapshot()` bridges to `readable-tree`. |
| `@endo/endo-fs` | A general-purpose cap-typed filesystem optimized for cross-CapTP round-trip cost. Composable backings (in-memory / node-fs / from-mount / CAS-cached / CoW layer). 9P-server-style. | Pipelinable `E(dir).lookup(a).lookup(b)`. `qid` identity. Range-I/O `OpenFile`. `BlobRef` content-address bridge. `compose` / `chroot` / `bind` / `namespace` algebra. |

The three are not redundant.
`platform/fs` is the **vocabulary**.
`daemon-mount` is one **concrete capability** in that vocabulary.
`endo-fs` is a **second concrete capability** that extends the vocabulary with cap-FS primitives platform/fs does not name (range-I/O, qid, watch, lock, xattr).

The maintainer's directive does not ask to unify endo-fs and platform/fs's interface guards (endo-fs's own DESIGN.md §2.1 already takes that stance: the two are not satisfied by a unified guard).
It asks that **where a method exists to do a job**, the name and signature is consistent.

(The 2026-06-18 retire/merge decision — [D4](#resolved-decisions-2026-06-18) —
does move toward co-location, but via a layered guard *tier*, not a single
unified guard; §2.1's "not satisfiable by one guard" constraint is honored by
keeping the cap-FS guards as a `sloppy`-extended tier above the base catalog
guards. See [Phase 1.5](#phase-15-endo-fs-retires-into-endoplatformfs).)

### Original design decisions that drove each implementation

The reconciliation — and especially the retire/merge of endo-fs into
platform/fs — must respect, not erase, the design decisions that each
implementation was built on. Recorded here so every later decision can be
checked against them.

**`@endo/platform/fs` was built on:**

1. **Storage-shape vocabulary, not mechanism.** It names *what a value of the
   filesystem IS* (the Readable / Snapshot / Mutable lattice over Blob /
   Tree), deliberately leaving *how bytes move* to the caps that implement it.
2. **Stops at the filesystem boundary.** It excludes formula-system concepts
   (`identify`, `locate`, formula-sense `followNameChanges`) on purpose so the
   vocabulary stays reusable by both daemon and CLI.
3. **Structural attenuation, not behavioral.** `readOnly()` returns a cap that
   *lacks* the mutation methods (platform-fs Decision 4), rather than a cap
   that throws on them — absence is the security boundary.
4. **Path-array convenience.** `has`/`list`/`lookup` take `string[]` and walk
   in one call, because the storage surface is consumed by code that knows the
   whole path up front.
5. **Minimal push interface (`TreeWriter`).** Checkout targets depend only on
   `writeBlob` + `makeDirectory`, decoupling "where bytes land" from any
   specific Mutable tree implementation.

**`@endo/endo-fs` was built on:**

1. **Optimize for cross-CapTP round-trip cost.** One `lookup(name)` per
   segment, relying on CapTP pipelining (`E(dir).lookup('a').lookup('b')`) to
   collapse a depth-N walk into one round-trip — the opposite of platform/fs's
   path-array walk, and intentional.
2. **9P / FUSE bridge readiness.** The surface is shaped so a 9P bridge can sit
   directly on it: range-I/O `OpenFile` (`read(offset, length)` /
   `write(offset)`), `qid` identity, pageable `Cursor`, advisory `Lock`,
   `Xattrs`, `NodeWatcher` — the POSIX-adjacent primitives the bridge needs.
3. **A backing seam (`FsBackend`), not per-backing reimplementation.** The
   `wrapBackend(backend) → Filesystem` upper layer owns all the exo plumbing
   once; each backing (in-memory, node-fs, from-mount, CAS-cached, CoW layer)
   implements a small required-core-plus-optional protocol. This is the seam
   the retire/merge must carry across intact — it is *why* new backings are
   cheap.
4. **Content-address bridge (`BlobRef`).** A snapshot is a hash handle that can
   short-circuit to a peer CAS on cache hit — a different optimization target
   than platform/fs's `SnapshotBlob` (a full Readable surface). The catalog
   picks `SnapshotBlob` for the viewer ([Decision 3](#design-decisions)); the
   merge keeps `BlobRef` available on the extended `File` for the peer-CAS job.
5. **A composition algebra.** `compose` / `chroot` / `bind` / `namespace`
   build filesystems from filesystems; `subView` is the catalog's narrow
   window onto this, but the algebra is endo-fs's own design DNA and survives
   the merge as the extended entry.

**How the reconciliation honors both:** the catalog names the *intersection*
job-for-job (so a viewer reads one vocabulary), while the layered-entry merge
keeps platform/fs's narrow storage guards as the base **and** preserves
endo-fs's cap-FS primitives — and the `FsBackend` seam — as the extended tier.
No driver above is dropped; each is relocated, not deleted.

### Interface differences (load-bearing)

| Job | platform/fs | daemon-mount | endo-fs |
|---|---|---|---|
| Test entry presence | `tree.has(...path)` | `mount.has(...path \| path[] \| entry)` | none directly; `Directory.lookup(name)` returns ENOENT-equivalent |
| List directory | `tree.list(...path)` | `mount.list(...path)` | `Directory.list() → Cursor`; cursor reads pages |
| Resolve child | `tree.lookup(...path) → Blob \| Tree` | `mount.lookup(path) → MountFile \| sub-Mount` | `Directory.lookup(name) → File \| Directory` (one segment) |
| Read blob to text | `blob.text()` | `mount.readText(path)` (path) / `file.text()` (file exo) | `OpenFile.read(0, length)` → stream; no text shortcut |
| Read blob to stream | `blob.streamBase64()` | `file.streamBase64()` | `OpenFile.read(offset, length) → PassableBytesReader`; `File.snapshot().fetch(...)` |
| Write blob (whole) | `dir.write(path, blob)` | `mount.write(path, value)` (string or `ReadableBlob`); also `mount.writeText(path, string)` | `Directory.create(name).write(0)` → writer stream |
| Write blob (range) | absent | absent | `OpenFile.write(offset)` → writer stream |
| Remove | `dir.remove(path)` | `mount.remove(path)` | `Directory.unlink(name)` / `Directory.remove(name)` |
| Rename / move | `dir.move(from, to)` | `mount.move(from, to)` | `Directory.rename(oldName, newParent, newName)` |
| Create directory | `dir.makeDirectory(path) → Directory` | `mount.makeDirectory(path) → sub-Mount` | `Directory.mkdir(name) → Directory` / `Directory.makeDirectory(name)` (alias) |
| Read-only attenuation | `mutable.readOnly() → Readable*` | `mount.readOnly() → ReadableTree` | `readOnly(fs)` (top-level composer, not a method) |
| Snapshot to CAS | `dir.snapshot() → SnapshotTree`; `file.snapshot() → SnapshotBlob` | `mount.snapshot() → SnapshotTree` | `File.snapshot() → BlobRef \| null` |
| Stat / metadata | absent on Readable; would live on Mutable | `mount.stat(path)` | `Node.getAttrs()` / `Node.getStat()` |
| Sub-directory view | absent (deferred to "future VFS layer" per platform-fs Decision) | `mount.makeDirectory(path)` returns a sub-Mount (the same `MountInterface`) | `chroot(fs, [path])` (composer) |
| Watch / observe | absent | `EndoMount.followNameChanges` (PR #277, open) | `Node.watch() → NodeWatcher`; `Directory.watchFrom() → { cursor, watcher }` |
| Help / introspection | absent | `mount.help() → string` | `Filesystem.help()` / `Node.help()` / every cap's `help()` |

The key divergences:

1. **Path-array versus one-step-per-cap.**
   platform/fs and daemon-mount take `string[]` paths and walk in one call.
   endo-fs takes one `string` per `lookup` and relies on CapTP pipelining to collapse depth-N walk into one round-trip.
   Both are intentional; the catalog must name both shapes where both backings will conform.
2. **Stream-shaped read versus whole-blob read.**
   platform/fs has `text()` / `json()` / `streamBase64()` (whole) and no range read.
   endo-fs has `OpenFile.read(offset, length) → reader` (range) and no whole-blob convenience.
   The catalog must name both, with the whole-blob form layered atop the range form for backings that have it.
3. **Snapshot return type.**
   platform/fs returns a `SnapshotBlob` / `SnapshotTree` (cap with `sha256()`).
   endo-fs returns a `BlobRef \| null` (cap or absent, with `getInfo()`).
   These are *not* the same shape and not interchangeable; the catalog must pick one.
4. **`readOnly()` location.**
   platform/fs and daemon-mount put `readOnly()` on the cap itself (method).
   endo-fs puts `readOnly(fs)` as a top-level composer.
   The catalog adopts both: cap-method for single-cap attenuation; top-level composer for whole-FS attenuation.

### Where they overlap (and how)

The three surfaces converge on a set of methods that all three name with identical or near-identical intent:

- **`has(path)` / `list(path)` / `lookup(path)`**: the read trio.
  platform/fs and daemon-mount take `string[]` paths; endo-fs takes `string` per call with pipelining.
- **`write(path, blob)` / `remove(path)` / `move(from, to)` / `makeDirectory(path)`**: the mutation set.
  platform/fs and daemon-mount adopt these names directly; endo-fs uses `create` / `unlink` / `rename` / `mkdir`.
- **`readOnly()`**: the attenuation method.
  platform/fs and daemon-mount; endo-fs uses a top-level composer.
- **`snapshot()`**: the bridge to content-addressed storage.
  All three name it; the return shapes differ (`SnapshotBlob` / `SnapshotTree` versus `BlobRef`).
- **`help()`**: the discoverability convention.
  All three name it.
- **`streamBase64()` / `text()` / `json()`**: the readable-blob convenience set.
  platform/fs and daemon-mount; endo-fs subsumes via `OpenFile.read`.

The reconciliation adopts the **platform/fs + daemon-mount names** as canonical for the catalog, because:

1. They are already the live exports in `packages/platform/src/fs/interfaces.js` and `packages/daemon/src/interfaces.js`.
2. The 2026-05-19 `exo-zip-package` precedent already declared `packages/platform/src/fs/interfaces.js` the canonical interfaces source.
3. `endo-fs` is designed to optimize cross-CapTP cost and is honest in its DESIGN.md §2.1 that its `File` / `Directory` guards are not the same shape as platform/fs's; it exports its own guards from `@endo/endo-fs/type-guards.js`.

`endo-fs` keeps its own guards.
The catalog names the methods that are shared in vocabulary, and `endo-fs` documents its name aliases for the methods where its names differ (`create` is `endo-fs`'s name for the catalog's `write`-of-new-file; `mkdir` is its name for `makeDirectory`; `unlink` is its name for `remove`; `rename` is its name for `move`).
Per `endo-fs`'s existing `DirectoryInterface`, both names already coexist on the wire (`mkdir` is declared as a legacy alias next to `makeDirectory`; `unlink` next to `remove`).

## Unified method catalog

The catalog below is the load-bearing deliverable.
Every backing in §Backing-implementation conformance matrix implements a subset of these methods; any method a backing names carries this name and signature.

### Reading

| Method | Signature | Returns |
|---|---|---|
| `has` | `has(...path: string[]) → Promise<boolean>` | True if a child exists at `path`. Empty path is "this node exists" (always true for a live cap). |
| `list` | `list(...path: string[]) → Promise<string[]>` | Sorted entry names at `path`. Throws if `path` is not a directory. Names that resolve outside the cap's confinement are excluded silently per the daemon-mount precedent. |
| `lookup` | `lookup(...path: string[]) → Promise<ReadableBlob \| ReadableTree>` (Readable surface) or `Promise<File \| Directory \| sub-Mount>` (Mutable surface) | Resolve a path to its cap. One-step `lookup('a')` is the cross-CapTP-pipelinable shape; path-array `lookup(['a', 'b'])` is the platform/fs convenience that always returns the deepest cap. Backings that prefer one-step (endo-fs) accept only `string`; backings that prefer path-array (platform-fs, daemon-mount) accept both per the existing `PathArgShape`. |
| `stat` | `stat(...path: string[]) → Promise<Attrs>` | Size, mtime, atime, ctime, btime. POSIX-isms (mode, owner, nlink) live in a future `PosixFs` companion cap per endo-fs DESIGN.md §9. |
| `streamBase64` | `streamBase64() → ReaderRef<string>` (Blob caps only) | Read entire blob as base64-encoded chunks. Falls back to the catalog's `read(offset, length)` form for backings that prefer range reads. |
| `text` | `text() → Promise<string>` | Read entire blob as UTF-8 text. |
| `json` | `json() → Promise<unknown>` | Read entire blob as parsed JSON. |
| `streamRead` | `streamRead(offset?: bigint, length?: bigint) → ReaderRef<Uint8Array>` (Blob caps that opt in) | Range-shaped streaming read. Aliased to `OpenFile.read(offset, length)` for endo-fs backings. Not on Readable caps that have no range surface. |

### Mutation

| Method | Signature | Returns |
|---|---|---|
| `write` | `write(path: string[], value: ReadableBlob \| string \| ReadableTree) → Promise<void>` | Write or overwrite an entry at `path`. String value means UTF-8 text; `ReadableBlob` streams. `ReadableTree` value triggers recursive copy. Creates parents as needed. |
| `writeText` | `writeText(path: string[], content: string) → Promise<void>` (Mutable Tree) or `writeText(content: string) → Promise<void>` (Mutable Blob) | Convenience over `write` for text. |
| `writeBytes` | `writeBytes(readable: AsyncIterable<Uint8Array>) → Promise<void>` (Mutable Blob) | Convenience for streaming bytes into a blob. |
| `append` | `append(text: string) → Promise<void>` (Mutable Blob) | Append text to a blob. |
| `remove` | `remove(path: string[]) → Promise<void>` | Remove a file or empty directory. Recursive remove is caller's responsibility per the daemon-mount precedent. |
| `move` | `move(source: string[], target: string[]) → Promise<void>` | Move an entry from `source` to `target`. Semantics follow [daemon-move-transfer-negotiation](daemon-move-transfer-negotiation.md): same-mount POSIX `renameat` to cross-peer CapTP byte stream, negotiated. |
| `copy` | `copy(source: string[], target: string[]) → Promise<void>` | Copy an entry. May be elided to refcount-bump on CAS-backed trees. |
| `makeDirectory` | `makeDirectory(path: string[]) → Promise<Directory \| sub-Mount>` | Create a directory at `path` (recursive). Return value is the live cap for the new subtree. |
| `makeFile` | `makeFile(path: string[], initial?: ReadableBlob \| string) → Promise<File>` (Mutable Tree) | Create a file at `path` and return its cap. Convenience for "open a new file for editing" without going through `write` first. |

### Attenuation

| Method | Signature | Returns |
|---|---|---|
| `readOnly` | `readOnly() → ReadableBlob \| ReadableTree` | Structural attenuation (per platform-fs Decision 4). Returned cap has only the Readable methods; mutation methods are *absent*, not *throwing*. |
| `subView` | `subView(path: string[]) → Promise<Directory \| sub-Mount \| ReadableTree>` | The future-VFS-layer method platform-fs defers (under the working name `subDir`) and daemon-capability-filesystem calls out. Re-roots the receiver at `path`. Returned cap cannot navigate above the new root (no parent reference); confinement is structural. For `mount`, identical to `lookup(path)` when `path` resolves to a directory plus a confinement-root shift; existing `provideSubMount` host method is the formula-bearing realization. Named `subView` (not `subDir`) per [Resolved decisions](#resolved-decisions-2026-06-18) D5. |

### Snapshot

| Method | Signature | Returns |
|---|---|---|
| `snapshot` | `snapshot() → Promise<SnapshotBlob \| SnapshotTree>` | Capture the cap's current state into the host's `SnapshotStore` and return the content-addressed cap. The catalog adopts platform-fs's `SnapshotBlob` / `SnapshotTree` shape (with `sha256()` method), **not** endo-fs's `BlobRef \| null` shape. See [Design Decisions](#design-decisions) Decision 3 for why. Backings that cannot cheaply produce a snapshot return a rejected promise with a structured error naming the gap (not `null`). |

### Observation

| Method | Signature | Returns |
|---|---|---|
| `followNameChanges` | `followNameChanges() → AsyncIterable<NameChangeEvent>` | Live name-change stream matching `EndoDirectory.followNameChanges`. Per [Resolved decisions](#resolved-decisions-2026-06-18) D6, implementations that cannot observe (CAS; immutable snapshots) return an **immediately-terminating empty stream** (not a rejected promise) so polymorphic consumers can call it without a presence check; memfs without a registered listener likewise returns an empty stream that terminates immediately. The viewer reads an immediately-closed stream as "snapshot / point-in-time." See [filesystem-watchers.md](filesystem-watchers.md) for the parity-fix design. |

### Discoverability

| Method | Signature | Returns |
|---|---|---|
| `help` | `help() → string` (or `help(level?: string) → string`) | Helpdown-formatted description of the cap, its method set, and any backing-specific notes. |
| `__getMethodNames__` | `__getMethodNames__() → string[]` | CapTP-introspection method automatically provided by `makeExo`. The filesystem viewer uses this to discover which catalog methods the backing exposes. Per [project/CLAUDE.md](../CLAUDE.md) § CapTP introspection. |

### Methods deliberately NOT in the catalog

| Method | Why not |
|---|---|
| `OpenFile.read` / `OpenFile.write` (range I/O with explicit close) | endo-fs's surface; tuned for 9P / FUSE bridge. Not appropriate for the general filesystem viewer. Backings that expose it (endo-fs) keep the method on their own `File` cap. The catalog's `streamRead(offset, length)` exposes the same job without the open / close handshake. |
| `lock` / `getLock` | endo-fs surface for advisory locks. The viewer does not need this. |
| `xattrs` | endo-fs surface for extended attributes. The viewer does not need this in v1; a `metadata` convenience could be layered later. |
| `Cursor` (streaming directory iteration) | endo-fs surface for very large directories. The catalog's `list(path) → string[]` is the convenience; backings that need to stream very large directories expose `Cursor` separately. |
| `identify` / `locate` / `followNameChanges`-on-formula-system-paths | Formula-system concepts (per platform-fs Decision: stops-at-filesystem-boundary). `followNameChanges` in the catalog is the *filesystem* sense, not the formula-system sense. |
| `chmod` / `chown` / POSIX mode bits | POSIX-isms; live in a future `PosixFs` companion cap per endo-fs DESIGN.md §9. Host-not-mount-controlled per daemon-mount Decision. |

## Backing-implementation conformance matrix

Rows are the five backings the maintainer named.
Columns are the unified-catalog methods.
Cells are: **I** (implemented), **A** (absent on this backing's interface; viewer renders the control disabled with a tooltip naming the gap), **D** (deferred to a stronger neighbor; e.g., `subView` on a mount = `lookup(path)` plus a confinement shift).

| Method | mount | scratch-mount | endo-fs in-memory | CAS (readable-tree / readable-blob) | endo directory / name hub |
|---|---|---|---|---|---|
| `has` | I | I | I (one-step `lookup` returns ENOENT) | I | I |
| `list` | I | I | I (`Cursor.toArray`) | I | I |
| `lookup` | I (path) | I (path) | I (one-step) | I (path) | I (one-step) |
| `stat` | I | I | I (`getStat`) | A (no mtime; immutable) | A (no blob content) |
| `streamBase64` | I (on `EndoMountFile`) | I | A (use `streamRead`) | I (on `EndoReadable`) | A |
| `text` | I (on file exo); `readText(path)` on mount | I | A (use `streamRead` + decode) | I | A |
| `json` | I (file exo) | I | A | I | A |
| `streamRead` | A (no range I/O) | A | I (`OpenFile.read`) | A (whole blob only) | A |
| `write` | I | I | I (`Directory.create` + writer) | A (immutable) | I (writes a name-binding, not blob content) |
| `writeText` | I | I | A | A | A |
| `writeBytes` | I (file exo) | I | I (`OpenFile.write`) | A | A |
| `append` | I (file exo) | I | A | A | A |
| `remove` | I | I | I (`unlink`) | A (refcount only) | I (removes name binding) |
| `move` | I (same-mount POSIX `renameat`) | I | I (`rename` cross-Directory) | D (refcount swap per move-transfer Tier 4) | I (rebind name) |
| `copy` | I (filesystem `cp`) | I | I | D (refcount bump) | I (alias name) |
| `makeDirectory` | I | I | I (`mkdir`) | A (CAS does not have a "create empty directory" verb) | I |
| `makeFile` | I | I | I (`create`) | A | A (name hub does not have a blob-content concept) |
| `readOnly` | I | I | I (composer `readOnly(fs)`) | I (identity; CAS is already read-only) | I |
| `subView` | I (`makeDirectory(path)` plus a sub-mount; or `provideSubMount` per daemon-mount Phase 4) | I (same) | I (`chroot(fs, path)`) | I (descend the tree manifest) | I (re-root the name hub) |
| `snapshot` | I (writes a `readable-tree` to CAS) | I (same) | I (recursive checkin) | I (identity; already a snapshot) | A (name bindings have no content to snapshot; viewer surfaces gap) |
| `followNameChanges` | I (PR #277) | I (PR #277) | I (in-memory event emitter) | I (immediately-terminating empty stream; CAS is immutable — see D6) | I (existing EndoDirectory method) |
| `help` | I | I | I | I | I |

Total: 24 methods. Mount and scratch-mount implement 21. endo-fs in-memory implements 16 directly plus 4 via aliases. CAS implements 12 (counting `followNameChanges` as an immediately-terminating empty stream per D6). Name hub implements 12 (no blob content surface).

Per platform-fs Decision 4, attenuation is *structural*: where a method is **A**bsent, the cap simply does not have the method.
Calling `E(cap).writeText(...)` on a name hub returns a `Cannot deliver` error from CapTP's interface guard.
The viewer's graceful-degradation path is to call `E(cap).__getMethodNames__()` once per cap and disable the controls whose method names are absent.

## Filesystem-viewer contract

The filesystem viewer is the user of the catalog.
Its job: given any cap whose interface includes some non-empty subset of the catalog, render an interactive surface that exposes the methods the cap implements and explains the methods the cap does not.

### What the viewer reads

For the **inventory pane** (the per-cap surface in chat-value-modal-formula-view's modal back-face per [formula-inspector.md](formula-inspector.md)):

```js
const methods = await E(cap).__getMethodNames__();
const hasRead   = methods.includes('list') || methods.includes('text');
const hasWrite  = methods.includes('write') || methods.includes('writeText');
const hasMove   = methods.includes('move');
const hasRemove = methods.includes('remove');
const canSnapshot = methods.includes('snapshot');
const canObserve  = methods.includes('followNameChanges');
```

For a **directory cap**: list children via `list()`, render as the existing chat tree view, with per-row controls (open / write / remove / move) enabled only when the corresponding catalog method is in `methods`.

For a **blob cap**: render via the existing `chat-view-edit-commands` viewer pipeline.
The viewer picks `text()` or `json()` or `streamBase64()` based on extension-as-content-type per chat-view-edit-commands' viewer table.
The "save" path uses `writeText(content)` if the cap has it; otherwise the editor toolbar's save button is disabled with a tooltip naming the gap.

### What the viewer writes

The viewer's "edit a file" path:

```js
const blobCap = await E(treeCap).lookup(...path);
const methods = await E(blobCap).__getMethodNames__();
if (methods.includes('writeText')) {
  // Editor is enabled
  const editor = await openMonacoEditor({
    initial: await E(blobCap).text(),
    onSave: async (newContent) => E(blobCap).writeText(newContent),
  });
} else {
  // Editor is read-only with a tooltip
  await openMonacoEditor({
    initial: await E(blobCap).text(),
    readOnly: true,
    tooltip: 'This blob is read-only (snapshot, name hub, or attenuated view).',
  });
}
```

For a **tree-level "save"** that does not modify an individual blob but the structure (rename, move, delete):

- `move` calls go through the catalog's `move(source, target)`, which per [daemon-move-transfer-negotiation](daemon-move-transfer-negotiation.md) negotiates the strongest tier its endpoints share.
- `copy` similarly.
- `remove` requires confirmation; the viewer's UX names the cap's backing (mount versus CAS versus name hub) so the user can tell the difference between "filesystem delete" and "refcount release."

### What the viewer observes

If `followNameChanges` is in the cap's method set, the viewer subscribes and re-renders the tree on each event.
If absent, the viewer renders a "snapshot" badge in the panel chrome, indicating the view is point-in-time.
The user can manually refresh by re-calling `list()`.

### Graceful-degradation surface

The viewer never crashes on an absent method.
Its discipline:

1. **Discover once.** Call `__getMethodNames__()` once per cap; cache by `qid` (when present) or by cap-identity (when CapTP slot identity is stable).
2. **Render the negative space.** Controls whose method is absent are disabled, not hidden. The disabled state carries a tooltip per the per-method table below.
3. **Backing-aware messaging.** The tooltip names the gap in user-meaningful terms, not in method-name terms. "Cannot edit: this is an immutable snapshot" is better than "writeText not in __getMethodNames__".

| Method absent | Tooltip |
|---|---|
| `write` / `writeText` / `writeBytes` | This entry is read-only (snapshot, attenuated view, or name-only hub). |
| `remove` | Cannot delete from this view (snapshot, or content-addressed store). |
| `move` | Cannot move within this view (snapshot, or read-only attenuation). |
| `makeDirectory` / `makeFile` | Cannot create new entries here. |
| `snapshot` | Cannot capture: this view has no blob content (name-only hub). |
| `followNameChanges` | Live updates not available; refresh manually. |
| `text` / `json` / `streamBase64` | This entry has no blob content. |
| `subView` | Cannot scope into a subtree from this view. |

## Sync versus async surface

**Async.** Every method in the catalog returns a `Promise`.

Reasoning:
- The catalog must cross CapTP without re-shaping. Daemon caps reach the chat viewer over CapTP; even a same-process memfs cap returned to the daemon goes through `E(cap).method()` which is eventually-resolving.
- A "sync" surface available only on a same-process backing introduces a foot-gun: callers write code against the sync surface, ship it, and break the moment the cap is handed across a CapTP boundary.
- endo-fs DESIGN.md §4.10 settled this for its own surface: "sync" getters (`qid`, `BlobRef.hash` / `size`) are usage-convention sync (responder doesn't do I/O), not RTT-free sync. Pipelining via `Promise.all` / `M.await` collapses N control-flow-independent calls into one round-trip; this is the right answer for the catalog too.

A backing whose state is in the local process (memfs) is free to resolve its returned promises synchronously where the spec allows, but the **surface signature** is `Promise<T>`.

## Migration plan

Existing call sites are categorized by which divergent name they use.
The migration introduces aliases (both names exist on the wire) for one minor release, then the legacy name is removed.

### Phase 1: Catalog land (no behavior change)

- Land the catalog in `packages/platform/src/fs/interfaces.js` as the canonical guards. (Already there for the platform-fs subset.)
- Land `subView` on `Directory` / `Mutable Tree` guards as a new method per the catalog (named `subView`, not `subDir`, per D5).
- Land `followNameChanges` on `MountInterface` per [filesystem-watchers.md](filesystem-watchers.md) (PR #277).
- Land `streamRead` on `Blob` guards as an opt-in method (backings that have range I/O implement it; others leave it absent).
- Land `makeFile` on `Mutable Tree` per the catalog (already on `MountInterface`; add to `DirectoryInterface` in platform/fs).

The platform-fs guard set after Phase 1 is the canonical catalog.

**Migration style: big-bang, not gradual** (maintainer decision 2026-06-18;
[Resolved decisions](#resolved-decisions-2026-06-18) D3).
The design originally argued for a gradual roll-out citing the standing
per-package / per-commit preference; the maintainer overrode that here.
The two design considerations that make big-bang acceptable in this one case:

1. **endo-fs is a single package with a contained test surface.** The rename
   does not fan out across many independently-owned packages the way a
   cross-cutting daemon change would; the blast radius is `packages/endo-fs`
   plus its two direct consumers (`packages/9p-server`,
   `packages/claude-container`).
2. **endo-fs is being retired into platform/fs** (D4 below). A
   dual-names-forever alias layer is pointless when the package itself is
   dissolving — keeping legacy aliases alive would preserve a seam we are
   about to delete. Big-bang renames *and* re-homes in one cutover.

### Phase 1.5: endo-fs retires into `@endo/platform/fs`

[Resolved decisions](#resolved-decisions-2026-06-18) D4 chose **retire /
merge** over keep-diverged. endo-fs's cap-FS surface moves into platform —
most plausibly a `@endo/platform/fs/extended` (or `/cap`) entry that sits
above the lite/node entries — and `@endo/endo-fs` becomes either a thin
re-export shim during one release or is deleted outright.

The load-bearing design consideration this must confront (it was the *reason*
the design originally argued keep-diverged): **endo-fs's `File` / `Directory`
guards are not the same shape as platform/fs's** — its DESIGN.md §2.1 states
the contracts diverge (range-I/O `OpenFile`, `qid` identity, `Cursor` paging,
sub-caps). Retire/merge therefore is **not** a name-level reconciliation; it
is a guard-level merger and must resolve that divergence, not paper over it.
Two viable shapes:

- **Layered entry (recommended).** platform/fs keeps its narrow Mutable
  `File` / `Directory` guards as the *base*; the cap-FS surface (range I/O,
  `Cursor`, `Xattrs`, `NodeWatcher`, `BlobRef`, `Lock`, `Layer`, `PosixFs`)
  lands as an *extended* entry whose guards `M.interface(..., { sloppy:
  true })`-extend the base. One package, two guard tiers, no contract
  collision: a consumer that only needs the catalog imports the base; the
  9P / FUSE bridge imports extended.
- **Single merged guard.** Fold everything into one `Directory` / `File`
  guard. Rejected: it forces CAS and name-hub backings to face guards they
  can never satisfy, the exact failure mode Design Decision 8 calls out.

The migration sequencing inside the big-bang cutover:

1. Land the cap-FS surface as a `@endo/platform/fs/extended` entry (move
   `packages/endo-fs/src/*` under `packages/platform/src/fs/extended/`,
   re-export the existing guards from there).
2. Rename all call sites to catalog names in the same sweep (see table).
3. Re-home `packages/9p-server` and `packages/claude-container` onto
   `@endo/platform/fs/extended`.
4. Replace `packages/endo-fs` with a deprecation re-export shim (one release)
   or delete it; update `workspace:^` dependents.
5. Fold endo-fs's `DESIGN.md` and `ROADMAP.md` into platform-fs's design
   corpus; file the tracking issue named in D4.

### Call-site rename (executed in the same cutover)

The rename is **semantic, not syntactic** — a codemod is not appropriate
because endo-fs's `create` (returns an `OpenFile` for range I/O) and the
catalog's `write` (whole blob) are not equivalent. Each site is reviewed.

| Call site | Old | New |
|---|---|---|
| `packages/endo-fs/src/*` → `packages/platform/src/fs/extended/*` | `create` / `unlink` / `rename` / `mkdir` | catalog (`write` where whole-blob; `create` kept on the extended `File` for range I/O; `remove` / `move` / `makeDirectory` canonical) |
| `packages/9p-server/*` | endo-fs names + `@endo/endo-fs` import | catalog names + `@endo/platform/fs/extended` import |
| `packages/claude-container/*` (9P bridge consumer) | `@endo/endo-fs` import | `@endo/platform/fs/extended` import |
| `packages/chat` filesystem-viewer (new) | — | catalog names from day one |
| `packages/cli/src/commands/checkin.js` / `checkout.js` | already catalog | unchanged |
| `packages/daemon/src/mount.js` | already catalog | unchanged |

Legacy endo-fs names (`unlink` / `mkdir`) are **removed** in this cutover, not
deferred — there is no surviving `@endo/endo-fs` package to keep them honest.

## Cross-design coordination

- **[platform-fs.md](platform-fs.md)** § *Relationship to existing interfaces*: already does part of the reconciliation; this design extends to mount / scratch / CAS / endo-fs / name hub. platform-fs's "stops at the filesystem boundary" discipline is preserved.
- **[daemon-mount.md](daemon-mount.md)** § *Exo Interface*: the existing live `MountInterface` is the catalog's reference shape for method names and groupings. No name changes on `MountInterface`; only `subView` and `followNameChanges` land as new methods.
- **[daemon-capability-filesystem.md](daemon-capability-filesystem.md)**: this design IS the future-VFS-layer the platform-fs Decision and the capability-filesystem document both defer to. The catalog's `subView`, plus the future `compose` / `chroot` / `bind` / `namespace` algebra (deferred per [Resolved decisions](#resolved-decisions-2026-06-18)), realize the three-layer architecture.
- **[daemon-cas-management.md](daemon-cas-management.md)** + **[daemon-content-store-gc.md](daemon-content-store-gc.md)**: the CAS conformance row aligns with sweep-time refcount. `snapshot()` increments the refcount; `move` / `copy` between CAS-resident endpoints reduce to refcount swaps per [daemon-move-transfer-negotiation](daemon-move-transfer-negotiation.md) Tier 4.
- **[daemon-checkin-checkout.md](daemon-checkin-checkout.md)**: the snapshot round-trip the viewer supports. A `mount.snapshot()` produces a `readable-tree` that the viewer can re-open as a `ReadableTree` cap, observing the same content.
- **[daemon-move-transfer-negotiation.md](daemon-move-transfer-negotiation.md)** (PR #432): the catalog's `move(source, target)` defers all six-tier negotiation to this design. The catalog's signature is the polymorphic option (a).
- **[endo-posix-sandbox.md](endo-posix-sandbox.md)**: cap-not-string-mounts. Every signature in the catalog takes a capability (a Mount, a Directory, a File), never a host path string. `lookup(name)` is a path-segment string within the holder's confinement; not a host path.
- **[chat-view-edit-commands.md](chat-view-edit-commands.md)** + **[formula-inspector.md](formula-inspector.md)**: the type-aware UI surfaces the filesystem-viewer extends. The viewer's renderer table (text / markdown / json / images) is unchanged; the catalog tells it which methods are present.
- **[filesystem-watchers.md](filesystem-watchers.md)** (PR #277): landing `followNameChanges` on `MountInterface` is the catalog's *observe* row.
- **[exo-zip-package.md](exo-zip-package.md)** § *reuse-platform-interface-not-daemon-interface*: the precedent for the catalog living in `packages/platform/src/fs/interfaces.js` rather than a daemon-specific shape.
- **[daemon-message-streaming.md](daemon-message-streaming.md)**: substrate for `streamRead` when added. Backings that implement `streamRead` use `streamReader` / `streamWriter` from this design.

## Design Decisions

1. **Each method name is chosen on merit and recorded — not adopted verbatim.**
   (Maintainer decision 2026-06-18; supersedes the original verbatim-adoption
   stance. See [Resolved decisions](#resolved-decisions-2026-06-18) D1.)
   The default is still the existing MountInterface / platform-fs name where
   it is the *best* name for the job — `has`, `list`, `lookup`, `write`,
   `remove`, `move`, `makeDirectory`, `readOnly`, `snapshot`, `help`,
   `stat`, `makeFile`, `writeText`, `streamBase64`, `text`, `json`,
   `append`, `writeBytes` all survive that test, so the catalog keeps them.
   The difference from verbatim adoption is the *discipline*: where two
   existing names compete, or an existing name is poor, the catalog picks
   the better one and records the rationale here rather than inheriting an
   accident of history. Two such judgements are already recorded:
   - The in-session re-root method is named **`subView`**, not `subDir`
     (D5 / Decision 5) — chosen to avoid colliding with the formula-bearing
     `provideSubMount` and because it re-roots a *view*, not necessarily a
     directory.
   - `move` (two path arrays) is the catalog name over endo-fs's
     wider-arity `rename(name, newParent, newName)` — the two-path-array
     shape reads consistently with `copy` and with the daemon-mount
     precedent.
   New methods: `subView`, `streamRead`, `followNameChanges` (per
   [filesystem-watchers.md](filesystem-watchers.md)), `copy` (already on
   platform-fs Directory).
   Design consideration in tension: verbatim adoption had a real benefit —
   zero rename cost for daemon + platform/fs code. Best-names-on-merit gives
   that up only at the margin (the bulk of names are unchanged) in exchange
   for a catalog whose every name is defensible on its own terms.

2. **All methods return Promise.**
   Per [Sync versus async surface](#sync-versus-async-surface): async is the only surface that survives CapTP without re-shaping. Sync resolution where the local backing allows is an implementation detail under a Promise return.

3. **`snapshot()` returns `SnapshotBlob` / `SnapshotTree`, not `BlobRef \| null`.**
   The catalog adopts platform-fs's `SnapshotBlob` / `SnapshotTree` shape because:
   - It is already the live export in `packages/platform/src/fs/interfaces.js`.
   - It is content-addressed *and* a full Readable surface (`text`, `streamBase64`, `json`, `has`, `list`, `lookup`) on one cap, matching the viewer's needs without a second hop.
   - It pairs with `SnapshotStore` for ingest and is the shape `endo checkin` already returns.
   endo-fs's `BlobRef` is a different shape optimizing for a different job (peer CAS short-circuit on cache hit). endo-fs keeps `BlobRef` for its `File.snapshot()` cap; backings that consume the catalog's `snapshot()` get the catalog's shape. An adapter from `BlobRef` to `SnapshotBlob` lives in endo-fs's `from-readable-tree.js` (per its ROADMAP F6).

4. **`readOnly()` is a cap method, not (only) a composer.**
   Returning a `ReadableBlob` / `ReadableTree` from `cap.readOnly()` is the catalog's per-cap attenuation. endo-fs's top-level `readOnly(fs)` composer is a *separate* affordance for whole-filesystem attenuation and remains on endo-fs.
   Rationale: chat-side attenuation is one cap at a time (an editor attenuates *this* file before passing it to a preview pane). The composer is for filesystem-construction time.

5. **`subView` lands as a new method on Mutable Tree, ReadableTree (where it makes sense), and `MountInterface`.**
   Named `subView` (not `subDir`) per the maintainer decision
   ([Resolved decisions](#resolved-decisions-2026-06-18) D5): the name
   avoids the overlap with the formula-bearing `provideSubMount` and reads
   as "a re-rooted *view*," which is what it is — a transient attenuator, not
   a new directory.
   Platform-fs deferred this method (under the working name `subDir`) to "a
   future VFS layer that composes `@endo/platform/fs` primitives." This
   design IS that layer; it ships the method as `subView`.
   For `mount`, `subView(['a', 'b'])` is equivalent to `lookup(['a', 'b'])`
   *plus* a confinement-root shift to `path.join(mountRoot, 'a', 'b')`. The
   existing `provideSubMount` host method is the formula-level realization;
   `subView` is the in-exo, no-new-formula realization (an attenuator, like
   `readOnly`).
   For `endo-fs` (the cap-FS, post-merge `@endo/platform/fs/extended`),
   `subView` is sugar over `chroot(fs, path)`.
   For a `ReadableTree` (CAS), `subView` descends the tree manifest and
   returns a `ReadableTree` over the subtree's root sha256.

6. **`streamRead` is opt-in.**
   Range I/O makes sense for endo-fs (9P / FUSE bridge) and possibly for a future block-storage backing.
   It does not make sense for a CAS-resident blob (whole-blob fetch is the substrate's natural unit) or a name hub (no content).
   Backings opt in by listing `streamRead` in their interface; the viewer surfaces it only when present.

7. **`subView` returns a structural sub-view, not a new formula.**
   Per the daemon-mount precedent (transient lookup exos, not formulas). Creating a new formula for every sub-directory visited would pollute the formula store. `provideSubMount` (host method) is the formula-bearing version for grants that must survive daemon restart; `subView` (exo method) is the in-session version. The name difference (`subView` versus `provideSubMount`) now also signals the lifetime difference at the call site, which the old `subDir` / `provideSubMount` pairing did not.

8. **The catalog is silent about `OpenFile`, `Cursor`, `Lock`, `Xattrs`, `NodeWatcher`.**
   These are endo-fs's own surface and stay on endo-fs.
   Trying to fold them into the catalog would either (a) force every backing to implement them (impossible for CAS, name hub), or (b) make them so commonly **A**bsent that the catalog row would be noise.
   The clean line: the catalog covers what the *filesystem viewer* needs; the cap-FS surface (range I/O, advisory locks, kernel-style watches, xattrs) stays on endo-fs for the 9P / FUSE / OS-bridge consumers.

## Resolved decisions (2026-06-18)

The maintainer resolved all seven open decisions on 2026-06-18.
Each is recorded below **with the design considerations that bear on it**,
including the cases where the chosen answer overrode the rationale the design
had originally argued — the consideration does not disappear because the
decision went the other way; it becomes a cost to manage.

**D1 — Names: choose the best name per job and record the decision.**
*Not* automatic verbatim adoption of MountInterface (the design's original
pick).
- *Consideration for verbatim:* zero rename cost for daemon + platform/fs.
- *Consideration for best-on-merit:* a catalog whose every name is defensible
  on its own terms, not inherited as an accident of which surface happened to
  name the method first.
- *Resolution:* keep the existing name where it is the best name (the large
  majority survive), but where names compete or one is poor, pick the better
  and record it. First two recorded judgements: `subView` (not `subDir`, D5)
  and `move` two-path-array (not endo-fs's wider `rename`). See
  [Design Decision 1](#design-decisions).

**D2 — Async-only surface.** Confirmed. Every catalog method returns
`Promise<T>`.
- *Consideration:* a sync surface is safe only for backings that never cross
  CapTP; same-process memfs is the only candidate, and the foot-gun (code
  written against sync breaks the moment the cap travels) is not worth the
  local convenience. Same-process backings may still resolve synchronously
  *under* the Promise. See [Sync versus async surface](#sync-versus-async-surface).

**D3 — Migration: big-bang, not gradual.** Overrides the design's original
gradual pick.
- *Consideration against big-bang (originally decisive):* the standing
  per-package / per-commit migration preference; gradual keeps each step
  small and revertible.
- *Considerations that make big-bang acceptable here:* endo-fs is a single
  package with a contained test surface (blast radius is endo-fs + 9p-server
  + claude-container), and — decisively — endo-fs is being **retired** (D4),
  so a dual-name alias layer would preserve a seam we are about to delete.
- *Cost to manage:* one large reviewed cutover instead of several small ones;
  mitigated by the semantic (not codemod) per-site review and by the full
  endo-fs/daemon/9p test suites gating the cutover. See [Migration plan](#migration-plan).

**D4 — endo-fs future: retire / merge into `@endo/platform/fs`.** Overrides
the design's original keep-diverged pick.
- *Consideration against merge (originally decisive):* endo-fs's DESIGN.md
  §2.1 holds that its `File` / `Directory` guards are **not unifiable** with
  platform/fs's — the contracts genuinely diverge (range-I/O `OpenFile`,
  `qid`, `Cursor`, sub-caps). A name-level reconciliation sidesteps this; a
  merge must confront it.
- *Resolution & how the consideration is honored:* merge via a **layered
  entry** (`@endo/platform/fs/extended`) so the divergence is expressed as a
  guard *tier* (base catalog guards + sloppy-extended cap-FS guards) rather
  than a single collision; the alternative single-merged-guard is rejected
  precisely because it would force CAS / name-hub backings to face guards
  they can never satisfy ([Design Decision 8](#design-decisions)). Tracking
  issue to be filed when this design lands. See
  [Phase 1.5](#phase-15-endo-fs-retires-into-endoplatformfs).

**D5 — `subView`, not `subDir`.** The in-session re-root method is named
`subView`.
- *Consideration:* `subDir` collided (in name) with the formula-bearing
  `provideSubMount`, and the two have different lifetimes (transient exo vs
  persisted formula). `subView` names the *view* attenuation and removes the
  overlap, making the lifetime difference legible at the call site.
- `provideSubMount` (host method, formula-bearing) is unchanged; `subView`
  (exo method, in-session) is the transient attenuator. See
  [Design Decisions 5 and 7](#design-decisions).

**D6 — `followNameChanges` is present on CAS as an immediately-terminating
empty stream.** Overrides the design's original *absent* pick.
- *Consideration against (originally decisive):* the no-content-no-method
  principle — a method that can never do anything is noise, and consumers can
  check `__getMethodNames__()` before subscribing.
- *Consideration for (chosen):* polymorphic consumers can call
  `followNameChanges` uniformly without a per-cap presence check; the empty
  stream is an honest "nothing will ever change here" rather than a missing
  capability.
- *Cost to manage:* the conformance matrix CAS cell flips **A → I (empty
  stream)**, and the viewer's observe path must treat an immediately-closed
  stream as "snapshot / point-in-time," not as "live with no events yet."
  See the [conformance matrix](#backing-implementation-conformance-matrix) and
  the [observation row](#observation).

**D7 — Streaming substrate: `@endo/exo-stream`.** Confirmed.
- *Consideration:* `@endo/exo-stream` is the established substrate endo-fs
  already uses and that platform-fs's `streamBase64` uses via
  `Reader<string>`; reusing it keeps one byte-transit shape across the
  catalog rather than introducing `daemon-message-streaming`'s
  `streamReply` / `streamSend` as a second. `streamRead` uses
  `PassableBytesReader` / `PassableBytesWriter`.

### Deferred (not a maintainer decision)

**Library/journal gaps the researcher flagged** — no dedicated library
section for the cap-FS surface, no `name-hub-as-vfs-backing` concept page, the
source survey done from package code rather than a library section. These are
*librarian* / *scholar* tasks, not design blockers; to be filed as journal
`message` entries to gardener / librarian after this design lands.

## Prompt

> Please dispatch a designer to investigate where
> @endo/endo-fs and @endo/platform/fs diverge in purpose
> and where their interfaces can be reconciled. This work
> has been done before, but we need to close the gap
> better so that the filesystem viewer has a coherent
> foundation on which to stand, regardless of whether the
> backing implementation of a file-system-like-interface
> is a mount, scratch, memfs, content address store, or
> virtual filesystem like an endo directory or name hub.
> Some of these are partial implementations of shared
> interfaces, but where a method exists to do a job, that
> method should consistently have the same name and
> signature.

## Appendix: verified interface inventory

The body of this design reasons at the level of the three headline surfaces
and the five named backings.
This appendix is the exhaustive catalogue of every filesystem-shaped
interface that exists in the tree today, with file and line references,
so that "catalogue them" is answered completely and the reconciliation is
grounded in code rather than in the prior designs alone.
Verified on `claude/fs-object-interfaces-m9tcat`.

### Surface 1 — `@endo/platform/fs` (the vocabulary)

All guards in `packages/platform/src/fs/interfaces.js`:

| Interface | Line | Methods |
|---|---|---|
| `ReadableBlobInterface` | 12 | `streamBase64`, `text`, `json` |
| `SnapshotBlobInterface` | 19 | `sha256`, `streamBase64`, `text`, `json` |
| `ReadableTreeInterface` | 27 | `has`, `list`, `lookup` |
| `SnapshotTreeInterface` | 34 | `sha256`, `has`, `list`, `lookup` |
| `ContentStoreInterface` | 42 | `store`, `fetch`, `has` |
| `SnapshotStoreInterface` | 49 | `store`, `fetch`, `has`, `loadBlob`, `loadTree` |
| `TreeWriterInterface` | 58 | `writeBlob`, `makeDirectory` (minimal push interface) |
| `FileInterface` (Mutable Blob) | 64 | `streamBase64`, `text`, `json`, `writeText`, `writeBytes`, `append`, `readOnly`, `snapshot` |
| `DirectoryInterface` (Mutable Tree) | 76 | `has`, `list`, `lookup`, `write`, `remove`, `move`, `copy`, `makeDirectory`, `readOnly`, `snapshot` |

Note: the Mutable `FileInterface` / `DirectoryInterface` are **already
landed** (platform-fs Phase 4 shipped). They lack the catalog's `makeFile`,
`subView`, `stat`, `streamRead`, and `followNameChanges` — these are the
[Phase 1](#phase-1-catalog-land-no-behavior-change) additions.

### Surface 2 — `@endo/daemon` Mount family

All guards in `packages/daemon/src/interfaces.js`; exos in
`packages/daemon/src/mount.js`:

| Interface | Line | Methods |
|---|---|---|
| `EndoMount` | 555 | `has`, `list`, `lookup`, `write`, `copy`, `entry`, `stat`, `readText`, `maybeReadText`, `writeText`, `makeDirectory`, `makeFile`, `remove`, `move`, `readOnly`, `snapshot`, `help` |
| `EndoMountFile` | 599 | `text`, `streamBase64`, `json`, `writeText`, `append`, `writeBytes`, `stat`, `snapshot`, `readOnly`, `help` |
| `EndoMountEntry` | 617 | `segments`, `displayPath`, `child`, `help` (path descriptor; no I/O) |
| `EndoReadableTree` | 637 | `sha256`, `has`, `list`, `lookup`, `help` (content-store tree) |

`EndoMount` extends platform's `DirectoryInterface`; `EndoMountFile` extends
platform's `FileInterface`. `readOnly()` returns structural projections
(`ReadableTreeView` / `ReadableBlobView`, declared in `types.d.ts`) whose
method sets exactly match the platform Readable guards.
Backed by `FilePowers` (see below) for host authority.

### Surface 3 — `@endo/endo-fs` (the cap-FS)

Guards in `packages/endo-fs/src/type-guards.js` unless noted:

| Interface | Line | Methods |
|---|---|---|
| `Filesystem` | 53 | `root`, `named`, `statfs`, `brands`, `help` (`sloppy`) |
| `Directory` | 85 | `NodeBase*` + `lookup`, `list`, `create`, `makeDirectory`, `remove`, `mkdir`/`unlink` (legacy aliases), `rename`, `materialise`, `watchFrom` (`sloppy`) |
| `File` | 144 | `NodeBase*` + `open`, `snapshot` (`sloppy`) |
| `OpenFile` | 175 | `read(offset?, length?)`, `write(offset?)`, `truncate`, `fsync`, `lock`, `getLock`, `close`, `help` |
| `Cursor` | 160 | `read(limit?)`, `stream`, `toArray`, `skip`, `rewind`, `help` |
| `Lock` | 197 | `release`, `help` |
| `Xattrs` | 203 | `get`, `set`, `list`, `remove`, `help` |
| `NodeWatcher` | 218 | `events`, `cancel` |
| `BlobRef` | 233 | `getInfo`, `fetch(offset, length)`, `help` (content-address bridge) |
| `Layer` (`src/layer.js`) | 67 | `asFilesystem`, `backing`, `diff`, `apply`, `revert`, `readOnly`, `help` (CoW overlay) |
| `PosixFs` (`src/posix-fs.js`) | 46 | `attrs`, `setAttrs`, `xattrs`, `flock`, `help` (**sketch; not implemented** — the 9P/FUSE extension cap) |

`NodeBase*` (the shared base on `Directory` / `File`) carries `getStat`,
`setStat`, `getQid`, `getAttrs`, `setAttrs`, `watch`, `xattrs`, `help` — both
the narrow portable (`getStat` / `setStat`) and wide legacy
(`getAttrs` / `setAttrs`) shapes, per the FsBackend-seam design.

### Adjacent / substrate interfaces

| Interface | Location | Role |
|---|---|---|
| `FilePowers` | `packages/daemon/src/types.d.ts` (type, not an exo) | Host `fs`-module powers object (`readFile`, `writeFileText`, `readDirectory`, `makePath`, `statPath`, `realPath`, …). The seam between host filesystem authority and daemon-side caps. Node and XS implementations. |
| `EndoReadable` | `packages/daemon/src/types.d.ts` | Daemon blob cap: `sha256`, `streamBase64`, `text`, `json`. |
| `EndoGitTree` | `packages/daemon/src/types.d.ts` | Immutable git tree: `archiveTar`, `archiveLossless`, `has`, `list`, `lookup`. |
| `FsBridge9p` | `packages/9p-server/src/fs-bridge.js:11` | 9P2000.L protocol bridge over an endo-fs `Filesystem` cap: `start`, `stop`. The canonical consumer of the cap-FS surface. |
| `PassableReader` / `PassableWriter` | `packages/exo-stream/type-guards.js:29,56` | Generic pattern-validated streams (directory listings, JSON). |
| `PassableBytesReader` / `PassableBytesWriter` | `packages/exo-stream/type-guards.js:76,99` | Byte streams transmitted as base64 over CapTP. Used by `OpenFile.read/write`, `Xattrs.get/set`, `BlobRef.fetch`, and the from-mount adapter. |

### Why this matters to the catalog

The catalog (above) is deliberately the *intersection vocabulary* a
filesystem viewer reads against — not this full set.
The appendix records the full set so future stewards know:

- which sub-caps stay private to endo-fs (Design Decision 8: `OpenFile`,
  `Cursor`, `Lock`, `Xattrs`, `NodeWatcher`);
- that three overlapping immutable-blob shapes exist (`BlobRef` in endo-fs,
  `EndoReadable` in daemon, `SnapshotBlob` in platform) — the
  [Divergence survey](#interface-differences-load-bearing) snapshot row and
  [Design Decision 3](#design-decisions) pick `SnapshotBlob` / `SnapshotTree`
  as canonical;
- that `FilePowers` is the host-authority floor every backing ultimately
  stands on, and is intentionally *not* a cap (no `M.interface`).
