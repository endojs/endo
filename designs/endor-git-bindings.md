# Endor In-Process Git Bindings for Content Storage

| | |
|---|---|
| **Created** | 2026-07-15 |
| **Revised** | 2026-07-25 (cross-compilation requirement; pure-Rust backend recommended) |
| **Revised** | 2026-07-26 (review decisions: SHA-256 object format for daemon-owned repositories, `gix` as the sole backend with ordinary Git only for test cross-validation, first-consumer order, Endo state-directory storage policy) |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |

## Motivation

`endor` must be a releasable standalone binary, not a Rust wrapper that requires a separately installed `git` executable for daemon storage.
The Node reference implementation can use native Git subprocesses for its local Git capability, but the Rust daemon needs an in-process object database when it uses Git as a content-addressed store.

`endor` must also **cross-compile** to other platforms and architectures from a small set of build hosts (maintainer requirement, PR review 2026-07-25).
A C library dependency resists this: compiling vendored C source for a foreign target requires a per-target C cross toolchain (and, for some targets, a platform SDK), which multiplies release-engineering cost by the size of the target matrix.
This requirement settles the backend choice below on a pure-Rust Git implementation and rules the libgit2 bindings out entirely (maintainer decision, PR review 2026-07-26): there is one production backend, and ordinary Git enters only as a test cross-validation oracle, never as a runtime dependency.

The existing `ContentStore` in `rust/endo/src/cas.rs` remains the daemon's SHA-256 blob and tree store.
Git is an additional object database with Git object identity, ref reachability, and interoperable on-disk layout.
The two identifiers are never interchangeable: Git hashes a framed object and may use SHA-1 or SHA-256, while Endor hashes its stored bytes with SHA-256.

