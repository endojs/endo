# `mapSnapshot`: JS-Snapshot to Compartment-Map-Snapshot Mapper

| | |
|---|---|
| **Created** | 2026-06-02 |
| **Updated** | 2026-06-02 |
| **Author** | endolinbot (prompted) |
| **Status** | Proposed |

## Summary

A daemon-specific variation on `compartment-mapper.mapNodeModules`
that takes a pair of daemon capabilities (an `EndoRegistry`
resolution and an `EndoMount` or `readable-tree` entry source) and
produces a `CompartmentMap` whose locations follow the
compartment-mapper *archive* precedent: a top-level
`compartment-map.json` plus peer directories named by package
(`@endo/patterns@1.0.0/`, `ses@2.3.4/`, and so on).
The mapper output is the trio
`{ compartmentMap, resolution, readPowers }` that the worker hands
to `importLocation` (or, eventually, to a future `importSnapshot`).

The capability that supplies `resolution` is defined in
[registry-capability](registry-capability.md); the algorithm that
produces `resolution` is in [mvs-resolver](mvs-resolver.md); the
daemon-worker entry that drives the mapper and runs the result is
[daemon-worker-import-from-mount](daemon-worker-import-from-mount.md).

The `mapSnapshot` lane is one new addition to `compartment-mapper`
itself (a small extension point that the package-descriptor walker
exposes); the rest of `mapSnapshot` lives in `packages/daemon/`.

## Goals

1. Translate a `(RegistryResolution, EndoMount)` pair into a
   `CompartmentMap` whose layout follows the existing
   compartment-mapper archive precedent (`compartment-map.json`
   at the top level, peer directories named by package), so the
   archive `read` function shape applies without a new URL
   scheme.
2. Pre-compute the trio
   `{ compartmentMap, resolution, readPowers }` once, so the
   worker's `importLocation` invocation is a single call against
   already-walked state.
3. Admit MVS major-version coexistence cleanly: each peer
   directory's name carries the selected `<name>@<version>` so
   two majors of the same package land at two distinct
   directories.
4. Admit workspace members cleanly: a workspace member's peer
   directory carries the bare package name without a version
   segment, so workspace members can never collide with
   registry-resolved entries (which always carry a version).
5. Keep `compartment-mapper` itself daemon-agnostic.
   `mapSnapshot` is daemon-specific because two of its inputs
   are daemon exos; the only `compartment-mapper` change is one
   small extension point that lets `mapSnapshot` reuse the
   package-descriptor walker.

## Non-Goals

- Walking the dependency graph from inside the mapper.
  By the time `mapSnapshot` runs, the
  [mvs-resolver](mvs-resolver.md) has already walked the graph
  and the mapper consumes `resolution.packagesByKey` directly.
- Reading source bytes from the live mount.
  By contract (see
  [registry-capability](registry-capability.md) § *Mount snapshot
  vs live read*), the entry has been snapshotted before `mapSnapshot`
  runs, so the mapper reads from an immutable tree.
- Hosting on XS.
  `compartment-mapper` cannot run on XS today; the deferred path
  is captured in
  [daemon-worker-import-from-mount](daemon-worker-import-from-mount.md)
  § *XS bridging*.

## Where This Sits

This is the **mapper layer** of the daemon-worker
`importLocation` stack:

| Layer | Doc | Concern |
|-------|-----|---------|
| Capability | [registry-capability](registry-capability.md) | `EndoRegistry` shape, `@registry` slot, lifetime |
| Algorithm | [mvs-resolver](mvs-resolver.md) | MVS walk, lockfile stance, who walks the graph |
| Mapper | this | `mapSnapshot`, `makeMountReadPowers`, archive-precedent layout |
| Integration | [daemon-worker-import-from-mount](daemon-worker-import-from-mount.md) | `makeFromPackage`, worker dispatch, CLI, XS bridging |

## `mapSnapshot` in context

`compartment-mapper` exposes a family of `map*` entry points
that build a `CompartmentMap` from a source: `mapNodeModules`
walks an on-disk `node_modules/` layout; `mapArchive` reads a
closed-world archive whose root has a `compartment-map.json`
and whose peers are package directories.
This design adds a third lane named `mapSnapshot` that takes a
pair of daemon capabilities, an `EndoRegistry` and an
`EndoMount` (or `readable-tree`), and produces a
`CompartmentMap` whose layout follows the same archive
precedent: a top-level `compartment-map.json` and peer
directories named by package.

