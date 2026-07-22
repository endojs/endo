import test from '@endo/ses-ava/prepare-endo.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createParsers } from '../src/parsers.js';

/**
 * @import {ParseError} from '../src/types/pipeline.js'
 */

const textEncoder = new TextEncoder();

test('onModuleComplete is called with user visitorResults only', async t => {
  /** @type {{ visitorResults: unknown[]; language: string }[]} */
  const collectedData = [];

  const { sync } = createParsers({
    visitorFactories: [
      (_loc, _spec) => ({
        visitor: {},
        done: () => 'user-result',
      }),
    ],
    onModuleComplete: ({ visitorResults, language }) => {
      collectedData.push({ visitorResults, language });
    },
  });

  const source = `export const x = 1;`;

  sync.mjs.parse(
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
});

test('mjs produces a valid ParseResult', t => {
  const { sync } = createParsers();

  const source = `
    import { foo } from 'bar';
    export const x = foo();
  `;

  const result = sync.mjs.parse(
    textEncoder.encode(source),
    'test',
    'file:///test.js',
    'file:///',
    {},
  );

  t.is(result.parser, 'mjs');
  t.truthy(result.record);
  t.truthy(result.bytes);
  // The record should be a valid ESM module record.
  t.deepEqual([...result.record.imports].sort(), ['bar']);
  t.deepEqual([...result.record.exports].sort(), ['x']);
});

test('cjs produces a valid ParseResult', t => {
  const { sync } = createParsers({
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

  const result = sync.cjs.parse(
    textEncoder.encode(source),
    'test',
    'file:///test.cjs',
    'file:///',
    {},
  );

  t.is(result.parser, 'cjs');
  t.truthy(result.record);
  t.truthy(result.bytes);
  t.deepEqual([...result.record.imports].sort(), ['some-dep']);
});

test('VisitorPass without done() contributes undefined to visitorResults', t => {
  let traversalCount = 0;

  const { sync } = createParsers({
    visitorFactories: [
      () => ({
        visitor: {
          Identifier() {
            traversalCount += 1;
          },
        },
        // no done()
      }),
    ],
    onModuleComplete: ({ visitorResults }) => {
      t.is(visitorResults.length, 1);
      t.is(visitorResults[0], undefined);
    },
  });

  sync.mjs.parse(
    textEncoder.encode(`export const x = 1;`),
    'test',
    'file:///test.js',
    'file:///',
    {},
  );

  // Traversal still ran even though done() was absent.
  t.true(traversalCount > 0);
});

test('onParseError is called for modules with recoverable syntax errors', t => {
  const fixtureUrl = new URL('./fixture/recoverable-error.js', import.meta.url);
  const fixturePath = fileURLToPath(fixtureUrl);
  const fixtureBytes = readFileSync(fixturePath);
  const fixtureFileUrl = fixtureUrl.href;

  /** @type {ParseError[]} */
  let capturedErrors = [];
  let parseErrorCallCount = 0;

  const { sync } = createParsers({
    onParseError: errors => {
      parseErrorCallCount += 1;
      capturedErrors = errors;
    },
  });

  // errorRecovery is always on, so this must not throw even with broken syntax.
  t.notThrows(() => {
    sync.mjs.parse(
      fixtureBytes,
      'fixture/syntax-error.js',
      fixtureFileUrl,
      new URL('./', import.meta.url).href,
      {},
    );
  });

  t.is(parseErrorCallCount, 1, 'onParseError called exactly once');
  t.true(capturedErrors.length > 0, 'at least one error reported');

  const [err] = capturedErrors;

  // Babel's ParseError extends SyntaxError which extends Error — document this
  // runtime fact explicitly so callers know they can rely on it. Also confirms
  // the objects are structuredClone-able (they cross the worker boundary as-is).
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

test('sync -onParseError is NOT called for syntactically valid modules', t => {
  let parseErrorCallCount = 0;

  const { sync } = createParsers({
    onParseError: () => {
      parseErrorCallCount += 1;
    },
  });

  sync.mjs.parse(
    textEncoder.encode(`export const x = 1;`),
    'test',
    'file:///test.js',
    'file:///',
    {},
  );

  t.is(parseErrorCallCount, 0);
});

test('unrecoverable syntax errors throw', t => {
  const fixtureUrl = new URL(
    './fixture/unrecoverable-error.js',
    import.meta.url,
  );
  const fixturePath = fileURLToPath(fixtureUrl);
  const fixtureBytes = readFileSync(fixturePath);
  const fixtureFileUrl = fixtureUrl.href;

  const { sync } = createParsers();

  t.throws(
    () => {
      sync.mjs.parse(
        fixtureBytes,
        'fixture/unrecoverable-error.js',
        fixtureFileUrl,
        new URL('./', import.meta.url).href,
        {},
      );
    },
    { instanceOf: SyntaxError, code: 'BABEL_PARSER_SYNTAX_ERROR' },
  );
});

test('done() fires immediately after each pass so later passes see earlier mutations', t => {
  // Pass 1 (mutating): rename every Identifier named "original" to "renamed".
  // Pass 2 (read-only): collect all Identifier names via done().
  // If done() fires per-pass, pass 2 sees the post-mutation AST.

  /** @type {string[]} */
  let namesSeenByPass2 = [];

  const { sync } = createParsers({
    visitorFactories: [
      () => ({
        visitor: {
          Identifier(path) {
            if (path.node.name === 'original') {
              path.node.name = 'renamed';
            }
          },
        },
      }),
      () => {
        /** @type {string[]} */
        const names = [];
        return {
          visitor: {
            Identifier(path) {
              names.push(path.node.name);
            },
          },
          done() {
            return names;
          },
        };
      },
    ],
    onModuleComplete: ({ visitorResults }) => {
      namesSeenByPass2 = /** @type {string[]} */ (visitorResults[1]);
    },
  });

  sync.mjs.parse(
    textEncoder.encode(`export const original = 1;`),
    'test',
    'file:///test.js',
    'file:///',
    {},
  );

  // Pass 2 must have seen "renamed", not "original", proving done() ordering.
  t.true(namesSeenByPass2.includes('renamed'));
  t.false(namesSeenByPass2.includes('original'));
});
