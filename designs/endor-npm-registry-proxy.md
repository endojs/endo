# NPM Registry Proxy via CAS and Registry Table

| | |
|---|---|
| **Created** | 2026-04-17 |
| **Updated** | 2026-04-17 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |

## Status

Phases 1 and 3 implemented:

- **Phase 1**: `rust/endo/src/registry.rs` — SQLite-backed
  `RegistryTable` with `lookup`, `insert`, `list_versions`,
  `get_meta`/`set_meta`, `count`. Schema matches the design:
  `packages(name, version, hash, integrity, fetched_at)` and
  `package_meta(name, versions_json, fetched_at)`.
- **Phase 3**: `rust/endo/src/semver.rs` — `Version` parsing
  with ordering, `Range` parsing with `^`, `~`, `>=`, `<`, `<=`,
  `*`, exact versions, and space-separated AND composites.
  `select_versions` implements Go-like MVS: greatest available
  version per major satisfying all ranges.

Remaining: Phase 2 (HTTP client for package fetching), Phase 4
(compartment mapper integration), Phase 5 (offline mode, .npmrc).

## What is the Problem Being Solved?

`endor run entry.js` should be able to resolve, fetch, and
execute npm packages without using the `npm` CLI, without
laying out a `node_modules` tree, and without requiring a
`package-lock.json`.

Today, running a JavaScript program with npm dependencies
requires:

1. A `package.json` declaring dependencies.
2. Running `npm install` to populate `node_modules`.
3. A Node.js runtime (or a tool that understands
   `node_modules` layout) to resolve `import` specifiers.

This is heavyweight, slow, and produces a mutable
`node_modules` tree that is not content-addressed.
For Endo's capability-confined workers, we want a model
where:

- Packages are downloaded from the npm registry on demand.
- Package contents are stored in the CAS (content-addressed,
  deduplicated, immutable).
- A **registry table** maps package names and versions to
  CAS hashes.
- Version resolution follows Go-like minimal version
  selection: the greatest explicitly mentioned minor version
  for each major version in the transitive dependency graph.
- No `node_modules` directory is created.
- `endor run entry.js` works out of the box if the entry
  module's dependencies are available on the npm registry.

## Design

### Architecture overview

```
┌──────────────┐     ┌─────────────────┐     ┌──────────┐
│ endor run    │────>│ Registry Table   │────>│ npmjs.com│
│ entry.js     │     │ (SQLite/JSON)    │     │ registry │
└──────┬───────┘     └────────┬────────┘     └──────────┘
       │                      │
       │   ┌──────────────────┘
       │   │
       v   v
  ┌────────────┐
  │    CAS     │
  │ store-sha256│
  └────────────┘
```

The registry table is a local cache of npm registry metadata.
It maps `(package-name, version)` to the CAS hash of the
package's contents.
When a package is not in the table, it is fetched from the
npm registry, stored in the CAS, and the table is updated.

### Registry table

The registry table is a SQLite database (or a JSON file for
simpler deployments) at `{statePath}/registry.sqlite`:

```sql
CREATE TABLE packages (
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    hash TEXT NOT NULL,          -- CAS hash of package tree
    integrity TEXT,              -- npm integrity field (sha512)
    fetched_at INTEGER NOT NULL, -- Unix timestamp
    PRIMARY KEY (name, version)
);

CREATE TABLE package_meta (
    name TEXT PRIMARY KEY,
    versions_json TEXT NOT NULL, -- Cached registry metadata
    fetched_at INTEGER NOT NULL
);
```

The `package_meta` table caches the npm registry's version
listing for each package, avoiding repeated HTTP requests
during a single resolution pass.

### Version resolution: Minimal Version Selection

Inspired by Go's module system, version resolution uses
**Minimal Version Selection (MVS)** adapted for npm's
semver conventions:

#### Algorithm

1. **Collect requirements.**
   Starting from the entry package, recursively walk
   `dependencies` in each `package.json`.
   Each dependency declares a semver range (e.g.,
   `"^2.3.0"`, `"~1.2.0"`, `">=3.0.0 <4.0.0"`).

2. **For each package, group by major version.**
   Within a major version, find the **greatest minor.patch**
   that is explicitly mentioned (directly or transitively)
   and satisfies all declared ranges.

   This is the "greatest explicitly mentioned minor version"
   rule: we never select a version newer than what any
   package in the dependency graph has declared.
   This is conservative — it avoids pulling in untested
   versions.

