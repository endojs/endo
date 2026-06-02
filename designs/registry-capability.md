# EndoRegistry Capability and `@registry` Host Special Name

| | |
|---|---|
| **Created** | 2026-06-02 |
| **Author** | endolinbot (prompted) |
| **Status** | Proposed |

## Summary

Define a daemon capability `EndoRegistry` that brokers npm-style
package resolution and tarball fetch against a content-addressed
store (CAS).
Expose it on every host as the required special name `@registry`,
mirroring the `@node` precedent.
The capability shape is what crosses the worker boundary; the
algorithm that backs it lives in
[mvs-resolver](mvs-resolver.md), and the daemon-worker entry
point that consumes it lives in
[daemon-worker-import-from-mount](daemon-worker-import-from-mount.md).

Two interchangeable backends implement the capability:
a JavaScript reference implementation that ships with the
Node-only daemon (default), and a Rust-backed wrapper around
[endor-npm-registry-proxy](endor-npm-registry-proxy.md) for the
eventual Rust-hosted daemon.
Both backends produce the same `RegistryResolution` shape and write
CAS trees through the same bus verbs, so callers cannot tell which
backend resolved a given request.

## Goals

1. One capability shape that a Node-hosted daemon and a future
   Rust-hosted daemon both expose, so caplets reach feature parity
   on the daemon-worker entry without conditional code paths.
2. A required `@registry` slot on every host, populated at
   formulation time, so callers do not branch on its presence.
3. A failure surface that distinguishes tampering, missing
   packages, network errors, and offline-mode misses, so callers
   can react with structured `@endo/errors`.
4. A clean confinement story: a guest that needs to read the
   resolver's output can be handed a read-only view without also
   holding the network-fetch authority (the resolver-vs-store
   split, currently an open question).

## Non-Goals

- Sharing internal data structures between the JS and Rust
  backends.
  Each lane owns its own MVS implementation, its own
  registry-table representation, and its own tarball cache;
  they meet at the capability shape and at the CAS contents
  (which are content-addressed and therefore shareable by hash),
  not at the SQLite schema or the resolver internals.
- Mutating the registry table from outside the resolver.
  Both lanes treat the registry table as resolver-owned; clients
  hand in a `package.json` and receive a resolution, they do not
  reach into the table directly.
- Defining the resolution algorithm itself.
  That is [mvs-resolver](mvs-resolver.md)'s job; this design
  defines only the capability surface.

## Where This Sits

This is the **capability layer** of the daemon-worker
`importLocation` stack:

| Layer | Doc | Concern |
|-------|-----|---------|
| Capability | this | `EndoRegistry` shape, `@registry` slot, lifetime |
| Algorithm | [mvs-resolver](mvs-resolver.md) | MVS walk, lockfile stance, who walks the graph |
| Mapper | [snapshot-mapper](snapshot-mapper.md) | `mapSnapshot`, `makeMountReadPowers`, `endo-mount:` scheme |
| Integration | [daemon-worker-import-from-mount](daemon-worker-import-from-mount.md) | `makeFromPackage`, worker dispatch, CLI, XS bridging |

## Capability shape

```ts
interface EndoRegistry {
  // Resolve a dependency graph rooted at a package.json (as
  // bytes) and return the selected versions and their CAS tree
  // hashes.
  // Uses MVS per `mvs-resolver.md`.
  resolve(
    packageJson: Uint8Array,
    options?: { offline?: boolean; condition?: string[] },
  ): Promise<RegistryResolution>;

  // Fetch a single resolved package by (name, version) and
  // return the readable-tree pet capability for its contents.
  // Idempotent: calling twice returns the same tree.
  fetch(
    name: string,
    version: string,
  ): Promise<EndoReadableTree>;

  // Look up the cached resolution without fetching (returns
  // undefined if the package is not yet in the table).
  lookup(
    name: string,
    version: string,
  ): Promise<EndoReadableTree | undefined>;

  // List the installed packages (for diagnostics; bounded).
  list(prefix?: string): Promise<Array<{ name: string; version: string }>>;

  help(): string;
}

type RegistryResolution = {
  // One entry per (package, version) pair in the transitive
  // closure, keyed in `packagesByKey` by the canonical
  // `<name>@<version>` string.
  // The key shape matches npm's own (`ses@1.0.0`,
  // `@endo/patterns@1.2.1`) including the scoped-package
  // leading `@`.
  // Packages with major-version coexistence (allowed by MVS)
  // appear as multiple entries under distinct keys
  // (`ses@1.0.0`, `ses@2.3.4`); the `compartment-mapper`
  // package descriptor walk binds each import site to the
  // right entry.
  packagesByKey: Record<string, {
    name: string;
    version: string;
    treeRef: EndoReadableTree;   // CAS readable-tree capability
    integrity: string;            // npm `dist.integrity`, retained
                                  // for cross-check against
                                  // upstream registry attestations
                                  // (not used to verify treeRef;
                                  // treeRef's content-address
                                  // already proves the bytes)
  }>;
  // Convenience: the canonical key list, ordered for stable
  // hashing.
  keys: string[];                  // e.g. ['@endo/patterns@1.2.1', 'ses@1.0.0']
  // The resolution itself is content-addressed for cache reuse;
  // computed by hashing `keys` and their integrity strings.
  resolutionHash: string;
};
```

