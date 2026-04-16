---
'@endo/compartment-mapper': minor
'@endo/module-source': minor
'@endo/parser-pipeline': patch
---

Exposes a Babel-based AST parser for CJS in `@endo/compartment-mapper` which supports dynamic `import()`. `@endo/module-source` exposes `CjsModuleSource` and `createCjsModuleSourcePasses()` (for use with `@endo/parser-pipeline`) and contains the implementation of the Babel-based parser for CJS. `@endo/parser-pipeline` now accepts records created by `CjsModuleSource`.
