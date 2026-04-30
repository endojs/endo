import test from '@endo/ses-ava/prepare-endo.js';
import { createParsers } from '../src/parsers.js';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

/**
 * @import {BabelParseError} from '../src/types/pipeline.js';
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const asyncParserWorkerScript = new URL(
  './fixture/async-parser-worker.js',
  import.meta.url,
);

// Workers are unref()'d by the pool, so they won't prevent the process from
// exiting once all in-flight dispatches settle. No explicit teardown needed.
test.serial(
  'onModuleComplete is called with user visitorResults only',
  async t => {
    /** @type {{ visitorResults: unknown[]; language: string }[]} */
    const collectedData = [];

    const { async: asyncParsers } = createParsers({
      workerScript: asyncParserWorkerScript,
      onModuleComplete: ({ visitorResults, language }) => {
        collectedData.push({ visitorResults, language });
      },
    });

    const source = `export const x = 1;`;

    await asyncParsers.mjs.parse(
      textEncoder.encode(source),
      'test',
      'file:///test.js',
      'file:///',
      {},
    );

    t.is(collectedData.length, 1);
    // Should contain only the user-defined visitor result, not the module-source analysis.
    t.deepEqual(collectedData[0].visitorResults, ['user-result']);
    t.is(collectedData[0].language, 'mjs');
  },
);

test.serial('mjs produces a valid ParseResult', async t => {
  const { async: asyncParsers } = createParsers({
    workerScript: asyncParserWorkerScript,
  });

  const source = `
    import { foo } from 'bar';
    export const x = foo();
  `;

  const result = await asyncParsers.mjs.parse(
    textEncoder.encode(source),
    'test',
    'file:///test.js',
    'file:///',
    {},
  );

  t.is(result.parser, 'mjs');
  t.truthy(result.record);
  t.truthy(result.bytes);
  // `bytes` must be the worker's *transformed* output, not an echo of the
  // raw input — regression guard for a bug where the async path returned
  // the pre-transform bytes it was given rather than the ones the worker
  // produced.
  t.not(textDecoder.decode(result.bytes), source);
  // The record should be a valid ESM module record.
  t.deepEqual([...result.record.imports].sort(), ['bar']);
  t.deepEqual([...result.record.exports].sort(), ['x']);
});

test.serial('cjs produces a valid ParseResult', async t => {
  const { async: asyncParsers } = createParsers({
    workerScript: asyncParserWorkerScript,
    cjs: {
      finalizeRecord: record => ({
        imports: record.imports,
        exports: record.exports,
        reexports: record.reexports,
        execute: () => {},
      }),
    },
  });

  const source = `
    const dep = require('some-dep');
    exports.result = dep.value;
  `;

  const result = await asyncParsers.cjs.parse(
    textEncoder.encode(source),
    'test',
    'file:///test.cjs',
    'file:///',
    {},
  );

  t.is(result.parser, 'cjs');
  t.truthy(result.record);
  t.truthy(result.bytes);
  // See the equivalent assertion in the mjs test above for why this matters.
  t.not(textDecoder.decode(result.bytes), source);
  t.deepEqual([...result.record.imports].sort(), ['some-dep']);
});

test.serial(
  'VisitorPass without done() contributes undefined to visitorResults',
  async t => {
    const { async: asyncParsers } = createParsers({
      workerScript: new URL('./fixture/no-done-worker.js', import.meta.url),
      onModuleComplete: ({ visitorResults }) => {
        t.is(visitorResults.length, 1);
        t.is(visitorResults[0], undefined);
      },
    });

    const result = await asyncParsers.mjs.parse(
      textEncoder.encode(`export const original = 1;`),
      'test',
      'file:///test.js',
      'file:///',
      {},
    );

    // Traversal still ran even though done() was absent — confirmed by
    // inspecting the generated code, since the worker can't share a closure
    // with the test the way the sync path does.
    t.true(textDecoder.decode(result.bytes).includes('renamed'));
  },
);

test.serial('onParseError is called with recoverable errors', async t => {
  const fixtureUrl = new URL('./fixture/recoverable-error.js', import.meta.url);
  const fixturePath = fileURLToPath(fixtureUrl);
  const fixtureBytes = readFileSync(fixturePath);
  const fixtureFileUrl = fixtureUrl.href;

  /** @type {BabelParseError[]} */
  let capturedErrors = [];
  let parseErrorCallCount = 0;

  const { async: asyncParsers } = createParsers({
    workerScript: asyncParserWorkerScript,
    onParseError: errors => {
      parseErrorCallCount += 1;
      capturedErrors = errors;
    },
  });

  await asyncParsers.mjs.parse(
    fixtureBytes,
    'fixture/recoverable-error.js',
    fixtureFileUrl,
    new URL('./', import.meta.url).href,
    {},
  );

  t.is(parseErrorCallCount, 1, 'onParseError called exactly once');
  t.true(capturedErrors.length > 0, 'at least one error reported');

  const [err] = capturedErrors;
  t.true(
    err instanceof Error,
    'ParseError is an instanceof Error (Babel ParseError extends SyntaxError)',
  );
  t.is(typeof err.code, 'string', 'ParseError has a string .code property');
  t.is(
    typeof err.reasonCode,
    'string',
    'ParseError has a string .reasonCode property',
  );
});

