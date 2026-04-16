# @endo/parser-pipeline

Composable Babel visitor pipelines for JavaScript module analysis and transformation. Parses source once, runs multiple visitor passes, and generates code once. Eliminates redundant AST parsing when multiple consumers need to process the same source.

## Example

```javascript
import fs from 'node:fs';
import url from 'node:url';
import { createComposedParser } from '@endo/parser-pipeline';
import { createModuleSourcePasses } from '@endo/module-source';
import { createEvasiveTransformPass } from '@endo/evasive-transform';
import { importLocation } from '@endo/compartment-mapper';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

let moduleSourceState;

const parser = createComposedParser(
  // recordBuilder: constructs the module record from generated code
  (generatedCode, location) =>
    moduleSourceState.buildRecord(generatedCode, location),
  {
    analyzerFactories: [
      // Read-only pass: extract imports, exports, reexports
      (_location, _specifier) => {
        moduleSourceState = createModuleSourcePasses();
        return moduleSourceState.analyzerPass;
      },
    ],
    transformFactories: [
      // Mutating pass: defang SES-forbidden patterns
      (_location, _specifier) => createEvasiveTransformPass(),
      // Mutating pass: rewrite ESM to SES-compatible functor
      (_location, _specifier) => moduleSourceState.transformPass,
    ],
  },
);

// Use as a parserForLanguage entry in @endo/compartment-mapper
await importLocation(makeReadPowers({ fs, url }), '/path/to/module.js', {
  parserForLanguage: { mjs: parser },
});
```

## Installation

```bash
yarn add @endo/parser-pipeline
```

## Usage

This package exports two parser constructors, each returning a `ParserImplementation` or `AsyncParserImplementation` compatible with `@endo/compartment-mapper`'s common `parserForLanguage` option.

### `createComposedParser(recordBuilder, options?): ParserImplementation`

Synchronous, in-process pipeline. Parses each module in the calling thread. Best for the execution path where modules are loaded on-demand (including synchronous dynamic `require()` for CJS).

```javascript
import { createComposedParser } from '@endo/parser-pipeline';

const parser = createComposedParser(recordBuilder, {
  analyzerFactories, // read-only visitor factories (run first)
  transformFactories, // mutating visitor factories (run after analyzers)
  sourcePreprocessor, // optional string transform before Babel parse
  onModuleComplete, // optional callback after each module completes
});

// parser satisfies ParserImplementation with synchronous: true
```

The `recordBuilder` is a required first argument. It is a synchronous function which receives the generated code and module location. It must return a `FinalStaticModuleType` (e.g., a SES `ModuleSource`-compatible record).

#### Visitor Ordering

1. All `analyzerFactories` run first (read-only traversals)
2. All `transformFactories` run next (mutating traversals)
3. Code generation runs once after all visitors complete

Each factory is called once per module with `(location, specifier)` and must return a fresh visitor instance with independent state.

### `createWorkerParser(workerScript, options?): TerminatableAsyncParserImplementation`

Async, worker-pool-backed pipeline. Dispatches each module to a worker thread for parsing. Multiple modules parse in parallel across cores. Useful where modules need up-front analysis prior to execution.

```javascript
import fs from 'node:fs';
import url from 'node:url';
import { createWorkerParser } from '@endo/parser-pipeline';
import { loadLocation } from '@endo/compartment-mapper';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

const parser = createWorkerParser(new URL('./my-worker.js', import.meta.url), {
  workerData: {
    /* serializable config for workers */
  },
  onModuleComplete, // optional callback with analyzer results
  maxWorkers: 4, // defaults to os.availableParallelism() - 1
  idleTimeout: 1000, // ms before idle workers terminate
});

// parser satisfies AsyncParserImplementation with synchronous: false

// Use as a parserForLanguage entry in @endo/compartment-mapper
try {
  await loadLocation(makeReadPowers({ fs, url }), '/path/to/module.js', {
    parserForLanguage: { mjs: parser },
  });
} finally {
  // parser has a .terminate() method to terminate the worker pool when finished.
  await parser.terminate();
}
```

The worker pool manages dispatch, queueing, and idle termination.

#### Worker Scripts

Worker scripts import their own visitor modules and call `runPipelineInWorker` from `@endo/parser-pipeline/worker-runner.js`:

```javascript
// my-worker.js
import { runPipelineInWorker } from '@endo/parser-pipeline/worker-runner.js';
import { createEvasiveTransformPass } from '@endo/evasive-transform';
import { createModuleSourcePasses } from '@endo/module-source';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';

if (!parentPort || isMainThread) {
  throw new Error('This module must be run as a worker thread');
}

// runPipelineInWorker registers a listener for messages on parentPort;
// removePipelineListener removes it, if needed.
const { removePipelineListener } = runPipelineInWorker(parentPort, {
  createAnalyzerPasses: (location, specifier) => [
    // your read-only analysis visitors
  ],
  createTransformPasses: (location, specifier) => {
    const ms = createModuleSourcePasses();
    return {
      passes: [createEvasiveTransformPass(), ms.transformPass],
      analyzerPass: ms.analyzerPass,
      buildRecord: ms.buildRecord,
    };
  },
  sourcePreprocessor: source => source, // optional
});
```

**The worker script depends on the visitor packages.** The parser-pipeline package provides _only_ the pool infrastructure and runner.

## License

Copyright © 2026 Endo Contributors. Licensed under the [Apache-2.0 License](LICENSE).