Because `mapSnapshot` consumes daemon-side exos rather than
plain `ReadFn` powers, it does not live in
`packages/compartment-mapper/`.
It lives in `packages/daemon/src/map-snapshot.js` as a
daemon-specific variation on `mapNodeModules`, reusing the
`compartment-mapper`'s internal package-descriptor and
graph-walk modules through a small extension point that
`compartment-mapper` exposes for that purpose (see § *Phased
implementation* below; the extension point is the one new
addition to `compartment-mapper` itself, alongside re-exports of
the package descriptor walker).

The lane's signature, sketched:

```ts
// packages/daemon/src/map-snapshot.js
mapSnapshot({
  registry: EndoRegistry,
  mount: EndoMount | EndoReadableTree,
  entry?: string,
}): Promise<{
  compartmentMap: CompartmentMap;
  resolution: RegistryResolution;     // for cache-key reuse
  readPowers: ReadPowers;             // wired via makeMountReadPowers
}>;
```

The output trio is what the next stage in the integration flow
consumes: `importLocation` (when starting a fresh caplet) and a
future `importSnapshot` (when re-hydrating an application from a
previously captured `CompartmentMap` + `RegistryResolution`).
Producing both `compartmentMap` and `resolution` at the same
lane lets a caller snapshot the application without re-running
the `mapSnapshot` walk:

- The `RegistryResolution` is content-addressed by
  `resolutionHash`, so two callers with the same `package.json`
  and registry state produce the same hash and the same CAS
  trees.
- The `CompartmentMap` derived from that resolution is also
  deterministic given the entry mount's snapshot and the
  resolution, so the triple
  `(compartmentMap, resolutionHash, entrySnapshotHash)` is a
  complete identity for a runnable application snapshot.

`importSnapshot` (the future companion) takes that triple and
runs the application without re-walking the package graph: the
compartment-mapper already has the modules and their compartments
described, and the read function dereferences package-relative
paths against the same archive-shaped layout
`makeMountReadPowers` exposes.
The eventual shape is symmetric to `mapNodeModules` +
`importLocation`: `mapSnapshot` produces the snapshot,
`importSnapshot` runs it.

## Synthesized layout

`mapSnapshot` emits a `CompartmentMap` and a backing
`ReadPowers` that describe an archive-shaped layout: a
top-level `compartment-map.json` plus peer directories named by
package.
This matches the layout `compartment-mapper.mapArchive`
already understands, so the worker's `read` function is the
archive `read` shape with no new URL scheme.

The peer directory naming rule:

- A registry-resolved package's peer directory is named
  `<name>@<version>`.
  Scoped packages keep the leading `@scope/` on the package
  name, so the version goes after the bare name:
  `@endo/patterns@1.2.1/`, `ses@1.0.0/`.
  MVS major-coexistence lands cleanly because two majors of the
  same package live at distinct peer directories
  (`ses@1.0.0/`, `ses@2.3.4/`).
- A workspace member's peer directory omits the version
  segment: `@endo/patterns/`, `lib-b/`.
  This is the maintainer-intended semantic: workspace members
  short-circuit version selection (per
  [mvs-resolver](mvs-resolver.md) § *Workspace resolution*), so
  the layout reflects that they have no version segment to
  begin with.
  Workspace-member directories can never collide with
  registry-resolved directories because the registry-resolved
  ones always carry a version segment.

`compartment-mapper`'s descriptor walk knows the selected
version for each `(importer, dependency)` edge because the walk
operates against the resolution's `packagesByKey` (for
registry-resolved entries) and `packagesByKey`'s workspace-tagged
entries (for workspace members), and threads the canonical
peer-directory name into the `CompartmentMap` it emits for the
dependency's compartment.

The layout is internal to the worker; user code only sees the
modules' specifiers (`'@endo/patterns'`, `'ses'`).
`compartment-mapper` treats compartment locations as opaque
package-relative paths, and the `read` function the daemon
hands it interprets the first path segment as a peer-directory
name (a package-key string) and the rest as the module path
inside that package.

