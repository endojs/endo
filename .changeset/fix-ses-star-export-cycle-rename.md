---
'ses': patch
---

Fix a star-export cycle defect where a module reached more than once via `export *` and a renaming reexport with a different exported name (`export { y as x } from ...`) raised a spurious `SyntaxError: ... does not provide an export named 'X'` (latterly `TypeError: notify is not a function`).
The reexport wire-up now installs a deferred forwarding notifier that resolves through the upstream's notifier table on first subscription, so cyclic star-export fixed-points converge.
Resolves endojs/endo#59.
