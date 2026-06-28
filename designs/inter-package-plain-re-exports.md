# Inter-Package Plain Re-Exports

| | |
|---|---|
| **Created** | 2026-06-27 |
| **Author** | Mark S. Miller (prompted) |
| **Status** | Not Started |
| **Source** | endojs/endo-but-for-bots#543 |

## Summary

Issue #543 establishes a rule for *cross-package* imports:
a name should be imported from the package that originally exports it,
never from another package that merely re-exports it unchanged.
That issue calls such a pass-through a **plain re-export**:
a re-export that does not rename and adds no value to an importer over
importing the name from its originally-exporting package.

This design is the articulation of that cross-package (inter-package) rule.
It states the rule, gives its rationale, and lays out the staging that #543
describes: repoint importers and deprecate the plain re-exports first, then
remove the now-unreferenced re-exports later.
It is the inter-package companion to the intra-package design in #544, which
applies the same rationale among modules within a single package.

## The rule

> Import a name from the package that originally defines and exports it, not
> from another package that plain-re-exports it.

A **plain re-export** is a package-level `export { name } from 'other-package'`
(or `export *`) that does not rename `name` and adds nothing an importer could
not get by importing `name` straight from the originally-exporting package.

The canonical example is `@endo/far`, a package that exists only for the
convenience of re-exporting names that originate in other packages.
Such packages were a real convenience back when much code was written in
pre-IDE editors where remembering and typing the originating package name was a
cost.
Today, with IDEs and AI assistance, a plain re-exporter is an *anti*-convenience:
it presents tooling and authors with a pointless choice of which package to
import a name from.

## Rationale

- **Tooling disambiguation.**
  When an IDE or an AI assistant sees a use-occurrence of a name that must be
  imported, and two packages both export it (the originating package and a plain
  re-exporter), the tool faces a pointless choice of import source.
  It either guesses, often poorly, or interrupts the author to choose.
  A single canonical source per name removes the choice.
  This does not suppress genuine collisions, where two packages are each the
  original exporter of the same name meaning two different things.
  After the removal pass, the only choices an IDE presents are these real ones,
  and the meaning of the remaining choices becomes clearer because the pointless
  ones are gone.

- **Smaller bundles.**
  Importing through a re-exporter can pull the re-exporting package (and whatever
  else it references) into a bundle that a direct import would have left out.
  Direct imports keep the dependency graph minimal and honest.

- **Readable layering.**
  A clean import list tacitly documents the actual layering of concepts across
  packages.
  When every import names the package that owns the concept, a reader is
  reminded of the real layering rather than the historical convenience surface.

## Staging

Per #543, the implementation is split into two pull requests, sequenced by
compatibility risk: the non-breaking work goes first, the breaking work later.

1. **First PR — repoint and deprecate (no compatibility problems).**
   Repoint every cross-package importer at the package that originally exports
   the name, and deprecate all plain re-exports.
   This goes first precisely because it causes no compatibility problems: the
   plain re-exports still exist, so any importer that has not yet been repointed
   (including importers outside this repository) keeps working, while every
   importer inside the repository moves to the canonical source.
   The deprecations discourage the introduction of new importers that depend on
   the plain re-exports.

2. **Follow-up PR — remove (deferred until repointing is complete).**
   Remove the now-unreferenced plain re-exports.
   This comes later because removal potentially introduces compatibility
   problems with importers outside this repository that still depend on a plain
   re-export and have not yet been repointed.
   It is also broad and mechanical, and reviewed most easily a slice at a time.

This design PR precedes both: it lands this design and an endo style-guide entry
(a `CONTRIBUTING.md` `Coding Style` rule) stating the rule, so new importers are
discouraged from violating it and reviewers have a single place to discuss the
rule and its staging before any mechanical churn.

Because this is `endojs/endo-but-for-bots`, the stages may be merged here once
ready and approved.
As with #543's second PR, the removal stage must not be merged into
`endojs/endo` until we are adequately confident there are no outstanding
importers that depend on a cross-package plain re-export, in this repository or
in others.

## Relationship to the intra-package design (#544)

This inter-package rule and the intra-package rule in #544 share #543's
vocabulary (*plain re-export*) and the same staging shape (repoint and deprecate
first, then remove), but they operate at different granularities and are
decoupled:

- This design governs import *edges between packages*: the unit removed is a
  package (or package export) that exists only to re-export another package's
  names.
- The #544 design governs import *edges between modules within one package*: the
  unit removed is an internal pass-through module or a barrel reach-back.

Neither blocks nor depends on the other; they can land and be reviewed
independently.

## Examples in the current tree

These are illustrative starting points for the repointing and removal work, not
an exhaustive inventory.

- `@endo/far` is the canonical plain re-exporter: the issue cites it as a
  package that exists only for the convenience of re-exporting names that
  originate elsewhere.
  The first PR repoints its importers at the originating packages; the removal
  pass then decides, per export, whether the re-export carries any residual
  value before removing it.

The implementation enumerates these mechanically, package by package.

## Open questions

- **`export *` aggregators.**
  Some packages re-export with `export *` rather than named re-exports.
  The implementation treats a non-renaming cross-package `export *` as a plain
  re-export, but a package whose entire purpose is a curated, value-adding
  aggregate surface is a judgment call made per package.

- **Type-only re-exports.**
  A cross-package re-export used purely for `@import` types has the same
  ambiguity cost for tooling as a value re-export and is in scope, but the
  repoint is type-position only and never changes runtime bundling.

- **Deprecation mechanism.**
  How a plain re-export is *deprecated* in the first PR (a `@deprecated` JSDoc
  tag on the re-export, a lint rule, or both) is settled when this design is
  approved, before the deprecations land.
