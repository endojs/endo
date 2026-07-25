---
'@endo/ocapn': minor
---

Add `./client/types` and `./client/util` subpath exports so
out-of-tree netlayers (e.g. `@endo/ocapn-iroh`) can import the
`NetLayer`/`NetlayerHandlers`/`Connection` JSDoc types and
`locationToLocationId` without reaching into unexported internals.
