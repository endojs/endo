# Intra-Package Plain Re-Exports

| | |
|---|---|
| **Created** | 2026-06-26 |
| **Updated** | 2026-06-30 |
| **Author** | Mark S. Miller (prompted) |
| **Status** | Not Started |
| **Source** | endojs/endo-but-for-bots#543 (intra-package follow-up comment) |

## Summary

Issue #543 establishes a rule for *cross-package* imports, articulated in the
inter-package design (#548):
a name should be imported from the package that originally exports it,
never from another package that merely re-exports it unchanged.
That work calls such a pass-through a **plain re-export**:
a re-export that does not rename and adds no value to an importer over
importing the name from its originally-exporting module.

The maintainer's follow-up on #543 observes that the same rationale applies
*among modules within a single package*, and asks for that work as a separate,
decoupled pull request.
This design is that separate articulation.
It states the intra-package rule, gives its rationale, and lays out its staging.
Because an intra-package removal never crosses a package boundary, it causes
none of the inter-package (and inter-repo) compatibility problems that the
inter-package design (#548) has to stage around: this design needs no
deprecation step and no version bump, and #548's two mechanical stages collapse
into a single repoint-and-remove pass.

## The rule

> Within a package, import a name from the module that originally defines and
> exports it, not from a sibling module that plain-re-exports it.

A **plain re-export** here is the intra-package analog of the #543 definition:
a module-level `export { name } from './other.js'` (or `export *`) that does not
rename `name` and adds nothing an importer could not get by importing `name`
straight from `./other.js`.

The rule has two corollaries that the removal pass will act on:

1. **Internal modules should not reach back through the package's own declared
   exports.** A module inside package `P` that writes
   `import { name } from './index.js'` (or `'../index.js'`, or any other module
   the package's `package.json` `"exports"` map names) is importing through the
   package's own public surface rather than from the defining module. It should
   import `name` from the module that defines it. The declared-export entry stays
   for external importers; the change is only that `P`'s own modules stop routing
   through it.

2. **A module that exists only to re-bundle sibling exports, and is not itself
   part of the package's public API surface, is the intra-package analog of
   `@endo/far`.** If `./convenience.js` only re-exports names that other modules
   in the same package already export, adds no value of its own, and is not
   reachable through the package's `package.json` `"exports"` map (see *What the
   rule does not touch*), it is a candidate for removal once its importers are
   repointed at the defining modules. A pass-through module that *is* a declared
   export is public API and stays, even when it only re-exports siblings.

### What the rule does *not* touch

The package's **public API surface** is everything listed in its `package.json`
`"exports"` map, not only a single entry barrel. A package may declare several
subpath exports (`"."`, `"./reader"`, `"./writer"`, and so on), and each entry
names a module that external importers are entitled to import from. The common
case is one main `"."` entry pointed at `src/index.js`, but `src/index.js` is
just the most frequent instance of the surface, not its definition: the surface
is the whole `"exports"` map.

Every module reachable through that map is a deliberate, value-adding API
surface. That holds even when such a module is *itself* a plain re-export of a
sibling: from outside the package there is nowhere else to import that name
from, so the re-export is the canonical public location, not a removable
pass-through. A name that an external importer reaches through the `"exports"`
map must keep a stable import path there; the staging below never removes a
re-export that backs a declared export.

This rule is therefore about *intra-package* import edges only: a package's
*own* modules should import from each other directly rather than through the
package's declared-export entries or through internal pass-through modules that
no `"exports"` entry names. The public surface (every module the `"exports"` map
reaches) stays exactly as declared.

## Rationale

The rationale is #543's, re-read at module granularity.

- **Tooling disambiguation.**
  When an IDE or an AI assistant sees a use-occurrence of a name that must be
  imported, and two modules in the same package both export it (the definer and
  a plain re-exporter), the tool faces a pointless choice of import source.
  It either guesses, often poorly, or interrupts the author to choose.
  A single canonical source per name removes the choice.

- **Smaller bundles and tighter module graphs.**
  Importing through a re-exporter can pull the re-exporting module (and whatever
  else it references) into a bundle that a direct import would have left out.
  Direct imports keep the module dependency graph minimal and honest.

- **Readable layering.**
  A clean import list tacitly documents the actual layering of concepts inside
  the package.
  When every import names the module that owns the concept, a reader learns the
  package's internal structure from its imports.

## Relationship to the inter-package design (#548)

This work is **decoupled** from the inter-package design (#548) and its
mechanical follow-up, the two cross-package PRs requested in #543, and can land
independently.
It shares #543's vocabulary (*plain re-export*), but it operates entirely inside
package boundaries, so it neither blocks nor depends on the cross-package rule.

The two designs differ in staging, and the difference is the point. The
inter-package design (#548) sequences its mechanical work into two PRs by
compatibility risk: a first PR that repoints importers and **deprecates** the
plain re-exports without removing them, then a later removal PR that bumps the
**major version** of every affected package, because removing a cross-package
re-export can break an importer in another repository that has not yet been
repointed. An intra-package pass-through is never part of a package's published
surface (see *What the rule does not touch*), so no importer in any other
repository can depend on it. Removing one therefore causes no inter-repo
compatibility problem, which is why this design needs neither #548's deprecation
step nor its version bump, and why its mechanical work is a single
repoint-and-remove pass rather than #548's two staged PRs.

Where the inter-package design (#548) amends an endo style guide to state the
cross-package rule, the intra-package rule is stated in this design and as a
`Coding Style` entry in `CONTRIBUTING.md` so that new intra-package importers are
discouraged from the start.

## Staging

The intra-package work is two PRs, a rule PR (this one) and a mechanical
follow-up, but only because keeping the design review separate from broad,
mechanical churn is convenient, not because compatibility forces a split. Unlike
the inter-package design (#548), the mechanical work itself is a single pass:
because an intra-package pass-through is never externally importable, repointing
and removal land together, with no deprecation buffer and no version bump.

1. **This PR — articulate and discourage (no behavior change).**
   Land this design and the `CONTRIBUTING.md` `Coding Style` entry.
   No source modules move yet.
   This establishes the rule and gives reviewers a single place to discuss it
   before any mechanical churn.

2. **Follow-up PR — repoint and remove, in one mechanical pass.**
   Per package, repoint intra-package importers at the defining module and, in
   the same change, delete the pass-through modules that thereby become
   unreferenced. There is no separate deprecation stage and no version bump:
   removing a module that no `"exports"` entry reaches cannot break any external
   importer, so #548's two-stage, major-bump sequencing does not apply here.
   The pass is deliberately kept separate from this rule PR only because it is
   broad, mechanical, and reviewed most easily one package at a time.

Because the removal touches nothing an external importer can reach, it carries
no inter-repo compatibility hazard, so, unlike the inter-package design's (#548)
removal stage, its content may be merged into `endojs/endo` as soon as it is
ready and approved, with no deferral to a major release. The only correctness
obligation is the local one the mechanical pass already discharges: before
deleting a pass-through module, confirm that no module *inside its own package*
still imports through it.

## Examples in the current tree

These are illustrative starting points for the follow-up removal pass, not an
exhaustive inventory.

- `packages/evasive-transform/src/visitor.js` is a near-pure intra-package
  re-exporter: its only export is
  `export { makeEvasiveTransformVisitor } from './transform-ast.js'`.
  The removal pass first checks whether the package's `package.json` `"exports"`
  map reaches this module; if it does, the module is public API and stays. If it
  does not, its module comment still carries documentation value — which means
  the re-export is not *plain* by this design's definition, because it adds
  something an importer could not get by importing straight from
  `./transform-ast.js`. Such a re-export is kept as a documented seam. Any further
  refinement of a kept seam — for example relocating its documentation so the seam
  could then be retired — is a case-by-case judgment left to a later PR, not this
  rule PR or its mechanical follow-up.

- Declared-export reach-back: modules that import from one of their own package's
  `package.json` `"exports"` entries (for values or for `@import` types) rather
  than from the defining sibling. The barrel `./index.js` is only the most common
  such entry; the case is general over every module the `"exports"` map reaches,
  not just the entry barrel. `packages/genie/src/agent/tool-gate.js` reaches back
  to `./index.js` for a type import; the repoint targets the module that defines
  the type. Only the importer's edge moves: the declared-export module it reached
  through is public API, so it stays unchanged and undeprecated (see *What the rule
  does not touch*) — the removal pass never touches, deprecates, or repoints any
  module the `"exports"` map names.

The follow-up PR enumerates these mechanically, package by package.

## Open questions

- **`export *` aggregators.**
  Some intra-package barrels use `export *` rather than named re-exports.
  The removal pass treats a non-renaming `export *` from a sibling as a plain
  re-export for the corollary-1 reach-back case, but an `export *` in any module
  the package's `package.json` `"exports"` map reaches is part of the API surface
  and is out of scope (see *What the rule does not touch*).

- **Type-only re-exports.**
  A re-export used purely for `@import` types has the same ambiguity cost for
  tooling as a value re-export and is in scope, but the repoint is type-position
  only and never changes runtime bundling.