3. **Co-versioned workspaces.**
   If a package declares `workspaces` or uses npm's
   workspace protocol (`"workspace:^"`), all packages in the
   workspace are resolved to the same version.
   This matches the monorepo convention where workspace
   packages are published in lockstep.

4. **Resolve transitively.**
   After selecting a version for each package, re-walk the
   dependency graph with the selected versions to check for
   new transitive dependencies.
   Repeat until the selection stabilizes (typically 1-2
   iterations).

#### Comparison with Go's MVS

| Aspect | Go MVS | Endor MVS |
|--------|--------|-----------|
| Version format | semver | semver |
| Selection rule | Greatest mentioned | Greatest mentioned minor within major |
| Major version coexistence | Yes (import paths differ) | Yes (compartment map allows multiple major versions) |
| Lock file | `go.sum` (verification) | Registry table (cache) |
| Network fetch | On demand | On demand |

The key difference is that Go's module paths embed the
major version (`github.com/foo/bar/v2`), making major
version coexistence implicit.
In npm, major version coexistence is explicit in the
compartment map — two compartments can reference different
major versions of the same package.

### Package fetching

When a package version is needed and not in the registry
table:

1. **Fetch metadata.**
   `GET https://registry.npmjs.org/{name}` (or the
   configured registry URL from `NPM_CONFIG_REGISTRY` or
   `.npmrc`).
   Cache the `versions` object in `package_meta`.

2. **Select version.**
   From the cached metadata, find the version matching the
   resolved requirement.

3. **Fetch tarball.**
   `GET {tarball_url}` from the version's `dist.tarball`
   field.

4. **Verify integrity.**
   Check `dist.integrity` (SHA-512) against the downloaded
   tarball.

5. **Extract to CAS.**
   npm tarballs are gzipped tar archives with a `package/`
   prefix.
   Extract each file:
   - Strip the `package/` prefix.
   - Store the file content as a CAS blob.
   - Build a tree entry for the package directory.
   - Store the tree in the CAS.

6. **Update registry table.**
   Insert `(name, version, tree_hash, integrity)` into the
   `packages` table.

### Integration with `endor run`

When `endor run entry.js` encounters an `import` of a bare
specifier (e.g., `import express from 'express'`), the
compartment mapper:

1. Looks up `express` in the entry package's `dependencies`.
2. Resolves the version using MVS.
3. Checks the registry table for the resolved version.
4. If missing, fetches from the npm registry and stores in
   the CAS.
5. Reads the package's `package.json` from the CAS tree to
   determine its entry point and own dependencies.
6. Continues the transitive walk.

Once resolution is complete, the compartment map is built
with CAS hashes as module locations.
The XS machine loads modules by hash from the CAS — no
`node_modules` directory is ever created.

### Configuration

```
# Environment variables
NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
ENDOR_REGISTRY_DB={statePath}/registry.sqlite

# .endorrc (optional, in project or home directory)
registry = https://registry.npmjs.org/
```

The registry URL defaults to `https://registry.npmjs.org/`.
Private registries are supported by setting
`NPM_CONFIG_REGISTRY`.

Authentication (for private packages) uses npm's `.npmrc`
token format:

```
//registry.npmjs.org/:_authToken=xxx
```

### Offline mode

When `--offline` is passed to `endor run`, the registry is
not consulted.
Only packages already in the CAS and registry table are
available.
This enables reproducible builds after the first fetch.

The registry table serves as a lightweight lock file: once
populated, subsequent runs resolve to the same versions
without network access.

### CAS integration

Each npm package in the CAS is a tree entry:

```json
{
  "entries": {
    "package.json": {
      "type": "blob",
      "hash": "sha256:...",
      "size": 1234
    },
    "index.js": {
      "type": "blob",
      "hash": "sha256:...",
      "size": 5678
    },
    "lib": {
      "type": "tree",
      "hash": "sha256:..."
    }
  }
}
```

Packages that share files (e.g., vendored copies of the same
utility) automatically deduplicate at the blob level.

