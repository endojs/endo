/* global globalThis */

import 'ses';
import test from 'ava';
import { loadLocation, importArchive, makeBundle } from '../index.js';
import { scaffold, readPowers, setup } from './scaffold.js';

const fixture = new URL(
  'fixtures-0/node_modules/app/main.js',
  import.meta.url,
).toString();
const archiveFixture = new URL('app.agar', import.meta.url).toString();

const assertFixture = (t, { namespace, globals, testCategoryHint }) => {
  const {
    avery,
    brooke,
    clarke,
    danny,
    builtin,
    receivedGlobalProperty,
    typecommon,
    typemodule,
    typemoduleImplied,
    typeparsers,
    importMetaUrl,
  } = namespace;

  if (testCategoryHint === 'Location') {
    // matching any character where / or \ would be
    t.regex(importMetaUrl, /fixtures-0.node_modules.app.main\.js$/);
  } else {
    t.is(importMetaUrl, undefined);
  }

  t.is(avery, 'Avery', 'exports avery');
  t.is(brooke, 'Brooke', 'exports brooke');
  t.is(clarke, 'Clarke', 'exports clarke');
  t.is(danny, 'Danny', 'exports danny');

  t.is(builtin, 'builtin', 'exports builtin');

  t.is(receivedGlobalProperty, globals.globalProperty, 'exports global');
  t.deepEqual(
    typecommon,
    [42, 42, 42, 42, 42],
    'type=common package carries exports',
  );
  t.deepEqual(
    typemodule,
    [42, 42, 42, 42, 42],
    'type=module package carries exports',
  );
  t.deepEqual(
    typeparsers,
    [42, 42, 42, 42, 42],
    'parsers-specifying package carries exports',
  );
  t.deepEqual(
    typemoduleImplied,
    [42, 42, 42, 42, 42],
    'module= package carries exports',
  );
};

const fixtureAssertionCount = 11;

scaffold('fixture-0', test, fixture, assertFixture, fixtureAssertionCount);

test('importArchive', async t => {
  t.log(`\
If this test fails, it is either because the archive format has changed in a
way that is not backward compatible with a prior version (checked-in as
test/app.agar) or the test fixture and corresponding assertions have changed.
In the latter case, running node test/app.agar-make.js will sync the fixture
with the current test fixture.`);
  t.plan(fixtureAssertionCount);
  const { globals, modules } = await setup();

  const { namespace } = await importArchive(readPowers.read, archiveFixture, {
    globals,
    modules,
    Compartment,
  });
  assertFixture(t, { namespace, globals });
});

test('makeBundle / importArchive', async t => {
  t.plan(fixtureAssertionCount);

  const archiverLocation = new URL(
    '../src/import-archive.js',
    import.meta.url,
  ).toString();

  const archiverBundle = await makeBundle(readPowers.read, archiverLocation);
  const archiverCompartment = new Compartment({
    globals: {
      TextEncoder,
      TextDecoder,
      URL,
      // See https://github.com/Agoric/agoric-sdk/issues/9515
      assert: globalThis.assert,
    },
    __options__: true,
  });
  const evasiveArchiverBundle = archiverBundle
    .replace(/(?<!\.)\bimport\b(?![:"'])/g, 'IMPORT')
    .replace(/\beval\b/g, 'EVAL');
  const { importArchive: bundledImportArchive } = archiverCompartment.evaluate(
    evasiveArchiverBundle,
  );

  const { globals, modules } = await setup();

  const { namespace } = await bundledImportArchive(
    readPowers.read,
    archiveFixture,
    {
      globals,
      modules,
      Compartment,
    },
  );
  assertFixture(t, { namespace, globals });
});

test('no dev dependencies', async t => {
  const { globals, modules } = await setup();

  await t.throwsAsync(
    async () => {
      const application = await loadLocation(readPowers, fixture, {
        modules,
      });
      await application.import({
        globals,
        modules,
        Compartment,
      });
    },
    // TODO: relax the assertion to match any of the dev dependencies regardless of loading order
    {
      message: /Cannot find external module "typemodule"/,
    },
  );
});

test('no transitive dev dependencies', async t => {
  const { globals, modules } = await setup();

  const noTransitiveDevDepencenciesFixture = new URL(
    'fixtures-no-trans-dev-deps/node_modules/app/index.js',
    import.meta.url,
  ).toString();
  await t.throwsAsync(
    async () => {
      const application = await loadLocation(
        readPowers,
        noTransitiveDevDepencenciesFixture,
        {
          conditions: new Set(['development']),
        },
      );
      await application.import({
        globals,
        modules,
        Compartment,
      });
    },
    {
      message: /Cannot find external module "indirect"/,
    },
  );
});

scaffold(
  'fixtures-resolve',
  test,
  new URL(
    'fixtures-resolve/node_modules/path-with-dot/main.js',
    import.meta.url,
  ).toString(),
  (t, { namespace }) => {
    t.is(namespace.question, '?', 'correct exports');
    t.is(namespace.answer, 42, 'correct exports');
  },
  2,
);

scaffold(
  'fixtures-resolve/browser',
  test,
  new URL(
    'fixtures-resolve/node_modules/browser/main.js',
    import.meta.url,
  ).toString(),
  (t, { namespace: { results } }) => {
    t.deepEqual(results, {
      answer1: 200,
      answer2: 200,
      answer3: 200,
      answer4: 200,
      answer5: 200,
      answer6: 200,
      answer7: 200,
      answer8: 200,
      answer9: 200,
      answer10: 200,
    });
  },
  1,
  { conditions: new Set(['browser']) },
);

scaffold(
  'fixtures-resolve/exports-field',
  test,
  new URL(
    'fixtures-resolve/node_modules/exports-field/main.js',
    import.meta.url,
  ).toString(),
  (t, { namespace: { results } }) => {
    t.deepEqual(results, {
      answer1: 99,
      answer2: 77,
      answer3: 44,
      answer4: 77,
      answer5: 99,
    });
  },
  1,
);

scaffold(
  'package root as main via internalAlias',
  test,
  new URL(
    'fixtures-0/node_modules/excalibur/src/sword.js',
    import.meta.url,
  ).toString(),
  (t, { namespace: { sword } }) => {
    t.is(typeof sword, 'string');
    t.is(sword.length, 30);
  },
  2,
);

scaffold(
  'overwrite searchSuffixes',
  test,
  new URL(
    'fixtures-0/node_modules/candidates-custom/index.js',
    import.meta.url,
  ).toString(),
  (t, { namespace: { fourthPrime } }) => {
    t.is(fourthPrime, 7);
  },
  1,
  {
    searchSuffixes: ['.abc.js'],
  },
);

scaffold(
  'provide commonDependencies',
  test,
  new URL(
    'fixtures-common-deps/node_modules/app/index.js',
    import.meta.url,
  ).toString(),
  (t, { namespace: { status } }) => {
    t.is(status, 101);
  },
  1,
  {
    commonDependencies: {
      'unlisted-common-dep': 'common-dep-target',
    },
  },
);
