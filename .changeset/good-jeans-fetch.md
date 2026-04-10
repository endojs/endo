---
'@endo/compartment-mapper': minor
---

Expose `_redundantPreloadHook` option in `captureFromMap()`, which will be called for each item in the `_preload` array that was already indirectly loaded via the entry `Compartment`.

Fixes a bug in the type of `_preload` option, which now allows for mixed arrays.

Fixes a bug in the preloader, which was not exhaustively checking if a non-entry module was already loaded via the entry `Compartment`.