### Interaction model: who calls what, when

The worker calls `resolve` once during a `makeFromPackage` setup,
before the `importLocation` walk begins; the result feeds the
synthesized `ReadPowers` that the
[snapshot-mapper](snapshot-mapper.md) builds.
The worker reads from resolved tree refs through CAS bus verbs
(`cas-fetch-from-tree`), not through `EndoRegistry` directly,
during the `importLocation` walk.
The host owner (not the worker) may call `fetch`, `lookup`, or
`list` for diagnostics or for pre-warming the registry cache;
these methods are not on the worker's hot path.

### Failure surface

`EndoRegistry.resolve` rejects with a structured `@endo/errors`
error tagged by failure class, so callers can distinguish:

- `RegistryTamperedError` (the fetched tarball's hash does not
  match the upstream registry's `dist.integrity`).
- `RegistryMissingPackageError` (a `(name, version)` pair in
  the resolver's transitive closure is not on the configured
  registry).
- `RegistryNetworkError` (the bus call to the backend resolver
  failed in transit: subsystem restart, bus disconnect,
  registry-host TCP error).
- `RegistryOfflineError` (`options.offline` set and the
  resolution touched a package not yet in the table).

A mid-resolve restart or bus disconnect surfaces as
`RegistryNetworkError`; the caller may retry.
This mirrors the named cancellation surface in
[daemon-make-archive](daemon-make-archive.md) § *Cancellation handling*
rather than leaving the failure modes implicit in the `Promise`
rejection.

## Two backends, one shape

The JS reference implementation lives in
`packages/daemon/src/registry.js` (default; ships with the
Node-only daemon, exercised by the Node-only test matrix).
The Rust-backed wrapper delegates to
[endor-npm-registry-proxy](endor-npm-registry-proxy.md) via the
bus verbs defined there.

Both backends expose this design's `EndoRegistry` interface and
produce the same `RegistryResolution` shape.
The JS reference implementation is what the Rust implementation
is checked against; the JS lane is also what the Node-only CI
exercises.
Switching a host from one backend to the other is a host-formulation
choice: nothing in the worker, the snapshot mapper, or the
compartment-mapper changes.

## Host special name: `@registry`

Following the `@node` precedent from
[daemon-make-archive](daemon-make-archive.md) § Phase 6, every
host carries a required `registry` field that points to an
`EndoRegistry` capability:

```ts
type HostFormula = {
  // existing fields ...
  registry: FormulaIdentifier;   // new, required; powers @registry
};
```

`E(host).lookup('@registry')` returns the host-scoped registry
capability.
Guests do *not* see `@registry` by default; a host that wants to
grant a guest access to the registry must do so through the
usual capability-passing patterns.

The default registry is configured at daemon startup with the
registry URL and credentials.
A per-host registry can be substituted by the host's owner (for
example, to point at a private registry mirror) by formulating a
new `EndoRegistry` and rebinding the `@registry` special name.

The `@registry` field is required on `HostFormula`, not optional.
This follows the same reasoning as `@node`: an optional field
forces a conditional on every code path that touches resolution,
and the operational cost of provisioning a registry capability at
host formulation is small (the underlying subsystem is shared,
not per-host).

### Migration for already-formulated hosts

Adding a required field to `HostFormula` is a backward-incompatible
formula change; pre-existing host formulas on disk lack the
`registry` slot.
The migration policy mirrors the precedent
[daemon-make-archive](daemon-make-archive.md) § Phase 6 set when
`@node` became a required `HostFormula` field: on daemon start, a
one-shot upgrade pass rewrites host formulas missing the
`registry` field to point at the daemon-default registry formula,
in a single transaction per host.
The upgrade is idempotent (a second start is a no-op) and runs
before the host map is exposed to callers, so guests never observe
a half-migrated host.
A host whose owner has already substituted a custom `@registry`
keeps that substitution; the upgrade only fills the absent slot.

## Mount snapshot vs live read

