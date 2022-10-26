import 'ses';
import test from 'ava';
import { loadLocation, importArchive } from '../index.js';
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
          dev: true,
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
