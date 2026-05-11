# Break devDependency Cycles via Synthetic Test Packages

| | |
|---|---|
| **Created** | 2026-05-11 |
| **Updated** | 2026-05-11 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Refs** | [PR #121](https://github.com/endojs/endo-but-for-bots/pull/121), [Issue #116](https://github.com/endojs/endo-but-for-bots/issues/116) |

## What is the Problem Being Solved?

The `packages/*` workspace dependency graph contains one large cycle of
13 packages, formed entirely by `devDependencies` edges that point
"backwards" against the runtime layering.
Every cycle disappears if `devDependencies` are ignored: the
`dependencies`-only subgraph is a clean DAG.

This is the cycle PR #121's `turbo.json.md` calls out as the reason
the configuration uses the in-package `dependsOn: ["build"]` form
rather than the upstream-workspace `^build` form.
Turbo 2.9 traverses both `dependencies` and `devDependencies` when
computing its task graph, has no `dependencyTypes` knob to restrict
that traversal, and (since the 2.9 demotion) prints a multi-line
cycle warning at the start of every invocation if `^build` is used.
The cycle is not strictly fatal for affected-set selection
(`...[origin/llm]` walks the same workspace graph turbo would walk for
`^build`, so downstream packages are still selected when an upstream
changes), but the cosmetic noise on every CI log conflicts with the
project's silent-by-default diagnostic discipline, and the per-task
cache hash is weaker than it could be.

The maintainer's hypothesis on PR #121: factor the test-only
cross-imports into smaller helper packages that are not themselves
dev-dependency targets, and the cycle disappears.
This design proposes a concrete shape for that factoring, audits the
current cycle, and lists the per-cycle cuts.

The audit below treats `ses` (workspace package, no `@endo/` scope)
as a member of the workspace graph, since that is how turbo, lerna,
and yarn workspaces all resolve it.

## Survey of Current Cycles

A Tarjan SCC pass over the workspace graph (combined `dependencies` +
`devDependencies`, restricted to workspace nodes) returns exactly one
non-trivial SCC of 13 packages:

```
@endo/compartment-mapper
@endo/evasive-transform
@endo/eventual-send
@endo/harden
@endo/hex
@endo/init
@endo/lockdown
@endo/module-source
@endo/promise-kit
@endo/ses-ava
@endo/test262-runner
@endo/zip
ses
```

The same pass over the `dependencies`-only subgraph returns **zero**
non-trivial SCCs.
Every cycle is created by a `devDependencies` back-edge.

### The 18 cycle-forming devDep edges

```
@endo/compartment-mapper --devDep--> @endo/evasive-transform
@endo/compartment-mapper --devDep--> @endo/eventual-send
@endo/compartment-mapper --devDep--> @endo/init
@endo/compartment-mapper --devDep--> @endo/ses-ava
@endo/evasive-transform  --devDep--> @endo/ses-ava
@endo/eventual-send      --devDep--> @endo/lockdown
@endo/eventual-send      --devDep--> ses
@endo/harden             --devDep--> ses
@endo/hex                --devDep--> @endo/eventual-send
@endo/hex                --devDep--> @endo/init
@endo/hex                --devDep--> @endo/ses-ava
@endo/hex                --devDep--> ses
@endo/module-source      --devDep--> @endo/ses-ava
@endo/zip                --devDep--> @endo/eventual-send
@endo/zip                --devDep--> @endo/ses-ava
ses                      --devDep--> @endo/compartment-mapper
ses                      --devDep--> @endo/module-source
ses                      --devDep--> @endo/test262-runner
```

### Topology, by category

**Mutual-pair (the simplest cycles):**

- `@endo/compartment-mapper` <-devDep-> `ses`
  (the only fully mutual devDep pair in the workspace).

**Asymmetric "A deps→ B, B devDeps→ A" cycles:**

- `@endo/compartment-mapper` --(deps)--> `ses` AND
  `ses` --(devDeps)--> `@endo/compartment-mapper`.
- `@endo/module-source` --(deps)--> `ses` AND
  `ses` --(devDeps)--> `@endo/module-source`.
- `@endo/test262-runner` --(deps)--> `ses` AND
  `ses` --(devDeps)--> `@endo/test262-runner`.

**Longer cycles, all routed through SES test scaffolding:**

The remaining 14 devDep edges all install one of three modules:

1. `@endo/lockdown/commit-debug.js` (top-of-test SES installer).
2. `@endo/ses-ava` (`prepare-endo.js` or `test.js`, the SES-aware AVA
   wrapper).
3. `@endo/init` (alternative SES installer; transitively pulls
   `lockdown`, `eventual-send`, `harden`, `promise-kit`).

`@endo/ses-ava` itself transitively requires `@endo/init`, which
requires `@endo/eventual-send` and `@endo/lockdown` and `@endo/harden`
and `@endo/promise-kit`.
So any package that adds `@endo/ses-ava` as a devDep silently joins
the SCC.

### Edges that are devDeps but unused at runtime in tests

Spot audit of test files (grep for `import` from each declared devDep)
turns up at least these likely-vestigial entries:

- `@endo/zip` declares `@endo/eventual-send` and `@endo/ses-ava` as
  devDeps; `packages/zip/test/zip.test.js` imports neither (it uses
  `import test from 'ava'` and `node:assert`).
- `@endo/harden` declares `ses` as a devDep, used by three test files
  (`assume-hardened-hardens-in-hardened.test.js` and the two
  `noop-*-lockdown.test.js`) for `import 'ses'` at the top.
  The remaining four tests do not import `ses`.

These are not blockers for the design but reduce the number of edges
that need replacing.

## Synthetic Testing-Package Proposal

The proposal is a one-shot factoring that moves the test scaffolding
that creates each cycle edge into a sink-only package: a package that
declares the upstream subsystems it tests via regular `dependencies`
and on which **no other workspace package depends** (neither as
`dependencies` nor as `devDependencies`).
Sink-only is the load-bearing constraint.
A package downstream of the SCC cannot extend the SCC; that is what
makes it a cycle break.

The repo already has one such package: `@endo/stream-types-test`.
It declares `@endo/stream` as a `dependencies` entry, hosts its
`validation.ts` under that package's own name, and is not itself
depended on by anything else.
This is the shape we generalize.

### Per-cycle cuts

There is no single cut that removes the SCC; the 18 devDep edges
collapse to four families, each handled by a single new package or a
single edge deletion.

#### Cut 1: `@endo/test-ses` (eats 11 edges)

A new package `packages/test-ses/`.
Hosts the SES test files currently in `packages/ses/test/` that need
`@endo/module-source` and the test262 prelude harness driving
`@endo/test262-runner`.

```
packages/test-ses/package.json:
  name: @endo/test-ses
  private: true
  dependencies:
    ses:                        workspace:^
    @endo/module-source:        workspace:^
    @endo/test262-runner:       workspace:^
    @endo/compartment-mapper:   workspace:^
    @endo/evasive-transform:    workspace:^
    @endo/init:                 workspace:^
    @endo/ses-ava:              workspace:^
    @endo/eventual-send:        workspace:^
    @endo/lockdown:             workspace:^
    ava: catalog:dev
```

Files to move:

- `packages/ses/test/{import,import-hook,import-now-hook,
  import-non-esm,import-cjs,module-source,module-map,module-map-hook,
  module-map-hook-legacy,module-map-legacy,import-hook-legacy,
  import-now-hook-legacy,compartment-transforms}.test.js`
  and supporting `_import-commons.js` (13 test files using
  `@endo/module-source`).
- `packages/ses/test262/*.js` (5 files driving `@endo/test262-runner`)
  plus the `test262`/`test262:xs`/`test262:node` scripts in
  `packages/ses/package.json`.
- `packages/ses/scripts/{bundle,generate-test-xs}.js` (the only
  consumers of `@endo/compartment-mapper` outside tests).

This single move retires:

- `ses` --devDep--> `@endo/compartment-mapper`
- `ses` --devDep--> `@endo/module-source`
- `ses` --devDep--> `@endo/test262-runner`
- `@endo/compartment-mapper` --devDep--> `@endo/init`
- `@endo/compartment-mapper` --devDep--> `@endo/evasive-transform`
- `@endo/compartment-mapper` --devDep--> `@endo/ses-ava`
- `@endo/compartment-mapper` --devDep--> `@endo/eventual-send`
- `@endo/evasive-transform` --devDep--> `@endo/ses-ava`
- `@endo/module-source` --devDep--> `@endo/ses-ava`
- `@endo/eventual-send` --devDep--> `@endo/lockdown`
- `@endo/eventual-send` --devDep--> `ses`

The mapping holds because `@endo/test-ses` lives downstream of all
these packages: it imports their public surfaces and runs them, but
nothing in the workspace imports `@endo/test-ses`.

Some of these reductions assume that the existing tests in
`compartment-mapper`, `evasive-transform`, `module-source`, and
`eventual-send` either move into `@endo/test-ses` or are rewritten so
they no longer depend on `@endo/ses-ava`/`@endo/init` (using plain
`ava` plus a `prepare-test-env.js` fixture that imports `'ses'` and
nothing else).
The latter is the smaller diff: only the three `import 'ses'` lines
in `@endo/harden`'s test files and the `@endo/lockdown/commit-debug.js`
import in `@endo/eventual-send`'s test files need to remain, and
neither package then needs `@endo/ses-ava` at all.

If the rewrite-in-place path is preferred, only the SES-internal tests
that genuinely need `@endo/module-source` (the import-hook family)
move into `@endo/test-ses`, and the package's `dependencies` shrink
to just `ses`, `@endo/module-source`, `@endo/compartment-mapper`,
`@endo/test262-runner`, `@endo/init`, and `ava`.

#### Cut 2: `@endo/test-hex` (eats 4 edges)

`@endo/hex` declares four cycle-creating devDeps (`@endo/eventual-send`,
`@endo/init`, `@endo/ses-ava`, `ses`) but its test
(`packages/hex/test/main.test.js`) only uses `@endo/ses-ava/test.js`
plus calls into `@endo/hex`'s own surface.

Two equally cheap options:

- **In-place rewrite.**
  Replace `import test from '@endo/ses-ava/test.js'` with
  `import test from 'ava'` plus a `prepare-test-env.js` fixture that
  does `import 'ses'`.
  Drop the four cycle-creating devDeps; keep only `ses` (since the
  fixture imports it) plus `ava`.
  This still leaves `@endo/hex` --devDep--> `ses` if we keep the SES
  installation; that is one of the thirteen members of the SCC and
  closes the cycle by itself.
  Eliminating it requires the synthetic-package move below.

- **Move to `@endo/test-hex`.**
  Mirror Cut 1: a new sink-only package whose `dependencies` are
  `@endo/hex`, `@endo/ses-ava`, `ses`.
  `@endo/hex/package.json` then has `devDependencies` of just `ava`
  (or even `null`), and the four edges disappear from the SCC.

Recommended: the move, for symmetry with Cut 1 and for the same hash-
correctness benefit (`@endo/hex`'s test cache hash no longer mixes
with the SES test scaffold's hash).

#### Cut 3: `@endo/test-zip` (eats 2 edges) or just delete unused edges

`@endo/zip` declares `@endo/eventual-send` and `@endo/ses-ava` as
devDeps but its test imports neither; it uses plain `ava` and
`node:assert`.

Recommended: delete the two devDep entries.
No new package is needed.

#### Cut 4: `@endo/harden` ses scaffold (eats 1 edge)

`@endo/harden` declares `ses` as a devDep so that three of its tests
can `import 'ses'` to install the SES intrinsics for assume-hardened
checks.

Two options:

- **In-place rewrite.**
  Replace each `import 'ses'` with `import './_lockdown.js'` (the file
  already exists alongside the other tests in `packages/harden/test/`
  for exactly this purpose).
  But `_lockdown.js` itself imports `'ses'`, so this only renames the
  edge.
  Real removal needs the move below.

- **Move to `@endo/test-harden`.**
  A sink-only package whose `dependencies` are `@endo/harden` and
  `ses`.
  Hosts the three `assume-hardened-hardens-in-hardened.test.js`,
  `noop-causes-lockdown-to-throw.test.js`, and
  `noop-freezes-after-lockdown.test.js` files plus the shared
  `_lockdown.js` fixture.
  `@endo/harden/package.json` then has no workspace devDeps at all;
  the four remaining test files use plain `ava` and exercise only
  `@endo/harden` itself.

Recommended: the move; same rationale as Cut 2.

#### Cut 5: pure devDep deletes (mop-up)

After Cuts 1-4, two cycle-creating devDeps remain:

- `@endo/eventual-send` --devDep--> `@endo/lockdown` (lives in
  `commit-debug.js` imports across `e.test.js`,
  `eventual-send.test.js`, `proxy.test.js`, etc.).
  Move the `lockdown/commit-debug.js`-using tests into a new
  `@endo/test-eventual-send` package whose dependencies are
  `@endo/eventual-send`, `@endo/lockdown`, `ava`.
- `@endo/eventual-send` --devDep--> `ses` (transitively pulled by
  `@endo/lockdown`; same fix.)

After this fifth cut every cycle-creating devDep is gone.
The remaining devDeps in the original packages are local linters,
TypeScript, `ava`, and `c8`, none of which create workspace cycles.

### Resulting graph

After all five cuts, the workspace dependency graph consists of:

- The original 13-package SCC, now a clean DAG: `harden` → `ses` →
  `module-source` → `compartment-mapper` → ..., with
  `eventual-send` and `init` flowing into the latter half through
  `harden` and `promise-kit`.
- Five new sink-only packages (`@endo/test-ses`, `@endo/test-hex`,
  `@endo/test-harden`, `@endo/test-eventual-send`, and possibly
  `@endo/test-evasive-transform` if its `_prepare-test-env-ava-fixture.js`
  is treated the same way).
- `@endo/zip` shrunk by deleting two unused devDeps.

Turbo's `--filter='...[origin/llm]'` continues to work; in fact it
becomes more precise, because the synthetic packages are
single-purpose and their `dependencies` faithfully list the
subsystems they exercise.
A change to `@endo/module-source` selects `@endo/test-ses` (and
indirectly the `ses` test runs that live there), but no longer
selects unrelated `@endo/compartment-mapper` consumers, because
`@endo/compartment-mapper` no longer devDepends on the SES test
fixtures.

## Naming Convention

Two candidate schemes; the prompt asks for both.

### Option A: `@endo/test-<subsystem>`

Mirrors the existing `@endo/stream-types-test` precedent (with the
word order reversed to put the role first), keeps every synthetic
package alphabetically grouped under `packages/test-*/`, and reads as
"the test harness for <subsystem>".

Examples:

- `@endo/test-ses` (host: `packages/test-ses/`)
- `@endo/test-hex`
- `@endo/test-harden`
- `@endo/test-eventual-send`

Pro: single-segment, easy to grep, easy to filter from publish
(`packages/test-*` is one glob).
Con: collides aesthetically with the existing `@endo/stream-types-test`
(suffix order); we would either rename that package or accept the
inconsistency.

### Option B: `@endo/<subsystem>-test`

Matches the existing `@endo/stream-types-test` exactly; the suffix
`-test` says "test harness".

Examples:

- `@endo/ses-test`
- `@endo/hex-test`
- `@endo/harden-test`
- `@endo/eventual-send-test`

Pro: zero churn for the existing precedent.
Con: alphabetical sort scatters them across `packages/`; harder to
filter as a glob (`packages/*-test/` works for shells but not for all
yarn workspace patterns).

**Recommendation: Option A**, plus a one-shot rename of
`@endo/stream-types-test` → `@endo/test-stream-types` so the suffix
convention is uniform.
The rename is mechanical (`package.json` name, one `tsconfig` path);
no consumer imports it because it is sink-only.

## Migration Plan

Per cycle, the sequence is the same:

1. Decide whether the cut takes the **move** path or the **delete
   unused devDep** path.
2. For move:
   - `mkdir packages/test-<subsystem>` and add `package.json`,
     `tsconfig.json`, and a `test/` directory.
   - Set `private: true` so `lerna publish` skips it.
   - Set `dependencies` (not `devDependencies`) on every workspace
     subsystem the tests import, and on `ses` and `ava` if used.
   - Move the test files (`git mv`) preserving filenames.
   - Add a `test` script: `ava` (or the same script the source
     package used).
   - Update the source package's `package.json` to drop the
     cycle-creating devDeps and any test scripts that no longer
     apply.
3. For delete-unused: remove the devDep entries, run `yarn install`,
   confirm `yarn lint` and `yarn test` still pass.
4. Add a changeset: `.changeset/break-dev-dep-cycle-<subsystem>.md`
   marking each touched source package as `patch` (the synthetic
   packages are `private` and need no changeset).
5. After all five cuts land, flip `turbo.json` from `dependsOn:
   ["build"]` to `^build` for `test` and `lint`, and update
   `turbo.json.md` to record that the cycle is gone.

The five cuts are independent; they can land in five separate PRs in
any order.
Recommended order (smallest to largest):

| # | Cut | Estimated diff | Synthetic package |
|---|-----|----------------|-------------------|
| 1 | Cut 3 (delete unused `@endo/zip` devDeps) | ~5 lines | none |
| 2 | Cut 4 (`@endo/test-harden`) | ~50 lines | `@endo/test-harden` |
| 3 | Cut 2 (`@endo/test-hex`) | ~30 lines | `@endo/test-hex` |
| 4 | Cut 5 (`@endo/test-eventual-send`) | ~150 lines | `@endo/test-eventual-send` |
| 5 | Cut 1 (`@endo/test-ses`) | ~600 lines | `@endo/test-ses` |
| 6 | turbo.json: switch to `^build` | ~10 lines | none |

After PR 5 the SCC collapses to size 0 in the combined graph; the
final PR makes the change visible to turbo.

## Affected Packages

Modified `package.json` files (devDeps removed): 7 packages.

- `@endo/compartment-mapper`
- `@endo/evasive-transform`
- `@endo/eventual-send`
- `@endo/harden`
- `@endo/hex`
- `@endo/module-source`
- `@endo/ses-ava` (no edits, but it stops being pulled into cycles)
- `@endo/zip`
- `ses`

New synthetic packages: 4-5.

- `@endo/test-ses`
- `@endo/test-hex`
- `@endo/test-harden`
- `@endo/test-eventual-send`
- (optional) `@endo/test-evasive-transform`

Renamed: 1 (only if Option A naming is adopted).

- `@endo/stream-types-test` → `@endo/test-stream-types`.

Estimated effort, by recalibrated size categories
(see `designs/README.md` § "Per-size velocity"):

- Cuts 1, 2, 3 (delete-unused, two small moves): S each, 1 day each.
- Cut 4 (`@endo/test-eventual-send`): S, 1-2 days.
- Cut 5 (`@endo/test-ses`): M, 2-3 days (largest because the file
  count is high and the test262 prelude scripts are nontrivial).
- Final turbo flip + verification: S, 0.5 days.

Total: M-L, ~1.5-2 weeks of focused work spread across five PRs.

## Open Questions

1. **Helper utilities: separate `@endo/test-utils` package, or stay
   in their home with the cycle accepted on a per-helper basis?**

   `@endo/ses-ava`, `@endo/lockdown` (specifically
   `commit-debug.js`), and `@endo/init` are the three test
   scaffolding modules pulled in via cycle-forming devDeps.
   They are not pure test helpers; they are full SES installers and
   AVA wrappers that are also legitimately consumed at runtime by
   downstream packages.
   The synthetic-package approach above moves the *consumers* (the
   tests themselves), not the helpers, which preserves the helpers'
   public surface.
   An alternative is to extract the helpers into a `@endo/test-utils`
   that re-exports `@endo/ses-ava`, but this adds an indirection
   without changing the cycle topology (anyone who depends on
   `@endo/test-utils` would still transitively need `@endo/init`).
   Recommendation: keep helpers in their home, move tests.
   But surface this as a question; the maintainer may prefer the
   indirection for other reasons (e.g., to standardize the
   `prepare-test-env.js` pattern across packages).

2. **How does turborepo know to skip the synthetic packages from
   production builds?**

   Marking each synthetic package `private: true` keeps `lerna
   publish` from publishing it.
   Turbo respects workspace globs; if we keep the synthetic packages
   in `packages/test-*/` we can either (a) leave them in the default
   `packages/*` glob and rely on `private: true` to keep them out of
   release artifacts, or (b) move them to a `test-packages/*` glob
   that is excluded from the `viable-release` job.
   Option (a) is simpler and is what the existing
   `@endo/stream-types-test` does.
   The remaining concern is `viable-release`: it should already skip
   `private: true` packages, but we should confirm before landing.

3. **Should existing integration tests be REWRITTEN (rather than just
   moved) to use only public APIs of the tested subsystems, since the
   synthetic package can't access internals?**

   The tests targeted by Cut 1 already use only public APIs of `ses`
   and `@endo/module-source` (they import `ModuleSource` from the
   package's main export, not from `src/`).
   Spot-checking the other cuts, none import from `../src/`; they all
   import from the package main.
   So the move is mechanical: file path changes, but no API surface
   changes.
   If a test does turn out to import from `../src/`, the right fix is
   to expose the helper as a subpath export from the source package
   (e.g., `@endo/foo/internal-test-helpers.js`) rather than to inline
   the helper into the synthetic package.
   This keeps a single source of truth for the helper.

4. **Does the in-package `dependsOn: ["build"]` workaround in
   `turbo.json` go away once the cycle is broken?**

   Yes; the future-cleanup section of `turbo.json.md` lists exactly
   this as future option (1).
   The final PR in the migration plan above flips
   `dependsOn: ["build"]` to `^build` for both `test` and `lint`.
   At that point the per-task hash includes upstream packages'
   `build` hashes, which is the stronger correctness invariant the
   maintainer prefers.

5. **What about the `@endo/test-ses` test262 scripts?**

   `packages/ses/package.json` has a `test262`, `test262:xs`, and
   `test262:node` script that calls `test262-harness` against
   generated preludes.
   These need to move to `@endo/test-ses` along with the
   `test262/*.js` source files.
   The scripts should be runnable from the new location with the
   same arguments; spot-check during Cut 5 implementation.

6. **Inconsistent existing precedent: rename
   `@endo/stream-types-test` or grandfather it in?**

   See "Naming Convention" above.
   This is a maintainer preference call; either is defensible.
   Recommendation: rename, for one-time consistency cost vs.
   permanent split convention.

## Future Work

Once the cycles are broken and turbo is configured for `^build`,
several follow-ups become attractive:

- Remove the multi-paragraph "Why not `^build`?" section from
  `turbo.json.md` and replace it with a one-paragraph note recording
  the historical rationale.
- Re-evaluate whether `@endo/stream-types-test` should also be
  renamed to `@endo/test-stream-types` (only if Option A is adopted).
- Audit the rest of the workspace (the 52 packages outside the SCC)
  for less-impactful devDep edges that could be dropped opportunistically.
  None of those edges form cycles today, but the same rewrite hygiene
  (use plain `ava` plus a local `prepare-test-env.js` fixture) keeps
  the dep graph stable as the workspace grows.
- Land the upstream `dependencyTypes` flag in turborepo (turbo.json.md
  future option 2) as a defense-in-depth so a future cycle does not
  silently regress the `^build` configuration.

## References

- PR #121: `feat(ci): adopt turborepo for affected-set test runs`.
- Issue #116: `Frugal use of CI` (closed; PR #121 implements).
- `packages/turbo.json` and `packages/turbo.json.md` on the PR #121
  branch (the rationale for the in-package `dependsOn` form).
- `packages/stream-types-test/` (the existing sink-only test package
  precedent).
- vercel/turborepo issues #675, #796, #9253 (closed feature
  requests for `dependencyTypes` traversal restriction).
