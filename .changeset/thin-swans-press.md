---
'@endo/parser-pipeline': minor
---

Introduces `@endo/parser-pipeline`, a new package that eliminates redundant Babel AST parsing when multiple consumers need to analyze or transform the same JavaScript module source.

The core problem: tools built on `@endo/compartment-mapper` (such as LavaMoat) have historically parsed each module two or three times — once for import/export analysis, once for evasive transforms, and once for policy-relevant globals analysis. This package composes those passes into a single parse-traverse-generate cycle.

**`createParsers(config?)`** is the primary entry point. It accepts a single flat configuration object that combines pipeline options (`visitorFactories`, per-language `mjs`/`cjs` overrides, lifecycle hooks) with worker-pool options (`workerScript`, `workerData`, `maxWorkers`, `idleTimeout`). It returns `{ sync, async }` parser maps that are drop-in replacements for `parserForLanguage` in `@endo/compartment-mapper`. The module-source analysis step is handled implicitly by the pipeline; consumers only supply user-defined visitor factories.

Each entry in `visitorFactories` is a `VisitorPassFactory`: a function called once per module that returns a `VisitorPass` — an object with a required `visitor` and an optional `done()` method. Read-only "analyzer" passes and mutating "transform" passes are unified under this single type. Passes run in array order between the implicit module-source analyzer (first) and the implicit module-source transform (last). Each pass's `done()` fires immediately after its own traversal, so later passes see any AST mutations made by earlier ones. Passes that omit `done` contribute `undefined` to their `visitorResults` slot. Source maps are generated whenever the consumer provides a `sourceMapHook`, since the implicit module-source transform always rewrites the AST.

Async-only consumers (e.g. policy generation) need only supply the worker/pool options and lifecycle hooks — they do not need to pass factory configs that only run inside the worker.

**`runPipelineInWorker(port, config)`** powers the async path. It accepts the same pre-merge `PipelineConfig` shape as `createParsers`, performing the merge internally. Consumer-provided worker scripts call this to listen for parse tasks dispatched by the worker pool, run the full pipeline in a worker thread, and post results back. The worker pool (`WorkerParserPool`) manages spawning, queuing, idle timeouts, and unref'd workers so the process can exit cleanly once all in-flight dispatches settle.