test.serial(
  'recoverable syntax errors reject with AggregateError when onParseError is not provided',
  async t => {
    const fixtureUrl = new URL(
      './fixture/recoverable-error.js',
      import.meta.url,
    );
    const fixturePath = fileURLToPath(fixtureUrl);
    const fixtureBytes = readFileSync(fixturePath);
    const fixtureFileUrl = fixtureUrl.href;

    // No onParseError callback: the default behavior must surface the
    // recoverable parse errors by rejecting, since a module with any parse
    // errors will fail to execute at runtime anyway. The AggregateError is
    // constructed on the main thread (after dispatch resolves), so it's a
    // real AggregateError rather than a structuredClone'd Error.
    const { async: asyncParsers } = createParsers({
      workerScript: asyncParserWorkerScript,
    });

    const error = await t.throwsAsync(
      asyncParsers.mjs.parse(
        fixtureBytes,
        'fixture/recoverable-error.js',
        fixtureFileUrl,
        new URL('./', import.meta.url).href,
        {},
      ),
      { instanceOf: AggregateError },
    );

    t.true(
      error.errors.length > 0,
      'AggregateError wraps at least one parse error',
    );
  },
);

test.serial(
  'async - onParseError is NOT called for syntactically valid modules',
  async t => {
    let parseErrorCallCount = 0;

    const { async: asyncParsers } = createParsers({
      workerScript: asyncParserWorkerScript,
      onParseError: () => {
        parseErrorCallCount += 1;
      },
    });

    await asyncParsers.mjs.parse(
      textEncoder.encode(`export const x = 1;`),
      'test',
      'file:///test.js',
      'file:///',
      {},
    );

    t.is(parseErrorCallCount, 0);
  },
);

test.serial('unrecoverable syntax errors reject the parse promise', async t => {
  const fixtureUrl = new URL(
    './fixture/unrecoverable-error.js',
    import.meta.url,
  );
  const fixturePath = fileURLToPath(fixtureUrl);
  const fixtureBytes = readFileSync(fixturePath);
  const fixtureFileUrl = fixtureUrl.href;

  const { async: asyncParsers } = createParsers({
    workerScript: asyncParserWorkerScript,
  });

  // Unlike the sync path (see sync-parser.test.js), the error crossing the
  // worker thread boundary is a plain cloned `Error` (see
  // `makeClonableError` in worker-runner.js) rather than the original
  // `SyntaxError` — structuredClone doesn't preserve `code`/`name` on
  // arbitrary Error subclasses here, so we can't assert
  // `code: 'BABEL_PARSER_SYNTAX_ERROR'` the way the sync test does.
  await t.throwsAsync(
    asyncParsers.mjs.parse(
      fixtureBytes,
      'fixture/unrecoverable-error.js',
      fixtureFileUrl,
      new URL('./', import.meta.url).href,
      {},
    ),
    { instanceOf: Error },
  );
});

test.serial(
  'done() fires immediately after each pass so later passes see earlier mutations',
  async t => {
    // Pass 1 (mutating): rename every Identifier named "original" to "renamed".
    // Pass 2 (read-only): collect all Identifier names via done().
    // If done() fires per-pass, pass 2 sees the post-mutation AST.

    /** @type {string[]} */
    let namesSeenByPass2 = [];

    const { async: asyncParsers } = createParsers({
      workerScript: new URL(
        './fixture/rename-then-collect-worker.js',
        import.meta.url,
      ),
      onModuleComplete: ({ visitorResults }) => {
        namesSeenByPass2 = /** @type {string[]} */ (visitorResults[1]);
      },
    });

    await asyncParsers.mjs.parse(
      textEncoder.encode(`export const original = 1;`),
      'test',
      'file:///test.js',
      'file:///',
      {},
    );

    // Pass 2 must have seen "renamed", not "original", proving done() ordering.
    t.true(namesSeenByPass2.includes('renamed'));
    t.false(namesSeenByPass2.includes('original'));
  },
);
