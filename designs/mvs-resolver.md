# JS Reference Implementation of Go-like Minimum Version Selection

| | |
|---|---|
| **Created** | 2026-06-02 |
| **Updated** | 2026-06-02 |
| **Author** | endolinbot (prompted) |
| **Status** | Proposed |

## Summary

A JavaScript reference implementation of Go-like Minimum Version
Selection (MVS) adapted to npm package versioning.
The implementation walks a transitive dependency graph rooted at a
`package.json`, fetches each transitively-required `package.json`
from the configured registry, and selects the greatest mentioned
minor (and patch) per major.
The output is a `RegistryResolution` consumed by the
[registry-capability](registry-capability.md) layer.

The Rust analogue lives in
[endor-npm-registry-proxy](endor-npm-registry-proxy.md); both
lanes implement the same MVS semantics so a Node-hosted daemon
and a Rust-hosted daemon resolve identically.
This design covers only the algorithm and the
single-pass-resolution shape.
The capability that hosts the algorithm is
[registry-capability](registry-capability.md); the consumer that
turns the resolution into a `CompartmentMap` is
[snapshot-mapper](snapshot-mapper.md).

## Goals

1. Implement Go-like MVS in JavaScript as a reference algorithm
   that runs on Node.js without depending on the Rust-side
   `endor-npm-registry-proxy`.
2. Produce the same `RegistryResolution` shape both backends
   return, so the Rust implementation is checkable against the
   JS one.
3. Resolve the full transitive closure in a single
   `EndoRegistry.resolve` call (eager resolution), so the
   worker's per-import path stays bus-roundtrip-free.
4. Admit major-version coexistence the way MVS does: when two
   importers in the graph require incompatible majors of the
   same package, both majors land in the resolution and the
   compartment-mapper binds each import site to the right one.
5. Define a lockfile-interaction stance clearly: the first cut
   ignores lockfiles entirely.
   Lockfile honoring is a follow-up that slots in as a
   constraint pass without changing the surrounding shape.
6. Cover workspace, `peerDependencies`, and `optionalDependencies`
   in scope, with explicit tests for each.
   These are dependency-graph concerns and so belong to MVS;
   conditional `exports` are linking-time concerns and stay out
   of this document.

## Non-Goals

- A new package-manager CLI.
  The existing `endo install` / `endo run` / `endo make` shapes
  stay; what changes is what `endo run` and `endo make` can
  consume.
- Sharing data structures with the Rust implementation.
  The two lanes meet at the capability shape and the CAS
  contents, not at the resolver internals.
- Per-import resolution from the worker side.
  The worker calls `resolve` once with the entry `package.json`
  bytes and receives the full closure; the worker does not emit
  per-import `resolvePackage` calls during the
  `importLocation` walk.

## Where This Sits

This is the **algorithm layer** of the daemon-worker
`importLocation` stack:

| Layer | Doc | Concern |
|-------|-----|---------|
| Capability | [registry-capability](registry-capability.md) | `EndoRegistry` shape, `@registry` slot, lifetime |
| Algorithm | this | MVS walk, lockfile stance, who walks the graph |
| Mapper | [snapshot-mapper](snapshot-mapper.md) | `mapSnapshot`, `makeMountReadPowers`, `endo-mount:` scheme |
| Integration | [daemon-worker-import-from-mount](daemon-worker-import-from-mount.md) | `makeFromPackage`, worker dispatch, CLI, XS bridging |

## The MVS algorithm

Go's MVS selects, for each transitively-required module, the
greatest version mentioned anywhere in the dependency graph.
For npm-style versioning, the rule adapts to "greatest mentioned
minor (and patch) per major", because npm packages routinely
declare incompatible majors and the Go assumption of one major
per module does not hold.
[endor-npm-registry-proxy](endor-npm-registry-proxy.md)
§ *Comparison with Go's MVS* states the rule the JS reference
implementation also follows.

The resolution shape that emerges:

- For each `(package, major)` pair reachable from the entry
  `package.json`, the resolver picks the greatest minor / patch
  that satisfies every range expressed for that major across the
  closure.
