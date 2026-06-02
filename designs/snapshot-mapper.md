# `mapSnapshot`: JS-Snapshot to Compartment-Map-Snapshot Mapper

| | |
|---|---|
| **Created** | 2026-06-02 |
| **Author** | endolinbot (prompted) |
| **Status** | Proposed |

## Summary

A daemon-specific variation on `compartment-mapper.mapNodeModules`
that takes a pair of daemon capabilities (an `EndoRegistry`
resolution and an `EndoMount` or `readable-tree` entry source) and
produces a `CompartmentMap` whose package descriptors point at a
synthesized `endo-mount:` URL scheme.
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
   `CompartmentMap` whose locations use a single synthesized URL
   scheme that the worker's `read` function can dereference
   uniformly across the entry mount and the resolved CAS trees.
2. Pre-compute the trio
   `{ compartmentMap, resolution, readPowers }` once, so the
   worker's `importLocation` invocation is a single call against
   already-walked state.
3. Admit MVS major-version coexistence cleanly: the synthesized
   URL scheme carries the selected `<name>@<version>` in the
   directory segment so two majors of the same package address
   to two distinct paths.
4. Keep `compartment-mapper` itself daemon-agnostic.
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
| Mapper | this | `mapSnapshot`, `makeMountReadPowers`, `endo-mount:` scheme |
| Integration | [daemon-worker-import-from-mount](daemon-worker-import-from-mount.md) | `makeFromPackage`, worker dispatch, CLI, XS bridging |

## `mapSnapshot` in context

`compartment-mapper` exposes a family of `map*` entry points
that build a `CompartmentMap` from a source: `mapNodeModules`
walks an on-disk `node_modules/` layout; `mapArchive` reads a
closed-world archive.
This design adds a third lane named `mapSnapshot` that takes a
pair of daemon capabilities, an `EndoRegistry` and an
`EndoMount` (or `readable-tree`), and produces a
`CompartmentMap` whose package descriptors point at the
synthesized `endo-mount:` locations defined below.

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
  conditions?: string[],
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
described, and the read function dereferences against the same
`endo-mount:` scheme `makeMountReadPowers` exposes.
The eventual shape is symmetric to `mapNodeModules` +
`importLocation`: `mapSnapshot` produces the snapshot,
`importSnapshot` runs it.

## `ReadPowers` synthesis: `makeMountReadPowers`

The helper `makeMountReadPowers` lives in
`packages/daemon/src/worker-import.js` and is shared between the
Node and XS worker bootstrap.

Each location is a URL in a synthetic `endo-mount:` scheme:

- `endo-mount:/<relative-path>` reads from the entry mount.
- `endo-mount:/node_modules/<name>@<version>/<relative-path>`
  reads from the resolved package tree for the specific
  `(name, version)` pair (via the resolution's CAS tree).
  Scoped packages embed the `@scope` and the version after the
  bare name:
  `endo-mount:/node_modules/@endo/patterns@1.2.1/...`.
  The version segment lets the MVS major-coexistence path the
  `RegistryResolution` type explicitly admits land cleanly:
  two majors of `ses` resolve to two distinct synthesized paths
  (`endo-mount:/node_modules/ses@1.0.0/...` and
  `endo-mount:/node_modules/ses@2.3.4/...`).

`compartment-mapper`'s descriptor walk knows the selected
version for each `(importer, dependency)` edge because the walk
operates against the resolution's `packagesByKey` and threads
the `(name, version)` pair into the synthesized URL it emits
for the dependency's directory.

The `endo-mount:` scheme is internal to the worker; it never
appears in user code.
`compartment-mapper` treats locations as opaque strings and
asks the `read` function to fetch bytes, so the worker controls
the scheme entirely.

```js
const makeMountReadPowers = ({ entryMount, registry, resolution }) => {
  // packagesByKey: canonical `<name>@<version>` keys per the
  // RegistryResolution shape. The compartment-mapper package
  // descriptor walk emits `endo-mount:/node_modules/<key>/...`
  // references, where `<key>` carries the selected version, so
  // the same map covers MVS major-coexistence (`ses@1.0.0` and
  // `ses@2.3.4` are distinct entries).
  const packagesByKey = new Map(Object.entries(resolution.packagesByKey));

  const read = async location => {
    const url = new URL(location);
    if (url.protocol !== 'endo-mount:') {
      throw makeError(X`Unsupported location: ${q(location)}`);
    }
    const path = url.pathname.replace(/^\//, '').split('/');
    if (path[0] === 'node_modules') {
      // Scoped packages encode as `node_modules/<@scope>/<name>@<version>/...`
      // and unscoped as `node_modules/<name>@<version>/...`; the
      // parser below distinguishes `@endo/patterns@1.2.1` (a
      // single key spanning two path segments) from a hypothetical
      // un-scoped `patterns@1.2.1` (one path segment).
      const { key, rest } = parsePackageKey(path.slice(1));
      let treeRef = packagesByKey.get(key);
      if (treeRef === undefined) {
        // Late bind via the registry capability the closure also
        // holds, then memoize. This path is rare (the
        // pre-resolution closure should cover everything the
        // mapper walks), but the closure keeps the read function
        // self-sufficient rather than forcing a re-dispatch into
        // the worker for a single missing package. The registry's
        // fetch throws cleanly if no such (name, version) exists,
        // citing the enclosing resolutionHash for diagnosability.
        const [name, version] = parseNameVersion(key);
        treeRef = await E(registry).fetch(name, version);
        packagesByKey.set(key, treeRef);
      }
      return E(treeRef).readBytes(rest);
    }
    return E(entryMount).readBytes(path);
  };

  const canonical = async location => location;

  return harden({ read, canonical });
};
```

The `compartment-mapper`'s package descriptor walk reads each
importer's `package.json#dependencies`, maps each bare specifier
to the selected version from `resolution.packagesByKey`, and emits
the dependency URL with `<name>@<version>` as the directory
segment so the synthesized layout disambiguates majors.
For a project that depends on `pkg@^1` directly and on a
transitive that requires `pkg@^2`, the entry importer's
specifier `'pkg'` resolves to
`endo-mount:/node_modules/pkg@1.x.y/` and the transitive
importer's specifier `'pkg'` resolves to
`endo-mount:/node_modules/pkg@2.x.y/`; each importer reads its
own major's tree.
The descriptor walk's per-importer version table is the
authoritative source for the `<name>@<version>` segment; the
mapper does not need to know that the `node_modules` segment is
synthetic.

### npm-shape and compartment-map-shape translation

The translation `mapSnapshot` performs is:

| npm concept | `RegistryResolution` field | `CompartmentMap` shape |
|-------------|----------------------------|------------------------|
| Selected `(name, version)` | `packagesByKey[key]` | One compartment per key |
| Importer's `dependencies['pkg']` | Lookup `(pkg, range)` against `packagesByKey` | A compartment-map module record pointing at the selected version's compartment |
| Importer's `dependencies` (transitive) | The same lookup, per importer | A per-compartment dependency map |
| Package contents (the `.tgz` unpacked) | `packagesByKey[key].treeRef` | Compartment location `endo-mount:/node_modules/<key>/` |
| Entry module | Caller-supplied `entry?` or `compartment-mapper`'s default entry resolution | Compartment-map entry compartment |

The compartment-mapper already knows how to translate the
right-hand side into the on-the-wire `CompartmentMap` shape;
`mapSnapshot`'s job is to feed the package-descriptor walker the
correct `(name, version)` answer for every bare-specifier lookup,
which the walker consults via the small extension point this
design adds to `compartment-mapper`.

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
   the synthesized `endo-mount:` URL scheme).
