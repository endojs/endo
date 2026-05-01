---
'@endo/marshal': minor
'@endo/patterns': patch
---

Add `compareRankRemotablesTied` and `compareAntiRankRemotablesTied`,
which behave like `compareRank` and `compareAntiRank` except that they
treat all remotables as tied for the same rank instead of short-circuiting
the comparison on encountering a remotable.  Make the `compare` parameter
optional on `isRankSorted`, `assertRankSorted`, `sortByRank`,
`getIndexCover`, `unionRankCovers`, and `intersectRankCovers`,
defaulting to `compareRankRemotablesTied`.

The following parameter orders change so the optional comparator lands
at the end:

- `getIndexCover(sorted, compare, rankCover)` →
  `getIndexCover(sorted, rankCover, compare?)`
- `unionRankCovers(compare, covers)` →
  `unionRankCovers(covers, compare?)`
- `intersectRankCovers(compare, covers)` →
  `intersectRankCovers(covers, compare?)`

These are breaking changes to helpers that have no known external
callers within the Endo monorepo.  Within the monorepo, the only
callers of `unionRankCovers` and `intersectRankCovers` are in
`@endo/patterns`'s `patternMatchers.js`, which has been updated to
match the new parameter order.

Salvaged from https://github.com/endojs/endo/pull/2871 so that the
codec-admission core of that PR (now in #3226) can land independently
of this rank-comparison refactor.