```js
const makeMountReadPowers = ({ entryMount, registry, resolution }) => {
  // packagesByKey: canonical peer-directory names per the
  // RegistryResolution shape. Registry-resolved entries are keyed
  // `<name>@<version>` (`ses@1.0.0`, `@endo/patterns@1.2.1`);
  // workspace-member entries are keyed by bare name
  // (`lib-b`, `@endo/patterns`). The compartment-mapper package
  // descriptor walk emits compartment locations against these
  // keys, so the same map covers both MVS major-coexistence and
  // workspace members.
  const packagesByKey = new Map(Object.entries(resolution.packagesByKey));

  // The compartment-map declares one compartment per peer
  // directory and a special entry compartment for the
  // top-level mount. Locations passed to `read` are package
  // descriptors plus relative module paths; the helper below
  // resolves a location to its backing bytes.
  const read = async location => {
    const { compartmentKey, modulePath } = parseLocation(location);
    if (compartmentKey === ENTRY) {
      return E(entryMount).readBytes(modulePath);
    }
    let treeRef = packagesByKey.get(compartmentKey);
    if (treeRef === undefined) {
      // Late bind via the registry capability the closure also
      // holds, then memoize. This path is rare (the
      // pre-resolution closure should cover everything the
      // mapper walks), but the closure keeps the read function
      // self-sufficient rather than forcing a re-dispatch into
      // the worker for a single missing package. The registry's
      // fetch throws cleanly if no such (name, version) exists,
      // citing the enclosing resolutionHash for diagnosability.
      // Workspace-member keys are not late-bound (they are not
      // on the registry); a missing workspace member surfaces
      // as a diagnostic from mapSnapshot, not from read.
      const [name, version] = parseNameVersion(compartmentKey);
      treeRef = await E(registry).fetch(name, version);
      packagesByKey.set(compartmentKey, treeRef);
    }
    return E(treeRef).readBytes(modulePath);
  };

  const canonical = async location => location;

  return harden({ read, canonical });
};
```

The `compartment-mapper`'s package descriptor walk reads each
importer's `package.json#dependencies` (and
`peerDependencies`, `optionalDependencies`; per
[mvs-resolver](mvs-resolver.md) § *Anti-design steers*), maps
each bare specifier to the selected version (or workspace
member) from `resolution.packagesByKey`, and emits the
dependency compartment's peer-directory name accordingly.
For a project that depends on `pkg@^1` directly and on a
transitive that requires `pkg@^2`, the entry importer's
specifier `'pkg'` resolves to the `pkg@1.x.y/` peer directory
and the transitive importer's specifier `'pkg'` resolves to the
`pkg@2.x.y/` peer directory; each importer reads its own
major's compartment.
For a workspace member named `lib-b`, the importer's specifier
`'lib-b'` resolves to the `lib-b/` peer directory regardless of
the predicate the importer declared.
The descriptor walk's per-importer key table is the
authoritative source for the peer-directory name; the mapper
does not need to know that the peer directories are synthesized
on top of CAS trees rather than physically present on disk
(which is how the archive `read` function already works in
`mapArchive`).

### npm-shape and compartment-map-shape translation

The translation `mapSnapshot` performs is:

| npm concept | `RegistryResolution` field | `CompartmentMap` shape |
|-------------|----------------------------|------------------------|
| Selected `(name, version)` | `packagesByKey[key]`, where `key = '<name>@<version>'` | One compartment per key, with peer-directory `<name>@<version>/` |
| Workspace member `name` | `packagesByKey[key]`, where `key = '<name>'` (no version segment) | One compartment per key, with peer-directory `<name>/` |
| Importer's `dependencies['pkg']` | Lookup `(pkg, range)` against `packagesByKey` (workspace match preferred over registry match) | A compartment-map module record pointing at the selected version's compartment |
| Importer's `dependencies` (transitive) | The same lookup, per importer | A per-compartment dependency map |
| Package contents (the `.tgz` unpacked, or workspace-member directory bytes) | `packagesByKey[key].treeRef` | Compartment served by the archive-shaped `read` function from `<key>/` |
| Entry module | Caller-supplied `entry?` or `compartment-mapper`'s default entry resolution | Compartment-map entry compartment, served from the top-level mount snapshot |

The compartment-mapper already knows how to translate the
right-hand side into the on-the-wire `CompartmentMap` shape (the
shape `mapArchive` already produces and `parseArchive` already
consumes); `mapSnapshot`'s job is to feed the package-descriptor
walker the correct peer-directory-name answer for every
bare-specifier lookup, which the walker consults via the small
extension point this design adds to `compartment-mapper`.

## Mount snapshot before the mapper runs

The mapper assumes the caller has snapshotted the entry mount
before invocation, per the contract documented in
[registry-capability](registry-capability.md) § *Mount snapshot
vs live read*.
For the common case where the caller has already passed a
`readable-tree` (immutable), the snapshot step is a no-op; for
the live-mount case, the integration layer in
[daemon-worker-import-from-mount](daemon-worker-import-from-mount.md)
calls `E(source).snapshot()` before reaching `mapSnapshot`.

