# JS Reference Implementation of Go-like Minimum Version Selection

| | |
|---|---|
| **Created** | 2026-06-02 |
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
  const { offline = false, condition = ['import', 'endo'] } = options;
  const root = parsePackageJson(packageJsonBytes);

  // Frontier: pending (name, requestedRange) edges.
  // Resolved: name -> Map<major, { version, integrity, treeRef }>.
  const frontier = enqueueDependencies(root, condition);
  const resolved = new Map();

  while (frontier.length > 0) {
    const { name, range } = frontier.shift();
    const major = parseRangeMajor(range);
    const existing = resolved.get(name)?.get(major);
    const candidate = await selectGreatestSatisfying(name, range, {
      table: registryTable,
      offline,
    });
    if (existing && cmp(existing.version, candidate.version) >= 0) {
      continue; // existing pick is already the greatest mentioned for this major
    }
    const treeRef = await fetchOrLookup(name, candidate.version, { offline });
    upsert(resolved, name, major, { ...candidate, treeRef });
    const childPj = await readPackageJson(treeRef);
    enqueueDependenciesInto(frontier, childPj, condition);
  }

  return buildRegistryResolution(resolved);
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
- The pseudocode collapses some edge cases (peer / optional
  dependencies are open questions, condition handling threads
  the `condition` option through the package descriptor's
  conditional `dependencies`, and workspace protocol is an open
  question).

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

## Open Questions

1. **Per-condition resolution.**
   `compartment-mapper` supports `import`, `browser`, and `endo`
   conditions on `package.json#exports`.
   Should `resolve` accept an `options.condition: string[]` and
   thread it through both the MVS walk (which inspects
   `peerDependencies` and conditional `dependencies`) and the
   downstream `importLocation` call?
   The Rust-side design does not yet name conditions.
   Provisional answer: yes, accept the option, default to
   `['import', 'endo']`, and revisit once the Rust-side resolver
   names its condition behavior.

2. **Workspace protocol (`workspace:^`).**
   A `package.json` may declare a workspace dependency
   referencing a sibling package on disk.
   In a mount that contains the whole workspace, those
   references should resolve to the sibling subdirectory rather
   than to the registry.
   `EndoRegistry.resolve` needs a way to discover the workspace
   root; the entry mount carries that information (the workspace
   `package.json` typically lives at the mount root, with member
   packages under `packages/`).
   The first cut can reject `workspace:` specifiers with a clear
   error pointing at this gap; the followup is a
   workspace-detection step in `EndoRegistry.resolve`.

3. **`peerDependencies` and `optionalDependencies`.**
   The Rust-side design defers these as a known gap.
   This design inherits the same gap; resolution silently
   ignores them today.
   A clean error from `EndoRegistry.resolve` ("package X declares
   unmet peer dependency Y") is preferable to the silent-ignore
   default; the question is whether to enforce it in the first
   cut or defer to a follow-up.

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
