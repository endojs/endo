// import "./ses-lockdown.js";
import 'ses';

import { CjsModuleSource } from '@endo/module-source';
import test from 'ava';
import fs from 'node:fs';
import path from 'node:path';
import {
  defaultParserForLanguage,
  parserForLanguageWithCjsBabel,
} from '../src/import-parsers.js';
import { scaffold } from './scaffold.js';

/**
 * @import {FixtureAssertionFn} from './test.types.js';
 * @import {ThirdPartyStaticModuleInterface} from 'ses'
 */

const fixture = new URL(
  'fixtures-cjs-compat/node_modules/app/index.js',
  import.meta.url,
).toString();
const fixtureDirname = new URL(
  'fixtures-cjs-compat/node_modules/app/dirname.js',
  import.meta.url,
).toString();
const fixtureDynamicImport = new URL(
  'fixtures-cjs-compat/node_modules/dynamic-import/index.js',
  import.meta.url,
).toString();
const fixtureReexportClobber = new URL(
  'fixtures-cjs-compat/node_modules/reexport-clobber/index.js',
  import.meta.url,
);
// Divergence probes: exercise cases where the character-level lexer (the
// `default` CJS parser) and the Babel analyzer (the `babel` CJS parser) are
// known to disagree, to observe exactly how each behaves in the
// compartment-mapper import pipeline.
const fixtureNonIdentifierExports = new URL(
  'fixtures-cjs-compat/node_modules/nonidentifier-exports/index.js',
  import.meta.url,
).toString();
const fixtureInvalidObjectLiteral = new URL(
  'fixtures-cjs-compat/node_modules/invalid-object-literal/index.js',
  import.meta.url,
).toString();

const q = JSON.stringify;
const { freeze } = Object;
/**
 * @type {FixtureAssertionFn<{requireResolvePaths: string[]}>}
 */
const assertFixture = (t, { namespace, testCategoryHint }) => {
  const { assertions, results } = namespace;

  assertions.packageExportsShenanigans();
  assertions.packageWithDefaultField();
  assertions.moduleWithDefaultField();
  assertions.parserStruggles();
  assertions.moduleWithCycle();
  assertions.defaultChangesAfterExec();
  assertions.packageNestedFile();
  assertions.requireExtensions();
  assertions.defaultExports();

  if (testCategoryHint === 'Location') {
    t.deepEqual(results.requireResolvePaths, [
      "Cannot find module '.'",
      '/skipped/fixtures-cjs-compat/node_modules/require-resolve/package.json',
      '/skipped/fixtures-cjs-compat/node_modules/require-resolve/nested/index.js',
      '/skipped/fixtures-cjs-compat/node_modules/require-resolve/nested/file.js',
      '/skipped/fixtures-cjs-compat/node_modules/require-resolve/nested/file.js.map',
      "Cannot find module './nested/file.missing'",
      '/skipped/fixtures-cjs-compat/node_modules/app/index.js',
      'fs',
      '/skipped/fixtures-cjs-compat/node_modules/nested-export/callBound.js',
      'Require stack:',
    ]);
  } else {
    t.deepEqual(results.requireResolvePaths, [
      "Cannot find module '.'",
      "Cannot find module './package.json'",
      "Cannot find module './nested'",
      "Cannot find module './nested/file.js'",
      "Cannot find module './nested/file.js.map'",
      "Cannot find module './nested/file.missing'",
      "Cannot find module 'app'",
      "Cannot find module 'fs'",
      "Cannot find module 'nested-export/callBound'",
      'Add requireResolve to Endo Compartment Mapper readPowers.',
    ]);
  }
  t.pass();
};

const fixtureAssertionCount = 2;

const parsersForLanguage = {
  default: defaultParserForLanguage,
  babel: parserForLanguageWithCjsBabel,
};