`mapSnapshot` also adds the hard retention link from the
captured-formula-graph CAS contents that
[registry-capability](registry-capability.md) §
*Caching and retention* defines:
the trio `{ compartmentMap, resolution, readPowers }` the lane
returns, once captured into a formula by the integration layer,
holds a `thisDiesIfThatDies` link from that formula into every
`treeRef` named in `resolution.packagesByKey` and into the
entry mount's snapshot tree.
This pins the captured trees against CAS eviction for the
formula's lifetime; once the formula is collected, the trees
become collectible again.
The retention link is the safety mechanism the registry
caching layer relies on to make eviction transparent: anything
a captured formula still names cannot be evicted, anything
unnamed is fair game.

## Phased implementation

This lane lands as Phase 2 of the integration stack
(after the [registry-capability](registry-capability.md) Phase 1
lands the JS reference `EndoRegistry`):

1. Add `packages/daemon/src/worker-import.js` exporting
   `makeMountReadPowers`.
2. Add `packages/daemon/src/map-snapshot.js` exporting
   `mapSnapshot`.
   This is the daemon-specific variation on
   `compartment-mapper.mapNodeModules` described above.
3. Add the small extension point in
   `packages/compartment-mapper/` that `mapSnapshot` reuses
   (re-export of the package-descriptor walker plus a hook for
   the archive-shaped peer-directory layout the walker emits
   compartment locations against).
4. Tests:
   - Hand-crafted fixture with a trivial `package.json` pinning
     a single small dependency (e.g. `is-odd@1.0.0`); verify
     `mapSnapshot` returns a `CompartmentMap` whose
     `compartments` table carries a `is-odd@1.0.0/` peer
     directory entry and the read function returns the
     resolved tarball's bytes for that compartment's modules.
   - **Multi-major coexistence.**
     Project that depends on `pkg@^1` directly and on a
     transitive that requires `pkg@^2` produces a
     `RegistryResolution.packagesByKey` carrying both majors;
     the `mapSnapshot` output's compartment-map binds the entry
     importer's `'pkg'` specifier to the `pkg@1.x.y/` peer
     directory and the transitive importer's `'pkg'` specifier
     to the `pkg@2.x.y/` peer directory.
     The test uses two side-by-side fixture packages so the
     bytes the two majors return differ and the test can assert
     each importer reads from its own major's compartment.
   - **Workspace member layout.**
     Project whose root `package.json` declares a workspace
     containing two members (`lib-a`, `lib-b`) where `lib-a`
     depends on `'lib-b': 'workspace:^'`.
     The `mapSnapshot` output's compartment-map carries a
     `lib-b/` peer directory (no version segment), and the
     read function returns `lib-b`'s on-disk bytes.
   - **Workspace member coexistence with registry-resolved entry.**
     A workspace contains `@endo/patterns` as a member, and a
     registry-resolved transitive also requires
     `@endo/patterns@1.0.0`.
     The compartment-map carries both `@endo/patterns/` (the
     workspace member) and a registry-resolved entry, and the
     importers bind to the workspace member regardless of
     predicate.
     This exercises the "workspace wins" rule the layout
     encodes by the presence of a version segment.

The integration test that exercises `mapSnapshot` end-to-end
(`importLocation` returning a working namespace) lands in the
integration layer's Phase 2 entry (the worker dispatch); see
[daemon-worker-import-from-mount](daemon-worker-import-from-mount.md)
§ *Phased implementation*.

## Design Decisions

1. **`mapSnapshot` lives in `packages/daemon/`, not in
   `compartment-mapper`.**
   Its inputs are daemon exos (`EndoRegistry`, `EndoMount`); only
   the small extension point that lets the package-descriptor
   walker take a custom location-emitter belongs in
   `compartment-mapper`.
   Keeping daemon-shaped dependencies out of `compartment-mapper`
   preserves its portability story (it ships as a standalone npm
   package).

2. **Reuse the compartment-mapper archive precedent for layout.**
   `compartment-mapper.mapArchive` already understands a layout
   of a top-level `compartment-map.json` plus peer directories
   named by package; `mapSnapshot` emits the same layout against
   the daemon's CAS trees rather than against archive bytes.
   Reusing the precedent means the `compartment-mapper` read
   function for archives applies without modification: the
   daemon-side `read` interprets the first path segment as a
   peer-directory key and reads either the entry mount's
   snapshot (top-level) or a CAS tree (for a `<name>@<version>/`
   or workspace-member `<name>/` peer).
   This avoids a daemon-internal URL scheme entirely.
   We are not using a Node.js importer; the `node_modules`
   layout has no value here.

