---
'@endo/far': patch
---

Deprecate `@endo/far`'s plain re-exports and repoint every in-repository
consumer at the packages that originally export those names, per the
inter-package plain re-exports design (`designs/inter-package-plain-re-exports.md`,
endojs/endo-but-for-bots#548, endojs/endo-but-for-bots#543).

`@endo/far` is the canonical *plain re-exporter*: it exists only to re-export
`E` (from `@endo/eventual-send`), `Far` / `getInterfaceOf` / `passStyleOf`
(from `@endo/pass-style`), and the `FarRef` / `ERef` / `EOnly` / `EReturn` /
`EResult` types (from `@endo/eventual-send`) without renaming or adding value.
Each such re-export now carries an `@deprecated` JSDoc tag pointing at the
originating package.

This is the non-breaking first stage: the re-exports still exist, so any
importer that has not yet been repointed (including importers outside this
repository) keeps working. No name's runtime binding changes, so no consumer
package is version-bumped; only `@endo/far` takes a patch for the added
deprecation notices. The follow-up stage removes the now-unreferenced
re-exports under a major version bump.
