---
'@endo/marshal': minor
---

Add `compareRankRemotablesTied` and `compareAntiRankRemotablesTied`,
which behave like `compareRank` and `compareAntiRank` except that they
treat all remotables as tied for the same rank instead of short-circuiting
the comparison on encountering a remotable.  Make the `compare` parameter
optional on `isRankSorted`, `assertRankSorted`, `sortByRank`, and
`getIndexCover`, defaulting to `compareRankRemotablesTied`.

`getIndexCover`'s parameter order changes from
`(sorted, compare, rankCover)` to `(sorted, rankCover, compare?)` to
move the optional parameter to the end.  This is a breaking change to a
helper that has no known external callers within the Endo monorepo.

Salvaged from https://github.com/endojs/endo/pull/2871 so that the
codec-admission core of that PR (now in #3226) can land independently
of this rank-comparison refactor.