3. **Workspace members carry no version segment in the peer
   directory name.**
   A registry-resolved entry's peer directory is
   `<name>@<version>/`; a workspace member's is `<name>/`.
   This encodes the "workspace wins regardless of predicate"
   semantic in the layout itself, and guarantees workspace
   members can never collide with registry-resolved entries
   because the version segment's presence vs absence
   distinguishes them.

4. **Output trio is the snapshot identity.**
   Producing `{ compartmentMap, resolution, readPowers }` from
   one call lets a future `importSnapshot` re-hydrate an
   application from
   `(compartmentMap, resolutionHash, entrySnapshotHash)` without
   re-walking.
   The mapper does not separately expose
   `resolution.resolutionHash`; the resolver layer (consumed
   here) already provides it.

## Anti-design steers

- **Considered and rejected: a synthesized `endo-mount:` URL
  scheme for compartment locations.**
  Compartment-mapper already provides a layout precedent for
  closed-world content (the archive: top-level
  `compartment-map.json` plus peer directories named by
  package).
  The archive precedent applies here without a new scheme: the
  daemon's CAS trees take the place of archive bytes, and the
  `read` function the daemon hands the worker interprets the
  first path segment as a peer-directory key.
  A new URL scheme adds vocabulary without adding capability and
  forks the `read` shape from the archive lane.

- **Considered and rejected: a `node_modules/` segment in
  compartment locations.**
  `node_modules` is the Node.js importer's resolution convention;
  this stack does not use the Node.js importer at all (the
  worker runs `compartment-mapper`'s
  `importLocation` against a `ReadPowers` the daemon synthesized).
  Peer directories at the same level as `compartment-map.json`
  match the archive precedent and read cleanly without the
  borrowed convention.

- **Considered and rejected: a separate caching layer for
  `makeMountReadPowers` results keyed by `resolutionHash`.**
  Folded into the registry's caching scope per
  [registry-capability](registry-capability.md) § *Caching and
  retention*: the `ReadPowers` is a thin closure over
  `(entryMount, registry, resolution)`, and the
  `resolutionHash` already pins the CAS trees the powers serve;
  re-constructing the closure on a cache miss is cheaper than
  carrying a separate caching layer here, and any caching the
  registry layer adds applies transparently.

## Dependencies

| Design | Relationship |
|--------|--------------|
| [registry-capability](registry-capability.md) | Supplies the `EndoRegistry` capability and the `RegistryResolution` shape `mapSnapshot` consumes. |
| [mvs-resolver](mvs-resolver.md) | Produces the resolution `mapSnapshot` walks.  The mapper is downstream of the resolver: by the time `mapSnapshot` runs, the MVS walk is complete and `packagesByKey` is final. |
| [daemon-worker-import-from-mount](daemon-worker-import-from-mount.md) | The integration-layer caller.  Calls `mapSnapshot` once per `makeFromPackage` invocation, between the registry resolve and the `importLocation` call. |
| [daemon-mount](daemon-mount.md) | The entry mount input.  `mapSnapshot` reads through the snapshot the integration layer has already taken. |
| [daemon-mount-capabilities](daemon-mount-capabilities.md) | The completed `EndoMount` surface (`readBytes`, `snapshot`, `EndoMountEntry`) that the mapper's `read` function calls into for the entry tree. |
| [daemon-cas-management](daemon-cas-management.md) | The resolved package trees live in the CAS; the mapper's `read` function reads from them through the existing `cas-fetch` / `cas-fetch-from-tree` bus verbs. |

## Prompt

> kriskowal CHANGES_REQUESTED on `endojs/endo-but-for-bots#358`
> (2026-06-02): decompose the monolithic
> `daemon-worker-import-from-mount` design into layers, one of
> which is the JS-snapshot to compartment-map-snapshot mapper
> (`mapSnapshot` in `compartment-mapper`, `ReadPowers` synthesis
> via `makeMountReadPowers`, npm-shape <-> compartment-map-shape
> translation).
>
> Round-2 CHANGES_REQUESTED on the same PR (2026-06-02): avoid
> the `endo-mount:` URL scheme entirely; avoid the
> `node_modules/` convention (no Node.js importer); reuse the
> compartment-mapper archive precedent of a top-level
> `compartment-map.json` plus peer directories named by
> package, with version (`@endo/patterns@1.0.0/`) for
> registry-resolved entries and without version
> (`@endo/patterns/`) for workspace members, which prefer the
> workspace version regardless of predicates and cannot
> collide.
> Fold the synthesized-`ReadPowers` caching question into the
> registry's caching scope.
