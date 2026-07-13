---
'@endo/platform': minor
---

Add `@endo/platform/fs/search`, the normative glob/grep engine pushed down out
of the daemon's `EndoMount` (designs/platform-search-pushdown.md). `makeSearch(powers)`
walks a narrow read contract and exposes `globPaths` and `grepFiles` as
async generators of **batches** — batching is intrinsic, so today's eager
`Promise<Array>` surface (flatten-and-cap) and a future exo-stream surface
(`readerFromIterator`) draw from one generator and cannot drift. glob is the
two-metacharacter (`*` / `**`), ReDoS-safe, UTF-16-sorted dialect; grep is a
flagless ECMA-262 matcher decoupled from glob (it consumes an array,
`Promise<Array>`, or stream of path batches). Confinement and denial are
declarative data so the identical contract can cross a native seam. Also exports
`provideSearch(filePowers)` (selects a platform-native `search` when present,
else the JS engine), `makeNodeSearchPowers` (the `node:fs` adapter, at
`@endo/platform/fs/node/search`), and `isConservativeRegex` (the seam a future
native-grep pushdown consults).