for (const [name, parserForLanguage] of Object.entries(parsersForLanguage)) {
  scaffold(
    `fixtures-cjs-compat-${name}`,
    test,
    fixture,
    assertFixture,
    fixtureAssertionCount,
    {
      parserForLanguage,
    },
  );

  // Exit module errors are also deferred
  scaffold(
    `fixtures-cjs-compat-exit-module-${name}`,
    test,
    fixture,
    assertFixture,
    fixtureAssertionCount,
    {
      additionalOptions: {
        importHook: async specifier => {
          throw Error(`${q(specifier)} is NOT an exit module.`);
        },
      },
      parserForLanguage,
    },
  );

  scaffold(
    `fixtures-cjs-compat-__dirname-${name}`,
    test,
    fixtureDirname,
    (t, { namespace, testCategoryHint }) => {
      if (testCategoryHint === 'Location') {
        const { __filename, __dirname } = namespace;
        t.is(__filename, path.join(__dirname, '/dirname.js'));
        t.assert(!__dirname.startsWith('file://'));
        t.notRegex(
          __dirname,
          /[\\/]$/,
          'Expected __dirname to NOT have a trailing slash',
        );
      } else {
        const { __filename, __dirname } = namespace;
        t.is(__dirname, null);
        t.is(__filename, null);
        t.pass();
      }
    },
    3,
    {
      parserForLanguage,
    },
  );

  scaffold(
    `fixtures-cjs-compat-dynamic-import-${name}`,
    test,
    fixtureDynamicImport,
    async (t, { namespace }) => {
      const dynamicNamespace =
        // @ts-expect-error - untyped
        await namespace.dynamicImport('a');
      t.is(dynamicNamespace.foo, 'foo');
    },
    1,
    {
      // NOTE: this should fail with parse-cjs, but not parse-cjs-babel
      knownFailure: name === 'default',
      parserForLanguage,
      additionalOptions: {
        importHook: async () => {
          /** @type {ThirdPartyStaticModuleInterface} */
          return freeze({
            imports: [],
            exports: ['foo'],
            execute: moduleExports => {
              moduleExports.foo = 'foo';
            },
          });
        },
      },
    },
  );

  scaffold(
    `fixtures-cjs-compat-dynamic-import-noNamespaceBox-${name}`,
    test,
    fixtureDynamicImport,
    async (t, { namespace }) => {
      const dynamicNamespace =
        // @ts-expect-error - untyped
        await namespace.dynamicImport('a');
      t.is(dynamicNamespace.foo, 'foo');
    },
    1,
    {
      // NOTE: this should fail with parse-cjs, but not parse-cjs-babel
      knownFailure: name === 'default',
      parserForLanguage,
      additionalOptions: {
        Compartment: class extends Compartment {
          constructor(options = {}) {
            super({ ...options, __noNamespaceBox__: true });
          }
        },
        importHook: async () => {
          /** @type {ThirdPartyStaticModuleInterface} */
          return freeze({
            imports: [],
            exports: ['foo'],
            execute: moduleExports => {
              moduleExports.foo = 'foo';
            },
          });
        },
      },
    },
  );

  // Both parsers now emit non-identifier export names: the `default` (lexer)
  // parser always did, and the `babel` parser now does too (it filters only
  // strict-reserved words — see the "Babel CJS analyzer detects non-identifier
  // export names" test below and the `non-identifiers` corpus entry in
  // `@endo/module-source`). This scaffold retains the naive identifier-only
  // expectation (`['default', 'valid']`) purely as a divergence probe, so it
  // remains a `knownFailure`; the diff shows exactly which non-identifier keys
  // now survive into the namespace for each parser.
  scaffold(
    `fixtures-cjs-compat-nonidentifier-exports-${name}`,
    test,
    fixtureNonIdentifierExports,
    (t, { namespace }) => {
      t.deepEqual(Object.keys(namespace).sort(), ['default', 'valid']);
    },
    1,
    {
      knownFailure: true,
      parserForLanguage,
    },
  );

  // this involves the export of a syntactically-invalid object literal; e.g.
  // `{ a = 5, b }`. The `babel` parser throws a `SyntaxError` at analysis time.
  // The `default` (lexer) parser "succeeds" at analysis but the module fails to
  // execute (evaluate hits the same `SyntaxError`). Both variants fail in
  // different ways.
  scaffold(
    `fixtures-cjs-compat-invalid-object-literal-${name}`,
    test,
    fixtureInvalidObjectLiteral,
    t => {
      // 1. This is never called.
      // 2. If it _was_ called, would it pass the test even if it failed assertions?
      t.pass();
    },
    1,
    {
      onError: (t, { error, title }) => {
        // this crap is here because we can't opt-out of the assertion count
        // (which is calculated based on the function under test)
        if (
          name === 'default' &&
          (title.endsWith('writeArchive / loadArchive') ||
            title.endsWith('writeArchive / importArchive'))
        ) {
          t.plan(3);
        }
        t.regex(error.message, /Invalid shorthand property initializer/);
      },
      parserForLanguage,
      shouldFailBeforeArchiveOperations: true,
    },
  );
}

