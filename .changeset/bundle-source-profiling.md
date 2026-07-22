---
'@endo/bundle-source': patch
'@endo/compartment-mapper': patch
'@endo/evasive-transform': patch
'@endo/module-source': patch
'@endo/zip': patch
---

Improve multi-entry bundle-source performance and add profiling tools.

Adds Chrome trace profiling for `@endo/bundle-source`, trace merge summaries,
and an Agoric SDK bundle profiling helper. Adds profiling spans across
compartment-mapper, evasive-transform, module-source, and zip archive writing.

Improves repeated bundling performance with shared read behavior, optimized
node-modules graph processing, cross-bundle archive parser reuse, and zip writer
path tuning. Adds a zip writer benchmark script.