The capability is asked to resolve against a `package.json` that
the caller has already read from somewhere.
For a mount-rooted invocation (the integration-layer call shape
of `makeFromPackage(mountName)`), that "somewhere" is the entry
mount, and the question of when the read happens against the live
mount vs an immutable snapshot is a capability-shape question
rather than a worker-internal one.

`EndoMount` is a live capability: subsequent writes to the
backing directory are observable through it.
For a running caplet, the questions are:

- Does the worker see file mutations after it has imported a
  module?
  No.
  The `importLocation` walk reads each module once during graph
  construction; the modules are compiled into the worker's
  compartment and re-read only on explicit reload (which is not
  a path this stack exposes).
- Does the worker see file mutations *during* the
  `importLocation` walk?
  Possibly, depending on timing; to avoid this we snapshot the
  entry tree before resolution begins.

```js
const entrySnapshot = await E(source).snapshot();
```

This produces an immutable `readable-tree` (per
[daemon-mount](daemon-mount.md) § *Snapshot* and
[daemon-mount-capabilities](daemon-mount-capabilities.md) § Phase 7)
that the synthesized `ReadPowers` reads against.
The live mount keeps mutating; the running caplet sees the
snapshot it was started against.

The snapshot is a `thisDiesIfThatDies` dependency of the caplet
(a lifetime-coupling primitive that releases the dependency when
the dependent caplet ends; see
[inventory-cancel-and-liveness](inventory-cancel-and-liveness.md)
§ *Lifetime coupling* for the definition), so the CAS trees the
snapshot holds are released when the caplet ends.
This mirrors the snapshot-before-stage pattern in
[daemon-make-archive](daemon-make-archive.md) § Phase 8
(`makeUnconfinedFromTree`).

For the common case where the caller has already passed a
`readable-tree` (immutable), the snapshot step is a no-op.

The snapshot mechanic is captured here because the `EndoRegistry`
capability's `resolve` method consumes the entry `package.json`
bytes after the snapshot has frozen them.
The integration layer in
[daemon-worker-import-from-mount](daemon-worker-import-from-mount.md)
is the place that actually calls `snapshot()` against the source;
this layer documents the contract the snapshot satisfies.

## Phased implementation

### Phase 1: JS reference implementation

1. Add `packages/daemon/src/registry.js` exporting an in-process
   resolver (algorithm in [mvs-resolver](mvs-resolver.md)),
   a `RegistryTable` representation, and a tarball fetcher
   (using `node:fetch` and the `package-tarball` verb already on
   the bus).
2. Add `RegistryFormula` and `EndoRegistry` exo wrapping the
   reference implementation.
3. Add `registry` to `HostFormula` as a required field; populate
   it during host formulation with the daemon-default
   `EndoRegistry`.
4. Add `@registry` to the host special-names map.
5. Tests (Node-only matrix):
   - `E(host).lookup('@registry')` resolves.
   - `E(registry).lookup(name, version)` returns undefined for
     an unfetched package.
   - `E(registry).resolve(pj)` produces a `RegistryResolution`
     whose `packagesByKey` entries match the npm registry's
     published metadata for a small fixture.
   - `E(registry).fetch(name, version)` returns a
     `readable-tree` capability whose contents hash-match the
     tarball's published `integrity`.

The phased implementation continues in the consuming layers:
[mvs-resolver](mvs-resolver.md) defines the algorithm Phase 1
implements, [snapshot-mapper](snapshot-mapper.md) is the next
implementation phase, and
[daemon-worker-import-from-mount](daemon-worker-import-from-mount.md)
ties the phases together with phase-numbered cross-references.

### Phase 5: Rust-backed `EndoRegistry` (drop-in)

When the Rust-hosted daemon ships, add a second `EndoRegistry`
backend that delegates to
[endor-npm-registry-proxy](endor-npm-registry-proxy.md) via the
bus verbs in § *Integration with `endor run`*.
The capability shape is unchanged; only the backend selection at
host formulation time differs.
Tests for the Rust backend mirror the JS-side suite to confirm
parity between the lanes.

## Design Decisions

1. **`@registry` is host-scoped, default to the daemon-wide
   registry capability.**
   Each host carries a `registry` formula field, populated at
   formulation time from a daemon-default capability.
   A host's owner can swap the registry (for example, to point
   at a private registry mirror) without re-formulating the host;
   this follows the same pattern `@node` uses.
   Guests do not see `@registry` directly; a guest that needs to
   install a package goes through the host.

2. **One capability shape, two backends.**
   The JS reference implementation and the Rust-backed wrapper
   are interchangeable at the capability boundary.
   This keeps the Node-only daemon and the eventual Rust-hosted
   daemon as parallel lanes rather than forcing the JS lane to
   wait on the Rust one, and keeps both lanes honest by asserting
   the same shape in tests.