4. Tests:
   - Hand-crafted fixture with a trivial `package.json` pinning
     a single small dependency (e.g. `is-odd@1.0.0`); verify
     `mapSnapshot` returns a `CompartmentMap` whose package
     descriptors carry the resolved version and the
     `endo-mount:/node_modules/is-odd@1.0.0/` location.
   - **Multi-major coexistence.**
     Project that depends on `pkg@^1` directly and on a
     transitive that requires `pkg@^2` produces a
     `RegistryResolution.packagesByKey` carrying both majors;
     the `mapSnapshot` output's compartment-map binds the entry
     importer's `'pkg'` specifier to `pkg@1.x.y` and the
     transitive importer's `'pkg'` specifier to `pkg@2.x.y`.
     The test uses two side-by-side fixture packages so the
     bytes the two majors return differ and the test can assert
     each importer reads from its own major's tree.

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

2. **One synthesized scheme covers both the entry and the resolved
   dependencies.**
   The `endo-mount:` scheme braids the entry mount (place-like
   until snapshot) and the resolved CAS trees (immutable values)
   into one address space.
   A two-scheme refinement (`endo-mount:` for the entry,
   `endo-tree:` for resolved deps) would signal the nature of the
   data through the scheme itself; the first cut keeps one scheme
   because the worker takes the `snapshot()` before `importLocation`
   runs, so by the time the mapper emits any URL the entry mount
   has been frozen to a tree-shaped snapshot.
   Both roles read tree-shaped immutable data at the moment of
   read, and a single scheme keeps the mapper's `read` function
   shape uniform.
   The split is tracked as an open question below.

3. **Output trio is the snapshot identity.**
   Producing `{ compartmentMap, resolution, readPowers }` from
   one call lets a future `importSnapshot` re-hydrate an
   application from
   `(compartmentMap, resolutionHash, entrySnapshotHash)` without
   re-walking.
   The mapper does not separately expose
   `resolution.resolutionHash`; the resolver layer (consumed
   here) already provides it.

## Open Questions

1. **Two-scheme URL split (`endo-mount:` vs `endo-tree:`).**
   The synthesized scheme today addresses both the entry mount
   (snapshotted into a tree before the mapper sees it) and the
   resolved dependency CAS trees.
   A two-scheme refinement would signal "place that became a
   value" vs "value the resolver produced" through the scheme.
   The first cut keeps one scheme because both roles are
   tree-shaped at read time; revisit if a future feature adds
   a non-tree read source under the same `ReadPowers`.

2. **Caching the synthesized `ReadPowers`.**
   Two invocations against the same mount with the same
   `package.json` and the same registry resolution should reuse
   the `makeMountReadPowers` result.
   The `resolutionHash` is the natural cache key, but the cache
   itself needs an owner (daemon-wide? per-host?).
   This is a performance refinement, not a correctness question;
   defer until profiling shows the construction cost matters.

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
> via `makeMountReadPowers`, npm-shape ↔ compartment-map-shape
> translation).
