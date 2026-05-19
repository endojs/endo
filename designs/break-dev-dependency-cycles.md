# Break devDependency Cycles via Synthetic Test Packages

| | |
|---|---|
| **Created** | 2026-05-11 |
| **Updated** | 2026-05-18 |
| **Author** | Kris Kowal (prompted) |
| **Status** | In Progress |
| **Refs** | [PR #121](https://github.com/endojs/endo-but-for-bots/pull/121), [Issue #116](https://github.com/endojs/endo-but-for-bots/issues/116) |

## Status

Design merged via PR
[#206](https://github.com/endojs/endo-but-for-bots/pull/206). The
per-package cuts are partially landed on `llm`:

- **Cut 2** (`@endo/hex` + `@endo/hex-test`) — merged via PR
  [#211](https://github.com/endojs/endo-but-for-bots/pull/211).
- **Cut 3** (`@endo/zip` cleanup) — merged via PR
  [#209](https://github.com/endojs/endo-but-for-bots/pull/209).
- **Cut 4** (`@endo/harden` + `@endo/harden-test`) — merged via PR
  [#210](https://github.com/endojs/endo-but-for-bots/pull/210).
- **Cut 5** (`@endo/eventual-send` + `@endo/eventual-send-test`) —
  merged via PR
  [#247](https://github.com/endojs/endo-but-for-bots/pull/247).
- **Cut 1** (`ses` + `@endo/ses-test`) — open as PR
  [#261](https://github.com/endojs/endo-but-for-bots/pull/261).

An upstream mirror covering the same factoring for `endojs/endo`
master is staged as PR
[#235](https://github.com/endojs/endo-but-for-bots/pull/235).

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

#### Cut 1: `@endo/ses-test` (eats 11 edges)

A new package `packages/ses-test/`.
Hosts the SES test files currently in `packages/ses/test/` that need
`@endo/module-source` and the test262 prelude harness driving
`@endo/test262-runner`.

```
packages/ses-test/package.json:
  name: @endo/ses-test
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

The mapping holds because `@endo/ses-test` lives downstream of all
these packages: it imports their public surfaces and runs them, but
nothing in the workspace imports `@endo/ses-test`.

Some of these reductions assume that the existing tests in
`compartment-mapper`, `evasive-transform`, `module-source`, and
`eventual-send` either move into `@endo/ses-test` or are rewritten so
they no longer depend on `@endo/ses-ava`/`@endo/init` (using plain
`ava` plus a `prepare-test-env.js` fixture that imports `'ses'` and
nothing else).
The latter is the smaller diff: only the three `import 'ses'` lines
in `@endo/harden`'s test files and the `@endo/lockdown/commit-debug.js`
import in `@endo/eventual-send`'s test files need to remain, and
neither package then needs `@endo/ses-ava` at all.

If the rewrite-in-place path is preferred, only the SES-internal tests
that genuinely need `@endo/module-source` (the import-hook family)
move into `@endo/ses-test`, and the package's `dependencies` shrink
to just `ses`, `@endo/module-source`, `@endo/compartment-mapper`,
`@endo/test262-runner`, `@endo/init`, and `ava`.

#### Cut 2: `@endo/hex-test` (eats 4 edges)

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

- **Move to `@endo/hex-test`.**
  Mirror Cut 1: a new sink-only package whose `dependencies` are
  `@endo/hex`, `@endo/ses-ava`, `ses`.
  `@endo/hex/package.json` then has `devDependencies` of just `ava`
  (or even `null`), and the four edges disappear from the SCC.

Decision: the move, for symmetry with Cut 1 and for the same hash-
correctness benefit (`@endo/hex`'s test cache hash no longer mixes
with the SES test scaffold's hash).
The in-place rewrite is preserved above as a "considered" path: it
still leaves `@endo/hex` --devDep--> `ses` (one of the thirteen SCC
members), so the move is the only path that fully cuts the edges.

#### Cut 3: delete unused `@endo/zip` devDeps

`@endo/zip` declares `@endo/eventual-send` and `@endo/ses-ava` as
devDeps but its test imports neither; it uses plain `ava` and
`node:assert`.

Decision: delete the two devDep entries.
No new package is needed.
Settled per kriskowal review (PR #206
[#discussion_r3216061413](https://github.com/endojs/endo-but-for-bots/pull/206#discussion_r3216061413)).

#### Cut 4: `@endo/harden` ses scaffold (eats 1 edge)

`@endo/harden` declares `ses` as a devDep so that three of its tests
can `import 'ses'` to install the SES intrinsics for assume-hardened
checks.

Decision: move to `@endo/harden-test`.
A sink-only package whose `dependencies` are `@endo/harden` and `ses`.
Hosts the three `assume-hardened-hardens-in-hardened.test.js`,
`noop-causes-lockdown-to-throw.test.js`, and
`noop-freezes-after-lockdown.test.js` files plus the shared
`_lockdown.js` fixture.
`@endo/harden/package.json` then has no workspace devDeps at all; the
four remaining test files use plain `ava` and exercise only
`@endo/harden` itself.
Settled per kriskowal review (PR #206
[#discussion_r3216063693](https://github.com/endojs/endo-but-for-bots/pull/206#discussion_r3216063693));
same rationale as Cut 2.

Considered and rejected: an in-place rewrite that replaces each
`import 'ses'` with `import './_lockdown.js'` (the file already
exists alongside the other tests in `packages/harden/test/`).
`_lockdown.js` itself imports `'ses'`, so this only renames the
edge rather than cutting it.
Per kriskowal review (PR #206
[#discussion_r3216062975](https://github.com/endojs/endo-but-for-bots/pull/206#discussion_r3216062975)),
this is "an illusion of an option" and is dropped from the proposal.

#### Cut 5: pure devDep deletes (mop-up)

After Cuts 1-4, two cycle-creating devDeps remain:

- `@endo/eventual-send` --devDep--> `@endo/lockdown` (lives in
  `commit-debug.js` imports across `e.test.js`,
  `eventual-send.test.js`, `proxy.test.js`, etc.).
  Move the `lockdown/commit-debug.js`-using tests into a new
  `@endo/eventual-send-test` package whose dependencies are
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
- Five new sink-only packages (`@endo/ses-test`, `@endo/hex-test`,
  `@endo/harden-test`, `@endo/eventual-send-test`, and possibly
  `@endo/evasive-transform-test` if its `_prepare-test-env-ava-fixture.js`
  is treated the same way).
- `@endo/zip` shrunk by deleting two unused devDeps.

Turbo's `--filter='...[origin/llm]'` continues to work; in fact it
becomes more precise, because the synthetic packages are
single-purpose and their `dependencies` faithfully list the
subsystems they exercise.
A change to `@endo/module-source` selects `@endo/ses-test` (and
indirectly the `ses` test runs that live there), but no longer
selects unrelated `@endo/compartment-mapper` consumers, because
`@endo/compartment-mapper` no longer devDepends on the SES test
fixtures.

## Naming Convention

### Decision: Option B `@endo/<subsystem>-test`

Adopted per kriskowal review (PR #206
[#discussion_r3216068126](https://github.com/endojs/endo-but-for-bots/pull/206#discussion_r3216068126)):
"I prefer this option on the grounds that the package and its test
package will be adjacent in the list."

The suffix `-test` says "test harness" and matches the existing
`@endo/stream-types-test` precedent exactly, so no rename of that
package is needed.
Each synthetic package sorts immediately after the package it tests
(both in `packages/` directory listings and in alphabetical
`package.json` lookups), which makes it easy to find the test
package next to its subject.

Examples:

- `@endo/ses-test` (host: `packages/ses-test/`)
- `@endo/hex-test`
- `@endo/harden-test`
- `@endo/eventual-send-test`

Filter glob for the synthetic packages: `packages/*-test/` (shell
glob) or the explicit yarn workspace pattern.
Per the L508 directive (see Resolved Decisions), turborepo is not
being used for publishing today, so a publish-skip glob is not
in scope for this design; sink-only `private: true` is the only
required marker.

### Considered: Option A `@endo/test-<subsystem>`

Considered and rejected.
Option A used the form `@endo/test-ses`, `@endo/test-hex`, etc., which
groups all synthetic packages alphabetically under `packages/test-*/`.
Option A loses the adjacency property kriskowal preferred (a package
and its test package would have been separated in the alphabetical
list by every other source package), and would have required a
one-shot rename of the existing `@endo/stream-types-test`.
Dropped per the review cited above.

## Migration Plan

The implementation work for every cut targets `endojs/endo` `master`
(the upstream repo, not this `endo-but-for-bots` fork). This design
lives in the bot fork, but the synthetic-test-package factoring
itself is upstream code that consumers of `@endo/*` will see. The
cuts ship as PRs against `endojs/endo` `master`; this design's PR
on the bot fork is the planning artifact that the upstream-PR work
references.

Per cycle, the sequence is the same:

1. Decide whether the cut takes the **move** path or the **delete
   unused devDep** path.
2. For move:
   - `mkdir packages/<subsystem>-test` and add `package.json`,
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
| 2 | Cut 4 (`@endo/harden-test`) | ~50 lines | `@endo/harden-test` |
| 3 | Cut 2 (`@endo/hex-test`) | ~30 lines | `@endo/hex-test` |
| 4 | Cut 5 (`@endo/eventual-send-test`) | ~150 lines | `@endo/eventual-send-test` |
| 5 | Cut 1 (`@endo/ses-test`) | ~600 lines | `@endo/ses-test` |
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

- `@endo/ses-test`
- `@endo/hex-test`
- `@endo/harden-test`
- `@endo/eventual-send-test`
- (optional) `@endo/evasive-transform-test`

Renamed: 0.
Option B `@endo/<subsystem>-test` matches the existing
`@endo/stream-types-test` precedent, so no rename of that
package is required.

Estimated effort, by recalibrated size categories
(see `designs/README.md` § "Per-size velocity"):

- Cuts 1, 2, 3 (delete-unused, two small moves): S each, 1 day each.
- Cut 4 (`@endo/eventual-send-test`): S, 1-2 days.
- Cut 5 (`@endo/ses-test`): M, 2-3 days (largest because the file
  count is high and the test262 prelude scripts are nontrivial).
- Final turbo flip + verification: S, 0.5 days.

Total: M-L, ~1.5-2 weeks of focused work spread across five PRs.

## Resolved Decisions

The questions below were Open Questions in the initial draft.
Each is now settled by maintainer review on PR #206; the citation
links the inline that fixed it.

### Helper utilities: no `@endo/test-utils` package

RESOLVED per kriskowal review (PR #206
[#discussion_r3216069924](https://github.com/endojs/endo-but-for-bots/pull/206#discussion_r3216069924)):
"I'm fine with duplication where necessary to avoid a utils package."

`@endo/ses-ava`, `@endo/lockdown` (specifically `commit-debug.js`),
and `@endo/init` are the three test scaffolding modules pulled in via
cycle-forming devDeps.
They are not pure test helpers; they are full SES installers and AVA
wrappers that are also legitimately consumed at runtime by downstream
packages.
The synthetic-package approach moves the *consumers* (the tests
themselves), not the helpers, which preserves the helpers' public
surface.
Each `<subsystem>-test` package keeps its own copy of any small
fixture it needs (such as a `prepare-test-env.js` shim or a local
`_lockdown.js`); duplication is preferred over introducing an
indirection package that would itself need to depend on `@endo/init`
and reintroduce the cycle.

### Internal-only test surfaces: use the `test` exports condition

RESOLVED per kriskowal review (PR #206
[#discussion_r3216077342](https://github.com/endojs/endo-but-for-bots/pull/206#discussion_r3216077342)).

Tests in a separate `<subsystem>-test` package should use **only the
public interface** of the subsystem under test wherever possible.
A spot-check shows that the tests targeted by every cut import from
the package main (e.g., `import { ModuleSource } from
'@endo/module-source'`), not from `../src/`, so most moves are
mechanical: file path changes only, no API surface changes.

When a test genuinely needs an internal surface that is awkward to
add to the public API, expose it as a subpath export from the source
package guarded by the `test` condition in `package.json`'s
`exports` field.
The condition makes the subpath visible only to consumers that
resolve with `--conditions=test`, so the surface stays invisible to
ordinary consumers and to bundlers.

Best practice: name the test-conditioned subpaths after their
filesystem location and expose them through a single subpath-pattern
entry rather than one entry per file. **Name the condition after the
package** (e.g. `test-endo-foo`), not the bare `test`. A
package-specific condition preserves visibility into which
internals the test surface relies on; a bare `test` shared across
every package would degenerate into "internal access from any
test-mode caller", erasing the public-interface unreachability the
pattern is meant to enforce.

Sketch:

```json
{
  "name": "@endo/foo",
  "exports": {
    ".": "./src/index.js",
    "./src/*": {
      "test-endo-foo": "./src/*"
    }
  }
}
```

The `<subsystem>-test` package then imports
`'@endo/foo/src/internal-test-helpers.js'` and runs ava with the
`test-endo-foo` condition active.

Two benefits follow from naming the subpath after its on-disk
location:

- The literal-path form works in environments that do not honor the
  `exports` directive at all.
  The path is just the package's filesystem layout, so a consumer
  that bypasses Node's resolver (a bundler reading files directly,
  for example) sees the same file at the same location.
- One subpath-pattern entry replaces N per-file entries, so adding
  another internal-test surface is a no-op in `package.json`.

This requires threading the `test` condition into the ava invocation
for every synthetic test package.
ava reads conditions from Node's resolver, so the practical knob is
either:

- a per-package `ava` config that sets
  `nodeArguments: ['--conditions=test']`; or
- the `test` script invokes `node --conditions=test ./node_modules/.bin/ava`
  (or the `ava` CLI through `node --conditions=test`).

Either form is local to the synthetic test package and does not leak
into the source package's own scripts.
Captured as a follow-up: pick one form and apply it uniformly across
the new packages when Cut 1 lands.

If the `test` condition mechanism turns out to be impractical (for
example because a test needs to interleave production and
test-conditioned imports in the same Node process), the fallback is
the duplicate-the-fixture rule from the previous decision.

### `@endo/zip` cleanup: delete the unused devDeps

RESOLVED per kriskowal review (PR #206
[#discussion_r3216061413](https://github.com/endojs/endo-but-for-bots/pull/206#discussion_r3216061413)).
See Cut 3 above; no synthetic package is needed.

### Cut 4 (`@endo/harden`): take the `@endo/harden-test` move

RESOLVED per kriskowal review (PR #206
[#discussion_r3216063693](https://github.com/endojs/endo-but-for-bots/pull/206#discussion_r3216063693)).
See Cut 4 above; the in-place rewrite was rejected as "an illusion
of an option" (the proposed `_lockdown.js` shim itself imports
`'ses'`, so the edge would be renamed rather than cut).

### Naming convention: Option B `@endo/<subsystem>-test`

RESOLVED per kriskowal review (PR #206
[#discussion_r3216068126](https://github.com/endojs/endo-but-for-bots/pull/206#discussion_r3216068126)).
See "Naming Convention" above.
The package and its test package now sort adjacent in alphabetical
listings, and the existing `@endo/stream-types-test` precedent is
preserved without rename.
Closes the prior "rename precedent" question (PR #206
[#discussion_r3216079006](https://github.com/endojs/endo-but-for-bots/pull/206#discussion_r3216079006),
"Answered above").

### Cut 5 test262 scripts: move with the test files

RESOLVED per kriskowal review (PR #206
[#discussion_r3216078513](https://github.com/endojs/endo-but-for-bots/pull/206#discussion_r3216078513),
"Fine.").

`packages/ses/package.json` has `test262`, `test262:xs`, and
`test262:node` scripts that call `test262-harness` against generated
preludes.
These move to `@endo/ses-test` along with the `test262/*.js` source
files.
The scripts should be runnable from the new location with the same
arguments; spot-check during Cut 5 implementation.

### `dependsOn: ["build"]` workaround retires once the cycle is broken

Self-resolving: the future-cleanup section of `turbo.json.md` already
lists this as future option (1).
The final PR in the migration plan flips `dependsOn: ["build"]` to
`^build` for both `test` and `lint`.
At that point the per-task hash includes upstream packages' `build`
hashes, which is the stronger correctness invariant the maintainer
prefers.

## Deferred

### Turborepo and publish-skip globs

DEFERRED as out of scope per kriskowal review (PR #206
[#discussion_r3216072923](https://github.com/endojs/endo-but-for-bots/pull/206#discussion_r3216072923)):
"We are seeking to use turborepo for test expedition.
We haven't considered using it for publishing yet."

The synthetic packages are marked `private: true`, which is what
keeps `lerna publish` from publishing them; that is the only
publish-side marker required by this design.
Whether turborepo's workspace globs eventually need to filter out
`packages/*-test/` from a future publish pipeline is a separate
question to revisit when (and if) turborepo takes on a publishing
role.
For now, leaving the synthetic packages in the default `packages/*`
glob and relying on `private: true` matches what the existing
`@endo/stream-types-test` does.

## Open Questions

No open questions remain after the kriskowal review on PR #206.
New questions that arise during implementation should be filed
against the per-cut PR or recorded in this design's revision
history.

## Future Work

Once the cycles are broken and turbo is configured for `^build`,
several follow-ups become attractive:

- Remove the multi-paragraph "Why not `^build`?" section from
  `turbo.json.md` and replace it with a one-paragraph note recording
  the historical rationale.
- Pick the `--conditions=test` threading form (per-package ava
  `nodeArguments` config vs. wrapping the `test` script in
  `node --conditions=test`) and apply it uniformly across the new
  `@endo/<subsystem>-test` packages, the first time a synthetic
  package needs an internal-only test surface.
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
