/**
 * Compartment Mapper test for subpath pattern replacement.
 *
 * Uses the scaffold harness to exercise the fixture through all execution
 * paths (loadLocation, importLocation, makeArchive, parseArchive, etc.).
 *
 * The expected values match those asserted in node-parity-subpath-patterns.test.js,
 * so if both tests pass, the Compartment Mapper has parity with Node.js for
 * these cases.
 */
/** @import {ExecutionContext} from 'ava' */

import 'ses';
import test from 'ava';
import { ZipReader } from '@endo/zip';
import { scaffold, readPowers } from './scaffold.js';
import { importLocation, makeArchive } from '../index.js';
import {
  assertMain,
  assertConditionalBlue,
  assertConditionalDefault,
  assertPrecedence,
  assertImportsEdgeCasesDev,
} from './_subpath-patterns-assertions.js';

const fixture = new URL(
  'fixtures-package-imports-exports/node_modules/app/main.js',
  import.meta.url,
).toString();

const fixtureAssertionCount = 1;

/**
 * @param {ExecutionContext} t
 * @param {{namespace: object}} result
 */
const assertFixture = (t, { namespace }) => {
  assertMain(t, namespace);
};

scaffold(
  'subpath-patterns',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
);

test('patterns are stripped from archived compartment-map.json', async t => {
  const archive = await makeArchive(readPowers, fixture, {
    modules: {},
    Compartment,
  });
  const reader = new ZipReader(archive);
  const compartmentMapBytes = reader.files.get('compartment-map.json');
  t.truthy(compartmentMapBytes, 'archive contains compartment-map.json');
  const compartmentMap = JSON.parse(
    new TextDecoder().decode(compartmentMapBytes.content),
  );
  for (const [name, descriptor] of Object.entries(
    compartmentMap.compartments,
  )) {
    t.is(
      /** @type {any} */ (descriptor).patterns,
      undefined,
      `compartment ${name} should not have patterns in archive`,
    );
  }
});

test('conditional pattern resolves under user-specified condition', async t => {
  const conditionalFixture = new URL(
    'fixtures-package-imports-exports/node_modules/app/conditional-import.js',
    import.meta.url,
  ).toString();
  const { namespace } = await importLocation(readPowers, conditionalFixture, {
    conditions: new Set(['blue-moon']),
  });
  assertConditionalBlue(t, namespace);
});

test('conditional pattern falls back to default without user condition', async t => {
  const conditionalFixture = new URL(
    'fixtures-package-imports-exports/node_modules/app/conditional-import.js',
    import.meta.url,
  ).toString();
  const { namespace } = await importLocation(readPowers, conditionalFixture);
  assertConditionalDefault(t, namespace);
});

test('policy allows pattern-matched imports when package is permitted', async t => {
  const policy = {
    entry: { packages: { 'patterns-lib': true } },
    resources: { 'patterns-lib': {} },
  };
  const { namespace } = await importLocation(readPowers, fixture, { policy });
  assertMain(t, namespace);
});

test('policy rejects pattern-matched imports when package is not permitted', async t => {
  const policy = {
    entry: { packages: {} },
    resources: {},
  };
  await t.throwsAsync(() => importLocation(readPowers, fixture, { policy }));
});

test('array imports field in package.json causes an exception', async t => {
  const arrayImportsFixture = new URL(
    'fixtures-package-imports-exports/node_modules/array-imports-app/main.js',
    import.meta.url,
  ).toString();
  await t.throwsAsync(() => importLocation(readPowers, arrayImportsFixture), {
    message: /Cannot interpret package.json imports property, must be object/,
  });
});

test('imports edge cases: non-wildcard alias, conditional, null, invalid key, bad value, mismatched wildcard', async t => {
  const edgeCasesFixture = new URL(
    'fixtures-package-imports-exports/node_modules/imports-edge-cases-app/main.js',
    import.meta.url,
  ).toString();
  const { namespace } = await importLocation(readPowers, edgeCasesFixture, {
    conditions: new Set(['development']),
  });
  assertImportsEdgeCasesDev(t, namespace);
  // The following are exercised by graph construction but do not produce runtime exports:
  // - "invalid-key" (no # prefix): logged and skipped
  // - "#excluded": null (non-wildcard null target): skipped
  // - "#secret/*.js": null (wildcard null target): stored as pattern
  // - "#bad-value": 42 (unsupported value): logged and skipped
  // - "#mismatched/*" / "./mismatched-export/*": mismatched wildcard count
});

test('browser field and commonjs default module', async t => {
  const browserCjsFixture = new URL(
    'fixtures-package-imports-exports/node_modules/browser-cjs-app/main.js',
    import.meta.url,
  ).toString();
  // With the 'browser' condition, the browser field remaps ./src/main.js to
  // ./src/browser-main.js, exercising lines 420-433 in inferExportsAliasesAndPatterns.
  // The package has no exports/module fields and type != 'module', exercising
  // the commonjs default module path (lines 414-415).
  const { namespace } = await importLocation(readPowers, browserCjsFixture, {
    conditions: new Set(['browser']),
  });
  t.is(namespace.env, 'browser');
});

test('browser field as string remaps main export', async t => {
  const browserStringFixture = new URL(
    'fixtures-package-imports-exports/node_modules/browser-string-app/main.js',
    import.meta.url,
  ).toString();
  const { namespace } = await importLocation(readPowers, browserStringFixture, {
    conditions: new Set(['browser']),
  });
  t.is(namespace.env, 'browser-string');
});

test('exports edge cases: ./ key skipped, nested subpath with name != "."', async t => {
  const exportsEdgeCasesFixture = new URL(
    'fixtures-package-imports-exports/node_modules/exports-edge-cases-app/main.js',
    import.meta.url,
  ).toString();
  const { namespace } = await importLocation(
    readPowers,
    exportsEdgeCasesFixture,
  );
  t.is(namespace.main, 'exports-edge-cases-main');
  t.is(namespace.nested, 'nested-esm');
});

test('non-object exports field causes an exception', async t => {
  const badExportsFixture = new URL(
    'fixtures-package-imports-exports/node_modules/bad-exports-app/main.js',
    import.meta.url,
  ).toString();
  await t.throwsAsync(() => importLocation(readPowers, badExportsFixture), {
    message: /Cannot interpret package.json exports property/,
  });
});

test('non-string non-object browser field causes an exception', async t => {
  const badBrowserFixture = new URL(
    'fixtures-package-imports-exports/node_modules/bad-browser-app/main.js',
    import.meta.url,
  ).toString();
  await t.throwsAsync(
    () =>
      importLocation(readPowers, badBrowserFixture, {
        conditions: new Set(['browser']),
      }),
    {
      message: /Cannot interpret package.json browser property/,
    },
  );
});

test('null-target pattern excludes matching specifier', async t => {
  const nullTargetFixture = new URL(
    'fixtures-package-imports-exports/node_modules/app/null-target-import.js',
    import.meta.url,
  ).toString();
  await t.throwsAsync(() => importLocation(readPowers, nullTargetFixture), {
    message: /excluded by null target pattern/,
  });
});

test('pattern tie-break matches Node precedence rules', async t => {
  const precedenceFixture = new URL(
    'fixtures-package-imports-exports/node_modules/app/precedence-import.js',
    import.meta.url,
  ).toString();
  const { namespace } = await importLocation(readPowers, precedenceFixture);
  assertPrecedence(t, namespace);
});