- A package that appears under two majors in the closure (say,
  `ses@^1` from the entry and `ses@^2` from a transitive) lands
  twice in `packagesByKey`, keyed `ses@1.0.0` and `ses@2.3.4`.
  The compartment-mapper binds each import site to the right
  major; see [snapshot-mapper](snapshot-mapper.md) for the
  mechanic.
- The resolution is content-addressed by `resolutionHash`,
  computed by hashing the canonical key list (`keys`, ordered)
  together with each entry's `integrity` field.
  Two callers with the same `package.json` and registry state
  produce the same hash, which lets the
  [snapshot-mapper](snapshot-mapper.md) layer cache its work.

## Resolution path: who walks the graph

The Rust-side `endor-npm-registry-proxy` describes MVS as a
graph walk over `package.json` `dependencies`.
This design lifts that walk onto the JS-side resolver method
(`EndoRegistry.resolve`, defined in
[registry-capability](registry-capability.md)) because:

- The entry `package.json` arrives as opaque bytes; the resolver
  must read it, then read each transitively-required
  `package.json` from the package trees it fetches.
- The Rust resolver is already structured around this walk (per
  [endor-run-expanded](endor-run-expanded.md) § Phase 5).
  Exposing one `resolve(packageJsonBytes)` verb that returns the
  full transitive resolution keeps the JS-side worker loop small
  (no per-import callbacks across the bus).
- The single-pass shape also lets the resolution be
  content-addressed.
  The `resolutionHash` returned to the worker can serve as a
  cache key for the synthesized `ReadPowers` the mapper layer
  builds.

The alternative (have the worker emit per-import
`resolvePackage` calls during the `importLocation` walk) is
rejected: it would add one bus round-trip per imported package,
defeating the purpose of pre-resolution.
Either backend (JS or Rust) can still do on-demand fetch
within the `resolve` call; what we avoid is per-import
resolution from the worker side.

## Workspace resolution

A `package.json` may declare a workspace dependency through the
`workspace:` specifier prefix, by far the most common form being
`workspace:^` and `workspace:*`.
In a mount that contains the whole workspace, those references
must resolve to the sibling subdirectory rather than to the
registry.

The first cut resolves workspace specifiers by searching for the
parent `package.json` whose `workspaces` array (or the equivalent
`workspaces.packages` glob list for the historical
yarn-classic shape) names the importer's workspace member:

1. Starting at the importer's package directory, walk up the
   mount tree.
2. At each level, read the `package.json` and check whether its
   `workspaces` field is populated.
3. If yes, expand its glob patterns relative to that directory
   and check whether the importer's directory is one of the
   members.
   When it is, that level is the workspace root.
4. If no, continue walking up until either a workspace root is
   found or the mount root is reached.
