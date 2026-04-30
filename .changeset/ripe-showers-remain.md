---
'@endo/module-source': minor
---

Fixes the type of `SourceMapHook` and introduces proper `.ts` type sources checked by `tsc`. Types that were previously inlined as JSDoc typedefs (`SourceMapHook`, `SourceMapHookDetails`, `SourceMapObject`, `ModuleSourceOptions`, `TransformSourceParams`) are now defined in `src/types/module-source.ts` and re-exported from the package root via a new `src/external.types.d.ts` entry.

Adds a `./analyzer.js` subpath export with `analyzeModule(options?)`. The returned context object exposes `analyzePass` and `transformPass` (plain `{ visitor }` objects) and a `buildRecord()` function. This is the primitive that `@endo/parser-pipeline` uses to drive module analysis; it is also used internally by the `ModuleSource` constructor, so the exported API is not specific to the pipeline.

Removes the `PluginFactory` abstraction and `visitorFromPlugin` helper: Babel plugins now return plain `{ visitor }` objects directly, with `@babel/types` imported at module scope.