The registry table's `hash` column points to the tree hash
of the extracted package.
The tree's children are the package's files, stored as blobs.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-cas-management](daemon-cas-management.md) | Requires: CAS blob/tree storage |
| [endor-run-expanded](endor-run-expanded.md) | Integrates: Form 3 (entry-point) uses registry for dependency resolution |

## Implementation phases

### Phase 1: Registry table schema

1. Create `rust/endo/src/registry.rs` with SQLite-backed
   registry table (using `rusqlite` or the existing
   `xsnap::powers::sqlite` wrapper).
2. Implement `lookup(name, version)`, `insert(...)`,
   `get_meta(name)`, `set_meta(name, versions_json)`.
3. **Test**: insert/lookup round-trip, metadata caching.

### Phase 2: Package fetching

1. Add HTTP client capability (minimal: `ureq` or
   `reqwest` with blocking).
2. Implement `fetch_package(name, version)`:
   metadata fetch → tarball download → integrity check →
   CAS extraction → registry table update.
3. **Test**: fetch a small, well-known package (e.g.,
   `is-odd`), verify CAS contents.

### Phase 3: Minimal Version Selection

1. Implement semver parsing and range matching.
2. Implement MVS algorithm: collect requirements, group by
   major, select greatest mentioned minor.
3. Handle co-versioned workspaces.
4. **Test**: resolve a dependency graph with known versions,
   verify selection matches expectations.

### Phase 4: Integration with compartment mapper

1. Add a `CasPackageResolver` that the XS-hosted compartment
   mapper can call via host functions:
   - `resolvePackage(name, range)` → `{version, hash}`
   - `fetchPackageJson(hash)` → JSON string
   - `fetchModuleSource(hash, path)` → bytes
2. Wire these into the mapper's `moduleMapHook` and
   `importHook`.
3. **Test**: `endor run app.js` where `app.js` imports a
   package from the registry, verify execution.

### Phase 5: Offline mode and .npmrc support

1. Add `--offline` flag to skip network access.
2. Parse `.npmrc` for registry URL and auth tokens.
3. Support scoped registries (`@scope:registry=...`).
4. **Test**: run with `--offline` after populating CAS,
   verify no network calls.

## Design decisions

1. **Go-style MVS, not npm's maximal version selection.**
   npm selects the newest version satisfying each range.
   This is aggressive — it can pull in versions that no
   package in the graph has tested against.
   MVS is conservative: it selects the version that was
   explicitly required, avoiding untested upgrades.
   This matches Endo's philosophy of predictability and
   confinement.

2. **SQLite for the registry table.**
   JSON files are fragile under concurrent access and slow
   for large registries.
   SQLite is ACID, fast, and already available in the
   xsnap build (used by the SQLite host power).

3. **No `node_modules` directory.**
   The compartment map + CAS replaces `node_modules`
   entirely.
   Modules are loaded by hash, not by filesystem path.
   This eliminates the need for `npm install`, hoisting
   heuristics, and `.bin` symlinks.

4. **On-demand fetching, not upfront install.**
   Packages are fetched when first needed during
   resolution, not in a separate install step.
   This is faster for small dependency graphs and enables
   incremental resolution.

5. **Registry table as implicit lock file.**
   Once a version is resolved and stored, subsequent runs
   use the cached resolution.
   An explicit `endor lock` command could snapshot the
   registry table for reproducibility, but the implicit
   behavior is sufficient for development workflows.

## Known gaps

- [ ] Private registry authentication beyond `.npmrc` tokens.
- [ ] Workspace-protocol resolution for monorepos not yet
      published to a registry.
- [ ] `peerDependencies` and `optionalDependencies` handling.
- [ ] Pre/post-install scripts (intentionally omitted — Endo
      does not execute arbitrary install scripts).
- [ ] Binary packages (`.node` native modules) — not
      supported in XS.

## Prompt

> Please create a design document that simply serves as a
> reminder to the authors to design a system where the content
> address store and a registry table collectively serve as a
> proxy for the contents of the npm registry, where packages
> are downloaded from npmjs.com or the designated npm registry
> address on demand, resolved using rules similar to Golang
> (greatest explicitly mentioned minor version for each major
> version in the transitive dependencies of the entry package
> and transitively co-versioned workspaces), such that
> `endor run entry.js` can function without using the npm CLI
> or laying out a node_modules tree at all.