5. If no workspace root is found and any importer used a
   `workspace:` specifier, reject with a clean error
   ("workspace dependency declared but no enclosing workspace
   root").

The discovered workspace root supplies the `workspaceRoot`
option to `EndoRegistry.resolve` so the workspace branch of the
algorithm above can look up sibling members.

Workspace members differ from registry-resolved packages in two
ways:

- They have no version segment in the synthesized location URL
  (see [snapshot-mapper](snapshot-mapper.md) § *Synthesized
  layout*); a workspace member named `@endo/patterns` resolves
  to `@endo/patterns/`, distinct from any registry-resolved
  `@endo/patterns@1.0.0/`.
- The workspace member's version on disk wins regardless of
  version predicates declared by other importers.
  An importer that requests `@endo/patterns@^2.0.0` against a
  workspace where the on-disk version is `1.0.0` still resolves
  to the workspace member; this is the maintainer-intended
  semantic and the only stable shape for a partially-pinned
  workspace.
  The resolver flags a diagnostic on the resolution when the
  workspace member's version does not satisfy an importer's
  range (so the diagnostic surface remains complete), but the
  resolution itself still picks the workspace member.

## Lockfile interaction: out of scope

The first cut limits scope to MVS resolution from
`package.json` alone and ignores any `package-lock.json` or
`yarn.lock` present in the entry mount.
MVS runs freely and produces the conservative "greatest mentioned
minor per major" result described in
[endor-npm-registry-proxy](endor-npm-registry-proxy.md)
§ *Comparison with Go's MVS*; lockfile honoring is a follow-up
design that can land once the MVS path is stable.

Lockfile honoring slots in as a constraint pass within
`EndoRegistry.resolve` without changing the surrounding
capability shape or the worker bootstrap:

- The constraint pass reads the lockfile alongside the entry
  `package.json`.
- For each `(package, version)` the lockfile pins, the pass
  intersects the lockfile pin with the MVS-selected version.
  When the pin and the MVS selection agree, the resolution is
  unchanged.
  When they disagree, the pass either fails fast (strict mode)
  or warns and prefers the MVS selection (loose mode); the mode
  is a future option.
- The `RegistryResolution.keys` list and its `resolutionHash`
  remain the same shape; the lockfile pass only constrains what
  versions the MVS walk picks, not how it reports the result.

This keeps the lockfile follow-up additive at every layer: the
capability shape does not change, the mapper does not change,
the worker does not change.

## JS reference implementation shape

The resolver lives in `packages/daemon/src/registry.js`,
co-located with the `EndoRegistry` exo defined by
[registry-capability](registry-capability.md).
Sketch:

```js
// packages/daemon/src/registry.js
const resolve = async (packageJsonBytes, options = {}) => {
  const { offline = false, workspaceRoot = undefined } = options;
  const root = parsePackageJson(packageJsonBytes);

  // Frontier: pending (name, requestedRange, source) edges, where
  // source is one of 'dependencies' | 'peerDependencies' |
  // 'optionalDependencies' for error classification.
  // Resolved: name -> Map<major, { version, integrity, treeRef }>.
  const frontier = enqueueAllDependencies(root);
  const resolved = new Map();
  const peerRequirements = []; // (importer, peer name, range)
  const unmetOptionals = [];   // (importer, dep name, range, reason)

  while (frontier.length > 0) {
    const edge = frontier.shift();
    const { name, range, source, importer } = edge;

    // workspace: specifier? resolve from workspaceRoot's siblings.
    if (isWorkspaceSpecifier(range)) {
      const workspacePj = await readWorkspaceMemberPackageJson(
        workspaceRoot, name,
      );
      if (workspacePj === undefined) {
        throw makeError(
          X`workspace dependency ${q(name)} not found in workspace at ${
            q(workspaceRoot)}`,
        );
      }
      // Workspace members carry no version segment and short-circuit
      // version selection; see "Workspace resolution" below.
      upsertWorkspaceMember(resolved, name, workspacePj);
      enqueueAllDependenciesInto(frontier, workspacePj, name);
      continue;
    }

    const major = parseRangeMajor(range);
    const existing = resolved.get(name)?.get(major);
    let candidate;
    try {
      candidate = await selectGreatestSatisfying(name, range, {
        table: registryTable,
        offline,
      });
    } catch (err) {
      if (source === 'optionalDependencies') {
        unmetOptionals.push({ importer, name, range, err });
        continue; // optional misses are silent at the graph level
      }
      throw err;
    }
    if (existing && cmp(existing.version, candidate.version) >= 0) {
      if (source === 'peerDependencies') {
        peerRequirements.push({ importer, name, range });
      }
      continue;
    }
    const treeRef = await fetchOrLookup(name, candidate.version, { offline });
    upsert(resolved, name, major, { ...candidate, treeRef });
    if (source === 'peerDependencies') {
      peerRequirements.push({ importer, name, range });
    }
    const childPj = await readPackageJson(treeRef);
    enqueueAllDependenciesInto(frontier, childPj, name);
  }

  // Peer cross-check: every recorded peer requirement must be
  // satisfied by some entry in `resolved`.
  assertPeerDependenciesSatisfied(peerRequirements, resolved);

  return buildRegistryResolution(resolved, { unmetOptionals });
};
```

Notes on the sketch:

- `selectGreatestSatisfying` consults the registry table for
  published versions and picks the greatest that satisfies the
  range, fetching the package's metadata from the registry when
  the table is cold.
  In `offline: true` mode, it consults only the table and rejects
  with `RegistryOfflineError` on a miss.
- `parseRangeMajor` extracts the major-version key that drives
  MVS's per-major coexistence; the resolver tracks one selection
  per `(name, major)`, not one per `name`.
- `buildRegistryResolution` flattens the `(name, major) ->
  selection` map into the `packagesByKey` shape the capability
  returns, computes the canonical key list, and derives
  `resolutionHash`.
  The `unmetOptionals` list is attached as diagnostic state on
  the resolution; callers that want strict optional behavior can
  inspect it.
- `assertPeerDependenciesSatisfied` raises
  `RegistryMissingPackageError` ("package X declares unmet peer
  dependency Y") when an importer's peer requirement does not
  appear in the resolved closure within its declared range.
- `enqueueAllDependencies` walks `dependencies`,
  `peerDependencies`, and `optionalDependencies` together;
  conditional exports do not enter the dependency graph (they
  apply at link time, not at graph-walk time).

## Phased implementation

This algorithm lands as Phase 1 of the integration stack, inside
the JS reference implementation of
[registry-capability](registry-capability.md) § Phase 1.
That section enumerates the test surface (lookup, resolve,
fetch).
The MVS-specific shape tests this design adds:

- A small fixture with a transitively-required package whose
  range is widened by a deeper requirement (entry says `pkg@^1.0.0`,
  transitive says `pkg@^1.2.0`); the resolution picks the
  greatest `1.x` that satisfies both.
- A fixture where two importers require incompatible majors
  (entry says `pkg@^1`, transitive says `pkg@^2`); the resolution
  carries both majors as distinct `packagesByKey` entries.
  This is the same multi-major coexistence test the
  [snapshot-mapper](snapshot-mapper.md) and
  [daemon-worker-import-from-mount](daemon-worker-import-from-mount.md)
  layers exercise end-to-end.
- An offline-mode fixture: the table already holds the resolved
  packages and `resolve` completes without fetching; a second
  fixture confirms `RegistryOfflineError` when the table is
  missing a required pair.
- **Workspace resolution.**
  A fixture with a root `package.json` declaring `workspaces:
  ['packages/*']` and two members `packages/lib-a` and
  `packages/lib-b`, where `lib-a` declares a dependency
  `'lib-b': 'workspace:^'`.
  The resolution carries `lib-b` as a workspace member entry
  (no version segment), and a subsequent `mapSnapshot` pass
  emits the workspace member at its versionless location.
- **Workspace member version mismatch diagnostic.**
  A fixture where an importer declares
  `'lib-b': '^2.0.0'` but the workspace member's on-disk
  `package.json` has `version: '1.0.0'`; the resolution still
  prefers the workspace member, and the resolution carries a
  diagnostic listing the mismatch.
- **`peerDependencies` satisfied.**
  A fixture where `pkg-a` declares
  `peerDependencies: { 'react': '^18.0.0' }` and the entry
  package depends on both `pkg-a` and `react@^18.0.0`; the
  resolution succeeds and contains a single `react@18.x.y`
  entry.
- **`peerDependencies` unmet.**
  The same `pkg-a` with `peerDependencies: { 'react': '^18.0.0' }`,
  but the entry package depends only on `pkg-a` (no `react`).
  The resolution rejects with
  `RegistryMissingPackageError` quoting the importer name and the
  unmet peer dependency.
- **`optionalDependencies` missing.**
  A fixture with `optionalDependencies: { 'fsevents': '^2.0.0' }`
  where the registry has no `fsevents@^2.0.0`; the resolution
  succeeds (no entry for `fsevents`) and the diagnostic state
  attached to the resolution names `fsevents` as an unmet
  optional.

## Design Decisions

1. **Eager resolution, not lazy per-import resolution.**
   The `EndoRegistry.resolve` call returns the full transitive
   closure of selected packages before the worker begins
   `importLocation`.
   Per-import lazy resolution would add one bus round-trip per
   imported package and defeat the pre-computed
   `resolutionHash` that lets the
   [snapshot-mapper](snapshot-mapper.md) layer cache its work.
   Eager resolution also matches the Rust-side `endor run` flow,
   where the compartment-mapper walks once and the import hook
   then reads by hash.

2. **MVS only in the first cut; lockfile honoring deferred.**
   Limiting scope to `package.json` + MVS keeps the first cut
   small enough to ship and stabilize.
   Lockfile honoring is a real-world requirement and a clean
   follow-up: it slots into `EndoRegistry.resolve` as a
   constraint pass without changing the surrounding capability
   shape or the worker bootstrap.
   See [endor-npm-registry-proxy](endor-npm-registry-proxy.md)
   for the Rust-side counterpart that defers the same lane.

3. **One selection per `(name, major)`, not one per `name`.**
   The "greatest mentioned minor per major" rule needs per-major
   bookkeeping in the resolver state; the resolver tracks one
   selection per `(name, major)` pair throughout the walk.
   The output flattens to `packagesByKey` keyed by canonical
   `<name>@<version>` strings, which is what
   [registry-capability](registry-capability.md) consumes.

## Anti-design steers

- **Considered and rejected: thread `condition` through the MVS
  walk.**
  Conditional `exports` apply at compartment-map link time, not
  at dependency-graph walk time.
  The dependency graph that MVS walks is determined by
  `dependencies`, `peerDependencies`, and `optionalDependencies`;
  conditions decide which module file inside a package satisfies
  a specifier and so belong to the link step in the integration
  layer, not to this document.
  See
  [daemon-worker-import-from-mount](daemon-worker-import-from-mount.md)
  for the link-time condition handling.

- **Considered and rejected: defer `peerDependencies` and
  `optionalDependencies` as gaps.**
  Both are in scope in the first cut.
  `peerDependencies` are cross-checked after the walk: an
  unsatisfied peer surfaces as `RegistryMissingPackageError`
  quoting the importer and the unmet name.
  `optionalDependencies` are walked best-effort: a miss is
  silent at the graph level (no entry in `packagesByKey`) and
  appears in a diagnostic side-channel attached to the
  resolution.

## Dependencies

| Design | Relationship |
|--------|--------------|
| [registry-capability](registry-capability.md) | Hosts this algorithm.  The capability surface (`resolve`, `RegistryResolution`) is where the algorithm meets its callers. |
| [snapshot-mapper](snapshot-mapper.md) | Consumes the `RegistryResolution` this algorithm produces; the `compartment-mapper`'s package descriptor walk binds each import site to the right `(name, version)` entry. |
| [endor-npm-registry-proxy](endor-npm-registry-proxy.md) | The Rust-side analogue of this algorithm.  Both lanes follow the same Go-like MVS rule and produce structurally identical `RegistryResolution` outputs; the JS lane is what the Rust lane is checked against. |
| [daemon-worker-import-from-mount](daemon-worker-import-from-mount.md) | Drives the algorithm exactly once per `makeFromPackage` invocation.  The integration layer does not loop over the resolver. |
| [endor-run-expanded](endor-run-expanded.md) | Describes the Rust-side entry flow.  Phase 5 there is the analogue of this design's single-call eager-resolution shape. |

## Prompt

> kriskowal CHANGES_REQUESTED on `endojs/endo-but-for-bots#358`
> (2026-06-02): decompose the monolithic
> `daemon-worker-import-from-mount` design into layers, one of
> which is the Go-like MVS resolver adapted to JS package
> versioning (resolution-path question, lockfile-out-of-scope
> stance).
>
> Round-2 CHANGES_REQUESTED on the same PR (2026-06-02): drop
> conditions from the dependency-graph scope (they apply at
> compartment-map link time, which is not the subject of this
> document); make workspace resolution in scope by searching for
> a parent `package.json` with `workspaces` enabled where the
> workspace member is named; make `peerDependencies` and
> `optionalDependencies` in scope and test accordingly.
