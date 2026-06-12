# @endo/parser-pipeline

Composable Babel visitor pipelines for JavaScript module analysis and transformation. Parses source once, runs multiple visitor passes, and generates code once. Eliminates redundant AST parsing when multiple consumers need to process the same source.

For use with [@endo/compartment-mapper](https://github.com/endojs/endo/tree/main/packages/compartment-mapper).

## Example

The pipeline **implicitly** runs `@endo/module-source` analysis and transforms for both ESM and CommonJS modules. You only supply **custom** `visitorFactories`.

```javascript
import fs from 'node:fs';
import url from 'node:url';
import { createParsers } from '@endo/parser-pipeline';
import { importLocation } from '@endo/compartment-mapper';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';
import { makeEvasiveTransformVisitor } from '@endo/evasive-transform/visitor.js';

// if runtime support for dynamic `require()` is needed, use the synchronous parser
const { sync: parserForLanguage } = createParsers({
  visitorFactories: [() => ({ visitor: makeEvasiveTransformVisitor() })],
});

await importLocation(makeReadPowers({ fs, url }), '/path/to/module.js', {
  parserForLanguage,
});
```

Above, `parserForLanguage` is a map of _language_ to parser implementation suitable for the eponymous option of various `@endo/compartment-mapper` APIs. Registering additional visitor passes (such as performed by `@endo/evasive-transform`) is done by appending more entries to `visitorFactories` in order; see [Order of Operations](#order-of-operations).

### Synchronous vs. Asynchronous Parsing

Synchronous parsing is the only way to support dynamic `require()` in CJS at runtime. If you are not actually importing/executing, then it is much more performant to use asynchronous parsing.

Asynchronous parsing is done via worker threads. Pass `workerScript` (and optional `workerData`) and use `.async` instead of `.sync`. The worker script **must** call `runPipelineInWorker` with a config containing any `visitorFactories`. _This property may be omitted from the main-thread invocation of `createParsers`, since it only runs in a worker thread._

## Installation

```bash
npm install @endo/parser-pipeline
```

## Usage

> **See [@endo/parser-pipeline API documentation](https://docs.endojs.org/modules/_endo_parser-pipeline)

This package exports `createParsers` and `runPipelineInWorker`. Together they produce `ParserImplementation` / `AsyncParserImplementation` values compatible with `@endo/compartment-mapper`'s `parserForLanguage` option.

### `createParsers(config?): { sync, async }`

Builds **both** a synchronous parser map and an asynchronous one from a single configuration object.

- **`sync`** — Lazily built `Record<'mjs' | 'cjs' | 'mts', ParserImplementation>`. Parsing runs on the calling thread. Use when you need synchronous parsing (e.g. dynamic `require()` on the execution path). [See Synchronous Parsers](#synchronous-parsers).
- **`async`** — Lazily built `Record<'mjs' | 'cjs' | 'mts', AsyncParserImplementation>`. Each parse is dispatched to a shared worker pool. **Requires** `workerScript` the first time `.async` is read. Workers are `unref()`'d so they do not keep the process alive after work settles. [See Asynchronous Parsers](#asynchronous-parsers).

Shared options apply to all languages; optional `mjs` / `cjs` / `mts` blocks override per language.

Illustrated with all options:

```javascript
import { createParsers } from '@endo/parser-pipeline';

const { sync: syncParsers, async: asyncParsers } = createParsers({
  // optional; use for synchronous parsing only
  visitorFactories: [
    /* (location, specifier) => VisitorPass */
  ],
  onModuleStart, // optional — main thread only
  onModuleComplete, // optional — receives user visitor results; main thread only

  babelParserOptions, // optional; passed to `@babel/parser`'s `parse()`
  babelGeneratorOptions, // optional; passed to `@babel/generator`'s `generate()`
  
  mjs: {
    finalizeRecord: () => {
      // ...
    }, // optional; main thread only
    /* per-language overrides */
  },
  cjs: {
    finalizeRecord: () => {
      // ...
    }, // optional; main thread only
    /* per-language overrides */
  },
  mts: {
    /* per-language overrides for ESM TypeScript (experimental) */
  },

  log, // optional; debug logging function

  // Async-only:
  // required when `.async` is first read
  workerScript: new URL('./parse-worker.js', import.meta.url),
  workerData: {}, // optional
  maxWorkers, // optional
  idleTimeout, // optional
});
```

> [!TIP] Use with `@endo/evasive-transform`
>
> Provide a `VisitorPassFactory` which returns a `VisitorPass` having a `visitor` (a `Visitor` from > `@babel/traverse`) property. `@endo/evasive-transform` provides `makeEvasiveTransformVisitor` for this purpose:
>
> ```js
> import { makeEvasiveTransformVisitor } from '@endo/evasive-transform/visitor.js';
> import { createParsers } from '@endo/parser-pipeline';
>
> const parsersForLanguage = createParsers({
>   visitorFactories: [() => ({ visitor: makeEvasiveTransformVisitor() })],
> });
> ```

#### Order of Operations

After the initial Babel parse, the AST is traversed in several passes, _in this order_:

1. **Implicit `@endo/module-source` analyzer** — read-only; gathers imports, exports, reexports, etc.
2. **Custom `visitorFactories`** — user-defined passes, in array order. Each pass's `done()` is called immediately after that pass's own traversal, before the next pass begins. A later pass therefore sees any AST mutations made by earlier ones.
3. **Implicit `@endo/module-source` transform** — mutating; rewrites the module into the SES-compatible functor shape.

Then **code generation** runs once on the transformed AST, and the implicit pipeline builds the final record from that source.

Each "pass factory" is invoked _once per module_ and must return a new `VisitorPass` object with independent state.

### Synchronous Parsers

Synchronous parsing is necessary _if and only if_ you need to support dynamic `require()` in CJS at runtime. Since all of the work happens in the main thread, it necessarily be slower.

```javascript
import fs from 'node:fs';
import url from 'node:url';

import { createParsers } from '@endo/parser-pipeline';
import { importFromLocation } from '@endo/compartment-mapper';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

import { customVisitorFactory } from './custom-visitor-factory.js';
import { importNowHook, importHook } from './import-hooks.js';

const {
  sync: { cjs, mjs },
} = createParsers({
  visitorFactories: [customVisitorFactory],
});

await importFromLocation(makeReadPowers({ fs, url }), '/path/to/module.js', {
  importHook,
  importNowHook, // needed for dynamic `require()`
  parserForLanguage: {
    cjs,
    mjs,
  },
});
```

### Asynchronous Parsers

In asynchronous parsing, worker scripts call `runPipelineInWorker` with the `parentPort` from `node:worker_threads` and a `PipelineConfig` object. Visitor pass factories will be created _here_ instead of on the main thread. Any Babel-specific options should also be provided in the worker script.

It's the main thread's responsibility to provide the path/URL to the worker script and any other worker pool options. _The main thread does not declare visitor factories!_

Example main thread implementation:

```javascript
// main.js
import fs from 'node:fs';
import url from 'node:url';

import { createParsers } from '@endo/parser-pipeline';
import { loadLocation } from '@endo/parser-pipeline';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

import { importHook } from './import-hooks.js';

const {
  async: { cjs, mjs },
} = createParsers({
  workerScript: new URL('./parse-worker.js', import.meta.url),
  workerData: {},
  maxWorkers: 10,
  idleTimeout: 1000,
});

const app = await loadLocation(
  makeReadPowers({ fs, url }),
  '/path/to/module.js',
  {
    importHook,
    parserForLanguage: {
      cjs,
      mjs,
    },
  },
);
```

Example worker script implementation:

```javascript
// parse-worker.js
import { runPipelineInWorker } from '@endo/parser-pipeline';
import { makeEvasiveTransformVisitor } from '@endo/evasive-transform/visitor.js';
import { parentPort } from 'node:worker_threads';
import { customVisitorFactory } from './custom-visitor-factory.js';

const evasiveTransformFactory = () => ({
  visitor: makeEvasiveTransformVisitor(),
});

runPipelineInWorker(parentPort, {
  visitorFactories: [customVisitorFactory, evasiveTransformFactory],
  babelParserOptions: {
    /* ... */
  },
  babelGeneratorOptions: {
    /* ... */
  },
});
```

## TypeScript Support (Experimental)

The `mts` language enables ESM TypeScript modules. Sources are run through Node.js' built-in [`module.stripTypeScriptTypes()`](https://nodejs.org/api/module.html#modulestriptypescripttypescode-options) **before** Babel parses them; from there the rest of the pipeline treats them exactly like `mjs` modules.

```javascript
import { createParsers } from '@endo/parser-pipeline';

const { sync } = createParsers({
  // mts inherits shared options like any other language;
  // per-language overrides go in the `mts` block.
  mts: {
    /* visitorFactories, babelParserOptions, etc. */
  },
});

const result = sync.mts.parse(bytes, specifier, location, packageLocation, {});
```

### Requirements

- **Node.js v22.13.0 / v23.2.0+**. Older runtimes throw a clear error when an `mts` module is parsed.
- Strip emits an `ExperimentalWarning` on first call (Node's, not ours).

### Strip-only subset

Only the strip-only subset of TypeScript is supported. The following features throw at parse time because they require runtime transformation, not just stripping:

- `enum` and `const enum`
- `namespace` (with runtime semantics)
- Parameter properties (`constructor(public x: number)`)
- `import = require()`

Type-only syntax — annotations, `interface`, `type` aliases, generic parameters, `as` / `satisfies` / `!` casts, `import type`, inline `type` specifiers — is all stripped cleanly.

### Source positions

`stripTypeScriptTypes()` whitespace-pads the removed annotations to preserve token offsets and line numbers. That means Babel's positions on the stripped source map transitively back to the original TypeScript source, so source maps emitted via `sourceMapHook` remain meaningful without any extra plumbing.

### Out of scope (for now)

- `cts` (CJS TypeScript)
- `tsx` / `jsx` (JSX is a transpilation, not a strip)
- `transform` mode (the API was removed from `stripTypeScriptTypes` in Node 26)

## Advanced Usage

### Pass Consolidation

If you have several passes that always run together, consider implementing them as a **single `VisitorPass`**. Example:

```js
// previously this was two separate factories:
// one for dataA and one for dataB
const createMyPass = options => {
  const dataA = {};
  const dataB = {};
  return {
    visitor: {
      // do something with both dataA and dataB
    },
    done() {
      // previously, first pass returned dataA,
      // and second pass returned dataB
      return { dataA, dataB };
    },
  };
};
```

Each pass invokes a traversal over the AST, so it's more efficient to minimize the number of passes.

Perhaps more egregiously, `onModuleComplete` may suffer from positional-tuple ordering fragility. With a single structured result, the `visitorResults` provided to `onModuleComplete` is a one-element tuple with named fields rather than multiple positional values:

```js
// before (two factories)
onModuleComplete({ visitorResults: [isThisDataA, maybeItsDataB], language }) {
  // ...
}
```

_Did you provide the factory for `dataA` or `dataB` first?_ 🤔
After consolidation, you don't have to be concerned about the order:

```js
// after (one factory)
onModuleComplete({ visitorResults: [{ dataA, dataB }], language }) {
  // ...
}
```

### Ordering and AST Visibility

User passes run in `visitorFactories` array order, between the two implicit passes. Each pass's `done()` fires immediately after that pass's own traversal. This means:

- A pass placed **after** a mutating pass sees the mutated AST.
- A pass placed **before** a mutating pass sees the original AST.

You own the ordering. Read-only "analyzer" passes and mutating "transform" passes are both expressed as `VisitorPass`; arrange them in whatever order suits your needs.

### Language-Specific Visitor Passes

If you have language-specific visitor factories which return different data structures, we **strongly recommended** providing language-specific `onModuleComplete` callbacks for better type safety.

## License

Copyright © 2026 Endo Contributors. Licensed under the [Apache-2.0 License](LICENSE).