3. **Structured failure classes.**
   `RegistryTamperedError`, `RegistryMissingPackageError`,
   `RegistryNetworkError`, and `RegistryOfflineError` are the
   four classes callers branch on.
   Bundling them under a generic `Error` would force every caller
   to inspect message text, which is fragile across both
   backends.

4. **Snapshot before resolve; do not stream live reads.**
   Running modules against a live filesystem is a well-known
   source of subtle bugs (a partially-written file read mid-import
   produces an opaque syntax error).
   The snapshot-before-import pattern is already established in
   [daemon-make-archive](daemon-make-archive.md) § Phase 8 for
   the unconfined Node bridge; reusing it here keeps the lifetime
   contract uniform.
   The cost is one tree-walk and one set of CAS writes per
   invocation, which is the same cost a `makeArchive` pass
   already incurs.

## Open Questions

1. **Resolver / store capability split.**
   Split `EndoRegistry` into `EndoRegistryResolver`
   (`resolve` + `fetch`; carries the network-fetch authority)
   and `EndoPackageStore` (`lookup` + `list`; read-only over
   the resolved CAS trees) so a guest can hold the read surface
   without the fetch authority.
   The first cut ships the combined cap for symmetry with
   `@node`; the split is a confinement refinement to land once
   the first cut shows which guests want which authority.

2. **`EndoRegistry` naming.**
   The capability name flavors the underlying registry table
   over the user's mental model of "packages".
   A user-facing name (`EndoPackages` or `EndoNpm`) may track
   the caller's intent more closely; the host special name
   `@registry` is correct as-is because the host's named slot
   is the registry concept rather than the package collection.
   Provisional answer: keep `EndoRegistry` for the first cut to
   match `@registry`; revisit during the user-facing review of
   [daemon-agent-tools](daemon-agent-tools.md).

3. **Private-registry credentials.**
   The Rust subsystem reads `.npmrc` for the registry URL and
   auth tokens
   ([endor-npm-registry-proxy](endor-npm-registry-proxy.md)
   § *Configuration*).
   Should the JS-side `EndoRegistry` carry a separate credential
   capability per host, or inherit the daemon-wide configuration?
   Operationally the daemon-wide path is simpler; per-host
   credentials would compose with the
   [endo-gateway](endo-gateway.md) multi-tenant story.
   Provisional answer: daemon-wide for the first cut, with
   `EndoRegistry` bequeathing a `withCredentials(credentialCap)`
   method later for the per-tenant case.

## Dependencies

| Design | Relationship |
|--------|--------------|
| [mvs-resolver](mvs-resolver.md) | Defines the algorithm `EndoRegistry.resolve` runs.  The capability shape here is what wraps the algorithm. |
| [snapshot-mapper](snapshot-mapper.md) | The mapper consumes a `RegistryResolution` (this design's output) and synthesizes the `ReadPowers` the worker uses. |
| [daemon-worker-import-from-mount](daemon-worker-import-from-mount.md) | The integration-layer caller.  Invokes `EndoRegistry.resolve` once during `makeFromPackage` setup; reads CAS trees by hash thereafter. |
| [endor-npm-registry-proxy](endor-npm-registry-proxy.md) | The Rust-side backend.  Drop-in for the Phase 5 Rust-hosted-daemon path; produces structurally identical `RegistryResolution` outputs. |
| [daemon-make-archive](daemon-make-archive.md) | The `@node` precedent for a required host special name; the migration shape this design follows for `@registry`. |
| [daemon-mount](daemon-mount.md) | `snapshot()` semantics for the entry mount; the capability assumes the caller has snapshotted before calling `resolve`. |
| [daemon-mount-capabilities](daemon-mount-capabilities.md) | The completed `EndoMount` surface used by the snapshot step. |
| [daemon-cas-management](daemon-cas-management.md) | The resolved package trees live in the CAS; the resolver writes to the CAS through the existing bus verbs. |
| [inventory-cancel-and-liveness](inventory-cancel-and-liveness.md) | `thisDiesIfThatDies` is the lifetime-coupling primitive that releases the snapshot's CAS trees when the caplet ends. |

## Prompt

> kriskowal CHANGES_REQUESTED on `endojs/endo-but-for-bots#358`
> (2026-06-02): decompose the monolithic
> `daemon-worker-import-from-mount` design into layers, one of
> which is the Registry capability (`EndoRegistry` shape,
> `@registry` naming, snapshot vs live read semantics, Rust-backed
> roadmap).