This design derives from [Git on Endor Rust](https://github.com/kriskowal/garden/issues/46) and its [dispatch request](https://github.com/kriskowal/garden/issues/46#issuecomment-4981804044).

## Scope

This design adds a daemon-private `GitCas` boundary for local Git object and ref operations.
It does not replace the public `Git` capability, grant shell or network authority, implement checkout or index mutation, or turn an Endor CAS tree into a Git worktree.
Those concerns remain respectively in [daemon-git-capability](daemon-git-capability.md), [daemon-git-remotes](daemon-git-remotes.md), and the mount designs.

The first target is a local repository owned by the Endor state directory or an already-authorized repository opened by trusted daemon code.
The baseline build neither fetches nor pushes.

A daemon-owned Git object database lives **inside the Endo state directory** (maintainer decision, PR review 2026-07-26): it inherits that directory's ownership, permissions, and backup policy rather than defining a new location or custody scheme of its own.
On shared-user machines this is the same trust boundary that already protects the SHA-256 `ContentStore`, so no separate backup, ownership, or repository-location policy is introduced here.

## `GitCas` Boundary

`GitCas` is a Rust-internal trait in `rust/endo/src/git_cas.rs`, behind a repository policy established when the daemon opens it.
It is not an envelope verb and is never handed to a guest.
The policy fixes the repository location and allowed write-ref namespace, initially `refs/endor/`; it prevents this storage layer from silently updating `refs/heads/`, tags, remotes, hooks, or configuration.

```rust
pub trait GitCas: Send + Sync {
    fn object_exists(&self, oid: GitObjectId) -> Result<bool, GitCasError>;
    fn read_object(&self, oid: GitObjectId) -> Result<GitObject, GitCasError>;
    fn write_object(
        &self,
        kind: GitObjectKind,
        bytes: &[u8],
    ) -> Result<GitObjectId, GitCasError>;
    fn read_tree(&self, oid: GitObjectId) -> Result<Vec<GitTreeEntry>, GitCasError>;
    fn resolve_ref(&self, name: GitRefName) -> Result<Option<GitObjectId>, GitCasError>;
    fn update_ref_if(
        &self,
        name: GitRefName,
        expected: Option<GitObjectId>,
        next: GitObjectId,
        message: &str,
    ) -> Result<(), GitCasError>;
    fn verify(&self, scope: GitVerifyScope) -> Result<GitVerifyReport, GitCasError>;
}
```

`GitObjectId` carries its object-format algorithm and fixed-width object-ID bytes (with hexadecimal only as its display form), so a SHA-1 object cannot be confused with a SHA-256 object.
Every input ID must use the repository's configured object format.
`write_object` accepts bytes and an object kind, computes the Git object ID itself, and never trusts a caller-supplied digest.
Before it stores a tree, it parses the tree encoding and rejects malformed entry names, modes, object IDs, and ordering; callers that construct trees use a typed encoder rather than hand-assembling tree bytes.
`read_object` validates the type and object hash before returning data.
`read_tree` returns normalized tree entries with mode, name, kind, and object ID; it rejects malformed names before an adapter turns entries into an Endor tree.

`update_ref_if` is the only mutating ref operation.
It is compare-and-swap: `expected: None` creates an absent ref, an expected ID must match the current direct ref, and a mismatch returns `GitCasError::Conflict` with no update.
The implementation rejects a symbolic ref in the allowed namespace, and verifies that `next` names an existing, hash-valid object before it writes a direct ref, so this boundary cannot publish a dangling or format-mismatched root.
Symbolic refs, caller-selected reflog policy, commit construction, pack import/export, and worktree/index operations are deliberately outside this first boundary.
The caller writes immutable objects first, then advances an allowed ref to make a root reachable.

An adapter outside the trait, `GitTreeToContentStore`, materializes a selected immutable Git tree into the existing `ContentStore` when a daemon subsystem needs Endor's `TreeManifest` vocabulary.
It records source Git object IDs as provenance, not as Endor hash aliases.
The reverse conversion, commit creation, and a pack-transfer API wait for demonstrated consumers.

## Recommended Backend and Evaluation Path

Use [`gix`](https://crates.io/crates/gix), the pure-Rust Git implementation from the gitoxide project, for the near-term `GixGitCas` implementation.
It covers local object-database access (loose and packed), tree traversal, object writes, and ref transactions with an expected-previous-value check (the compare-and-swap `update_ref_if` needs), without executing `git` and without any C dependency in the profile below.
Cross-compiling a pure-Rust dependency graph needs only `rustup target add <triple>` and a linker for the target — no per-target C cross toolchain, no platform C library builds — which is what the cross-compilation requirement demands.
The first Cargo profile is intentionally local-only and pure-Rust:

```toml
gix = { version = "<pinned via Cargo.lock at implementation time>", default-features = false, features = ["max-pure"] }
```

`max-pure` is gitoxide's no-C-dependency profile (pure-Rust DEFLATE and hashing, no zlib-ng, no OpenSSL); the implementation trims it further to the local object, ref, and validation feature set — the local-only artifact enables no transport feature at all.
Pin the resolved `gix` crate graph through `Cargo.lock`, record its version in `endor --version --verbose`, and update it through the normal security-review process.

**Daemon-owned repositories are created with the SHA-256 object format** (maintainer decision, PR review 2026-07-26).
This matches Endor's own SHA-256 content identity and avoids minting new SHA-1 object stores.
Because `endor` creates and owns these repositories, they are not obliged to interoperate with arbitrary SHA-1 upstreams; the algorithm-tagged `GitObjectId` still lets the daemon *read* an already-authorized SHA-1 repository opened by trusted code, but every repository Endor creates is SHA-256.
SHA-256 object-database support is still maturing in the pure-Rust backend, so it is now a **release gate, not an opt-in experiment**: `gix`'s SHA-256 behavior must clear the full validation matrix on every release target.
A SHA-256 matrix failure is escalated to the maintainer as a blocking result — there is no silent downgrade to SHA-1 and (per the decision below) no libgit2 fallback.
`gix` must prove the exact local object, ref transaction, packed-object, and corruption-recovery behavior that `GitCas` needs by passing the full validation matrix before Phase 2 builds on it; the matrix is the gate, not the crate's reputation.

### One backend: `gix`; ordinary Git only for cross-validation

`gix` is the **sole** production backend. libgit2 (the [`git2`](https://crates.io/crates/git2) bindings) is **not** carried as a contingency (maintainer decision, PR review 2026-07-26): its C dependency reintroduces exactly the per-target cross-toolchain and binary-custody cost the pure-Rust requirement exists to eliminate, and hedging two production backends behind `GitCas` doubles the validation surface for a fallback we do not want to ship.
There is one backend, `GixGitCas`, and no `Libgit2GitCas`.

Ordinary Git — the `git` executable — is retained for exactly one purpose: **test-time cross-validation** (maintainer decision, PR review 2026-07-26).
Fixtures may run ordinary `git` to write objects, packs, and refs and to independently compute object IDs, and the tests assert that `GixGitCas` reads those artifacts and computes byte-identical object IDs.
This makes ordinary Git the interoperability oracle without making the released artifact depend on it: `git` is a build/test-host tool only, never invoked by the runtime.

If `gix` fails a required validation case, that is a **blocking result escalated to the maintainer**, not an automatic switch to another backend.
Do not ship two production backends or add an abstraction larger than `GitCas` to hedge between them.

Two alternatives are rejected outright:

- **Subprocess Git at runtime.** It preserves exact Git behavior but fails the standalone-binary requirement, makes runtime behavior depend on host PATH and Git version, and repeats the Node reference implementation's process boundary. (It survives only as the test cross-validation oracle above, never in the release artifact.)
- **libgit2 / direct libgit2 FFI.** A C dependency that violates the pure-Rust cross-compilation requirement; direct FFI adds no value over the `git2` bindings, and neither is carried. A new in-house Git implementation is likewise unjustified while `gix` is viable.

## Features, Transports, and Distribution

The baseline artifact supports local loose and packed objects, refs, and reflogs accepted by the pinned `gix` build; repositories Endor creates use the SHA-256 object format, and the algorithm-tagged `GitObjectId` additionally lets it read an already-authorized SHA-1 repository.
It enables no `gix` transport, HTTP, or credential feature.
That keeps network and credential code out of the daemon-content-storage binary profile and preserves the [daemon-git-remotes](daemon-git-remotes.md) authority split.

If a later authorized remote design needs HTTPS, it must use a separately named Cargo feature that enables the corresponding `gix` transport features over a pure-Rust TLS stack (rustls), preserving the no-C-toolchain cross-compilation property, and has release tests for certificate validation, proxy policy, and disabled interactive credentials.
SSH is a separate decision because host-key verification, agent forwarding, and key custody need an explicit capability design; it is not enabled as a side effect of HTTPS.
Neither feature may fall back to a system `git`, a system Git library, or an interactive credential helper.

"Standalone" means the release artifact contains the required Git implementation and has no runtime dependency on `git` or a dynamically discovered Git library.
It does not promise one fully static executable on every target: platform C runtimes and operating-system frameworks remain platform concerns.
Release jobs must publish the target triple, linked-library inventory, enabled Git features, the pinned `gix` revision, and license notices, and reject an unexpected libgit2, zlib, OpenSSL, libcurl, or libssh2 dynamic dependency in the local-only artifact.
Release jobs must also demonstrate the cross-compilation property: every release target builds from the canonical build hosts with `cargo build --target <triple>` and the target linker alone — no target-specific C cross toolchain in the pure-Rust profile.
The canonical release-target set and the build hosts that produce it are left to the builder's discretion (release engineering, PR review 2026-07-26); the cross-compilation property above is the invariant every chosen target must satisfy, whatever the specific set.

## Storage, Refs, Concurrency, and Corruption

Objects are immutable and deduplicate naturally by Git object ID.
`write_object` is idempotent and can safely race with another writer that stores identical bytes.
`gix` speaks Git's on-disk object and ref lockfile protocol, which provides interoperability with normal Git readers and writers; Endor additionally serializes `update_ref_if` per repository in-process so one daemon can return a deterministic conflict rather than relying on timing.
An external writer can still race Endor, so ref-update failure is a normal conflict that callers may re-read and retry deliberately.

Every durable Endor Git root is an allowed direct ref under `refs/endor/`.
Unreachable Git objects are not retained by Endor's `.meta` ref counts and are collected only by a Git-aware maintenance operation after verification; `ContentStore.gc()` never scans or deletes Git objects.
Conversely, a Git-backed materialization that produces an Endor `TreeManifest` retains that Endor root through the existing formula or retain/release path.
This separates Git reachability from Endor CAS liveness and prevents either collector from corrupting the other store.

At open, Endor checks repository discovery, object format, directory ownership and permissions, and the allowed ref namespace.
Each object read verifies identity and kind before use.
Failure to parse a tree, a missing promised object, a hash mismatch, or an invalid ref is fail-closed: the operation returns a structured corruption error, quarantines the affected repository for writes, and records the object or ref name without logging content bytes or credentials.
`endor git-cas verify --full` enumerates every object available through the object database, reads and re-hashes it, parses every tree, and validates every ref in the allowed namespace; it is the only operation that can clear the quarantine after it succeeds.
This is a `GitCas` contract, not a promise of any backend's `fsck` wrapper: `GixGitCas` implements it using the object-database enumeration and the same validating read path.
Whether that enumeration relies on the pinned `gix` object-database traversal or the verifier bundles its own read-only pass is left to the implementer's (researcher's) discretion (PR review 2026-07-26), decided against the validation matrix on every release target — the contract is fixed, the mechanism is not.
Recovery is restore from a known-good clone or backup, followed by a new verification pass; automatic object repair and destructive pruning are out of scope.

## Migration and Interoperability

The initial implementation adds `GitCas` beside `ContentStore`; it does not rewrite `store-sha256/`, existing formulas, or the Node daemon's Git repositories.
Existing Node `NativeGitBackend` subprocess behavior continues unchanged.
The Rust daemon opens ordinary Git repositories, so repositories created by Endor remain readable by Git tooling and vice versa, subject to concurrent ref conflicts.

Migration is lazy and per root:

1. Open or create the daemon-owned Git repository and verify it.
2. On a Git-tree consumer, read the selected Git root and materialize it into the existing Endor content store only when that consumer requires an Endor tree.
3. Persist the Git object ID as provenance with the Endor root, then retain the Endor root through the current lifetime mechanism.
4. Keep old SHA-256 roots readable until existing retention and GC release them naturally.

No background whole-store import occurs, and no conversion claims byte-for-byte identifier equality across the two stores.
The later public `Git` capability may choose `GitCas` for its in-process immutable-tree backend only after it demonstrates the same observable tree behavior as the current native implementation.

The first durable `refs/endor/` root consumers arrive in this order (maintainer decision, PR review 2026-07-26): **formula snapshots first, then archive imports, then Git-tree materialization.**
Phase 2's tree-to-`ContentStore` adapter therefore lands against the formula-snapshot consumer, with archive imports and then materialization following as later consumers of the same boundary.

1. Add `GitObjectId`, validated ref names, `GitCas`, and `GixGitCas` with the local-only pure-Rust profile and the SHA-256 object format for daemon-owned repositories, gated by the validation matrix.
2. Add the tree-to-`ContentStore` adapter and provenance record for the formula-snapshot consumer first, without changing public daemon verbs.
3. Add quarantine, verification command, cross-process conflict coverage, release linkage checks, and the cross-compilation release check (every release target from the builder-selected build hosts).
4. Design a separate HTTPS and then SSH transport feature only when [daemon-git-remotes](daemon-git-remotes.md) authorizes the corresponding credential and policy surface.

## Executable Validation Matrix

| Scenario | Fixture and command | Required observation |
|---|---|---|
| Standalone local artifact | `cargo build --release -p endo`; platform linkage inspection (`ldd`, `otool -L`, or `dumpbin /dependents`) | No runtime `git` or Git-library dependency; local-only profile has no unexpected zlib, TLS, curl, or SSH dependency. |
| Cross-compiled artifacts | `cargo build --release --target <triple>` for every release target from the canonical build hosts, then the same linkage inspection per artifact | Every target builds with `rustup target add` plus the target linker only — no per-target C cross toolchain in the pure-Rust profile; each artifact passes the standalone inspection. |
| Object identity (SHA-256 daemon-owned) | `cargo test -p endo git_cas::object_round_trip` against a SHA-256 repository; read-compatibility case against a SHA-1 fixture | Blob and tree IDs match Git's object framing in the SHA-256 object format Endor creates; SHA-1 fixtures remain readable via the tagged `GitObjectId`; duplicate writes return one ID; SHA-1 and SHA-256 IDs cannot compare equal. |
| Packed repository interoperability | `cargo test -p endo git_cas::packed_objects` after `git gc` creates fixture packs | Objects and trees written by regular Git remain readable in-process without invoking Git at runtime. |
| Ref compare-and-swap | `cargo test -p endo git_cas::ref_compare_and_swap` | Exactly one concurrent expected-old update succeeds; the other reports `Conflict`; no ref is torn. Dangling targets, wrong-format IDs, and symbolic refs under `refs/endor/` are rejected. |
| External writer race | integration fixture runs Endor and Git tooling against one repo | Endor reports a conflict and leaves an externally updated ref intact. |
| Content-store bridge | `cargo test -p endo git_cas::materialize_tree` | Materialized Endor tree has the expected bytes and Git provenance, while its SHA-256 root differs from the Git tree ID. |
| Corruption handling | mutate loose and packed-object fixtures, a ref, and a tree entry in isolated fixtures; run `endor git-cas verify --full` | Read and full verification fail closed, writes quarantine, and only a verified restored repository clears quarantine. |
| Unsupported transport | build and run the local-only artifact against an HTTPS URL | It returns a structured unsupported-transport error without spawning `git`, prompting, or contacting a credential helper. |
| Git cross-validation (test oracle) | fixtures use the ordinary `git` executable to write objects, packs, and refs and to compute object IDs, then `cargo test -p endo git_cas::git_cross_validation` reads them via `GixGitCas` | `GixGitCas` computes object IDs byte-identical to ordinary Git and reads Git-written objects, packs, and refs; the release artifact still links no Git library and never spawns `git` — the executable is a build/test-host oracle only. |

## Resolved Decisions

The design's open questions were resolved in the PR review of 2026-07-26; each resolution is folded into the body above and recorded here for provenance.

1. **Object format for daemon-owned repositories: SHA-256.** Repositories Endor creates use the SHA-256 object format (matching Endor's SHA-256 content identity); the algorithm-tagged `GitObjectId` still reads already-authorized SHA-1 repositories. SHA-256 backend support is a release gate, not an opt-in experiment, and a matrix failure escalates rather than downgrading. (See *Recommended Backend*, *Features*, and the Object-identity matrix row.)
2. **First durable `refs/endor/` root consumers: formula snapshots, then archive imports, then Git-tree materialization** — in that order. (See *Phased Delivery*.)
3. **`verify --full` read path: implementer's (researcher's) discretion** — rely on the pinned `gix` object-database enumeration or bundle a dedicated read-only pass, decided against the validation matrix; the `GitCas` verify contract is fixed regardless. (See *Storage, Refs, Concurrency, and Corruption*.)
4. **Canonical release-target set and build hosts: builder's discretion** (release engineering); the cross-compilation property is the invariant every chosen target must satisfy. (See *Features, Transports, and Distribution*.)
5. **No libgit2 contingency: `gix` is the sole backend.** Ordinary Git is retained only as a test cross-validation oracle, never a runtime dependency; a `gix` validation failure is a blocking result escalated to the maintainer, not an automatic backend switch. (See *One backend: `gix`; ordinary Git only for cross-validation*.)
6. **Storage, ownership, and backup policy: the Endo state directory.** A daemon-owned Git object database lives inside the Endo state directory and inherits its ownership, permissions, and backup policy; no separate custody scheme is introduced. (See *Scope*.)

## Dependencies

| Design | Relationship |
|---|---|
| [daemon-endor-architecture](daemon-endor-architecture.md) | Places the in-process storage boundary in the Rust supervisor. |
| [daemon-cas-management](daemon-cas-management.md) | Existing SHA-256 `ContentStore` remains the daemon content API and lifetime owner. |
| [daemon-git-capability](daemon-git-capability.md) | Future consumer of the in-process immutable-tree backend; public Git authority stays separate. |
| [daemon-git-remotes](daemon-git-remotes.md) | Owns future network, credential, and transport authority. |
| [daemon-make-archive](daemon-make-archive.md) | A potential Git-tree materialization consumer, not a new archive wire format. |

## Prompt

> I would like Endor to be a stand-alone binary. Where it is sufficient for the reference implementation in Node.js to shell out to git for daemon content-address-storage, Endor should have Git bindings that run in the same process. What are our options for binding Git to Rust?
