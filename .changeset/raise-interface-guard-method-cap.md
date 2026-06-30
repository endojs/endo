---
'@endo/patterns': minor
---

Raise the interface-guard method-guard count limit from 80 to 128.
`M.interface()` enforces a `numPropertiesLimit` on its `methodGuards` record
for DoS-defense, but large agent facets (such as the daemon's `EndoHost`
interface) legitimately expose more than 80 method guards and were tripping
the cap at exo construction. The limit stays bounded — just with comfortable
headroom so normal interfaces never encounter it.