// Regression test for re-export clobbering in the Babel CJS analyzer.
//
// `module.exports = require('./named')` registers `./named` as a re-export.
// A subsequent `module.exports = { ... }` reassignment must discard that
// re-export, matching the behavior of the character-level lexer (and Node).
// Otherwise the stale re-export leaks into the module record's `reexports`,
// which corrupts downstream consumers (e.g. the bundler's `export *`
// generation and the `moduleSourceHook`).
//
// NOTE: this is asserted at the analyzer level rather than via `importLocation`
// because compartment-mapper imports CJS through `makeThirdPartyModuleInstance`,
// which ignores a record's `reexports`. The leak is therefore invisible to the
// scaffold import tests but corrupts the record all the same.
test('Babel CJS analyzer clears re-exports when module.exports is clobbered', t => {
  const source = fs.readFileSync(fixtureReexportClobber, 'utf8');
  const record = new CjsModuleSource(source, {
    sourceUrl: fixtureReexportClobber.href,
  });

  t.false(
    record.reexports.includes('./named'),
    'stale re-export leaked into record after module.exports reassignment',
  );
  t.deepEqual([...record.exports].sort(), ['bar', 'default']);
});

// Non-identifier export names.
//
// Node.js and upstream `cjs-module-lexer` emit non-identifier export names
// verbatim. Only an ES module *binding* (local) name must be a valid
// identifier; the exported *name* can be an arbitrary string (e.g. via
// `export { local as 'weird name' }`). `CjsModuleSource` therefore only
// filters strict-reserved words, deliberately diverging from
// `@endo/cjs-module-analyzer` (which over-filters non-identifier names for
// reasons lost to history; see the `non-identifiers` corpus entry in
// `@endo/module-source`).
test('Babel CJS analyzer detects non-identifier export names (only reserved words filtered)', t => {
  const source = [
    `module.exports = { 'ab cd': foo };`,
    `exports['not identifier'] = 'asdf';`,
    `exports['@notidentifier'] = 'asdf';`,
    `Object.defineProperty(exports, "%notidentifier", { value: x });`,
    `exports.package = 'STRICT RESERVED!';`,
    `exports.var = 'RESERVED';`,
  ].join('\n');
  const record = new CjsModuleSource(source, { sourceUrl: 'index.js' });
  const exports = [...record.exports];

  t.true(exports.includes('ab cd'), `'ab cd' should be detected`);
  t.true(
    exports.includes('not identifier'),
    `'not identifier' should be detected`,
  );
  t.true(
    exports.includes('@notidentifier'),
    `'@notidentifier' should be detected`,
  );
  t.true(
    exports.includes('%notidentifier'),
    `'%notidentifier' (via defineProperty) should be detected`,
  );
  t.true(exports.includes('var'), `'var' should be detected`);
  t.false(
    exports.includes('package'),
    `'package' is strict-reserved and must remain filtered`,
  );
});

// Same regression, but for the esbuild-hint pattern
// (`0 && (module.exports = { ... }, __export(require(...)))`). A clobbering
// object assignment inside the hint must discard earlier re-exports while
// retaining re-exports declared within the same hint.
test('Babel CJS analyzer clears re-exports when esbuild hint clobbers module.exports', t => {
  const source = [
    `module.exports = require('./stale');`,
    `0 && (module.exports = { bar: 1 }, __export(require('./kept')));`,
  ].join('\n');
  const record = new CjsModuleSource(source, { sourceUrl: 'index.js' });

  t.false(
    record.reexports.includes('./stale'),
    'stale re-export leaked past esbuild-hint clobber',
  );
  t.true(
    record.reexports.includes('./kept'),
    'in-hint re-export was incorrectly dropped',
  );
});
