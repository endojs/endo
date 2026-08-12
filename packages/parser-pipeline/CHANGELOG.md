# @endo/parser-pipeline

## 0.1.0

### Minor Changes

- [#3158](https://github.com/endojs/endo/pull/3158) [`1fa6c22`](https://github.com/endojs/endo/commit/1fa6c227e58f57727376a22cad176c6592c33006) Thanks [@boneskull](https://github.com/boneskull)! - Introduces `@endo/parser-pipeline`, a new package that eliminates redundant Babel AST parsing when multiple consumers need to analyze or transform the same JavaScript module source.

  The core problem: tools built on `@endo/compartment-mapper` (such as LavaMoat) have historically parsed each module two or three times — once for import/export analysis, once for evasive transforms, and once for policy-relevant globals analysis. This package composes those passes into a single parse-traverse-generate cycle.

  **`createParsers(config?)`** is the primary entry point. It accepts a single flat configuration object that combines pipeline options (`visitorFactories`, per-language `mjs`/`cjs` overrides, lifecycle hooks) with worker-pool options (`workerScript`, `workerData`, `maxWorkers`, `idleTimeout`). It returns `{ sync, async }` parser maps that are drop-in replacements for `parserForLanguage` in `@endo/compartment-mapper`. The module-source analysis step is handled implicitly by the pipeline; consumers only supply user-defined visitor factories.

  Each entry in `visitorFactories` is a `VisitorPassFactory`: a function called once per module that returns a `VisitorPass` — an object with a required `visitor` and an optional `done()` method. Read-only "analyzer" passes and mutating "transform" passes are unified under this single type. Passes run in array order between the implicit module-source analyzer (first) and the implicit module-source transform (last). Each pass's `done()` fires immediately after its own traversal, so later passes see any AST mutations made by earlier ones. Passes that omit `done` contribute `undefined` to their `visitorResults` slot. Source maps are generated whenever the consumer provides a `sourceMapHook`, since the implicit module-source transform always rewrites the AST.

  Async-only consumers (e.g. policy generation) need only supply the worker/pool options and lifecycle hooks — they do not need to pass factory configs that only run inside the worker.

  **`runPipelineInWorker(port, config)`** powers the async path. It accepts the same pre-merge `PipelineConfig` shape as `createParsers`, performing the merge internally. Consumer-provided worker scripts call this to listen for parse tasks dispatched by the worker pool, run the full pipeline in a worker thread, and post results back. The worker pool (`WorkerParserPool`) manages spawning, queuing, idle timeouts, and unref'd workers so the process can exit cleanly once all in-flight dispatches settle.

### Patch Changes

- Updated dependencies [[`e054d1a`](https://github.com/endojs/endo/commit/e054d1a92032c40593388e7839c1e538e4b1a107), [`4da9a99`](https://github.com/endojs/endo/commit/4da9a9959e4376c5760a3232e978a4f8fe4ac6b7), [`34da8b4`](https://github.com/endojs/endo/commit/34da8b493807d92901fb834bab8158f2db397d34), [`be222ee`](https://github.com/endojs/endo/commit/be222ee40d1e552a52ca11af91ab5895a2dbe979), [`eeefaa0`](https://github.com/endojs/endo/commit/eeefaa0100625d6ef7b712e7b79b2223d9e30a85), [`73e03aa`](https://github.com/endojs/endo/commit/73e03aa5bc461cd6eef3fc59dee50ab33ee174cf), [`d47d74f`](https://github.com/endojs/endo/commit/d47d74f3139e737de932b3cb59b2b62d4c055299), [`a85b212`](https://github.com/endojs/endo/commit/a85b212344b2a1e2329e55852e11c590828fc450), [`8906393`](https://github.com/endojs/endo/commit/8906393c2a856ae883f2f67485449e45b7b40cea), [`c69eb03`](https://github.com/endojs/endo/commit/c69eb033e5db48c681e6ab39445142732871bb80), [`dfdfa08`](https://github.com/endojs/endo/commit/dfdfa085df47078b2f8e7d89d04bd92634651cda), [`71cbdb9`](https://github.com/endojs/endo/commit/71cbdb989afcc4b5633f8b3981ae8254109d8d2d), [`bfa149b`](https://github.com/endojs/endo/commit/bfa149b4f18c6ad1cf1fed3e91cbaddf1e61b39d)]:
  - @endo/compartment-mapper@2.4.0
  - ses@2.3.0
  - @endo/module-source@1.5.0
