---
'@endo/marshal': minor
'@endo/patterns': minor
---

- `FullRankCover` is deprecated. Instead, use `provideStaticRanks(encodePassable)['*'].cover`.
- `getPassStyleCover(passStyle)` is deprecated. Instead, use `provideStaticRanks(encodePassable)[p
assStyle].cover`.
- `getRankCover` now works with format "compactOrdered", and produces tighter bounds for arrays and `M.nat()` (which has an implicit lower bound at 0).
- `intersectRankCovers` and `unionRankCovers` now reject a non-empty list of covers (not that an empty list was ever semantically valid).
