import 'ses';
import fs from 'fs';
import test from 'ava';
import {
  loadLocation,
  importLocation,
  makeArchive,
  writeArchive,
  parseArchive,
  loadArchive,
  importArchive,
} from '../index.js';
import { makeNodeReadPowers } from '../src/node-powers.js';

const fixture = new URL(
  'fixtures-0/node_modules/app/main.js',
  import.meta.url,
).toString();
const archiveFixture = new URL('app.agar', import.meta.url).toString();
const readPowers = makeNodeReadPowers(fs);

const globals = {
  globalProperty: 42,
  globalLexical: 'global', // should be overshadowed
};

const globalLexicals = {
  globalLexical: 'globalLexical',
};

const assertFixture = (t, namespace) => {
  const {
    avery,
    brooke,
    clarke,
    danny,
    evan,
    builtin,
    receivedGlobalProperty,
    receivedGlobalLexical,
    typecommon,
    typemodule,
    typehybrid,
    typeparsers,
  } = namespace;

  t.is(avery, 'Avery', 'exports avery');
  t.is(brooke, 'Brooke', 'exports brooke');
  t.is(clarke, 'Clarke', 'exports clarke');
  t.is(danny, 'Danny', 'exports danny');
  t.is(evan, 'Evan', 'exports evan');

  t.is(builtin, 'builtin', 'exports builtin');

  t.is(receivedGlobalProperty, globals.globalProperty, 'exports global');
  t.is(
    receivedGlobalLexical,
    globalLexicals.globalLexical,
    'exports global lexical',
  );
  t.deepEqual(
    typecommon,
    [42, 42, 42, 42],
    'type=common package carries exports',
  );
  t.deepEqual(
    typemodule,
    [42, 42, 42, 42],
    'type=module package carries exports',
  );
  t.deepEqual(
    typeparsers,
    [42, 42, 42, 42],
    'parsers-specifying package carries exports',
  );
  t.is(typehybrid, 42, 'type=module and module= package carries exports');
};

const fixtureAssertionCount = 12;

// The "create builtin" test prepares a builtin module namespace object that
// gets threaded into all subsequent tests to satisfy the "builtin" module
// dependency of the application package.

const builtinLocation = new URL(
  'fixtures-0/node_modules/builtin/builtin.js',
  import.meta.url,
).toString();

let modules;

async function setup() {
  if (modules !== undefined) {
    return;
  }
  const utility = await loadLocation(readPowers, builtinLocation);
  const { namespace } = await utility.import({ globals });
  // We pass the builtin module into the module map.
  modules = {
    builtin: namespace,
  };
}

test('loadLocation', async t => {
  t.plan(fixtureAssertionCount);
  await setup();

  const application = await loadLocation(readPowers, fixture);
  const { namespace } = await application.import({
    globals,
    globalLexicals,
    modules,
    Compartment,
  });
  assertFixture(t, namespace);
});

test('importLocation', async t => {
  t.plan(fixtureAssertionCount);
  await setup();

  const { namespace } = await importLocation(readPowers, fixture, {
    globals,
    globalLexicals,
    modules,
    Compartment,
  });
  assertFixture(t, namespace);
});

test('makeArchive / parseArchive', async t => {
  t.plan(fixtureAssertionCount);
  await setup();

  const archive = await makeArchive(readPowers, fixture);
  const application = await parseArchive(archive);
  const { namespace } = await application.import({
    globals,
    globalLexicals,
    modules,
    Compartment,
  });
  assertFixture(t, namespace);
});

test('makeArchive / parseArchive with a prefix', async t => {
  t.plan(fixtureAssertionCount);
  await setup();

  // Zip files support an arbitrary length prefix.
  const archive = await makeArchive(readPowers, fixture);
  const prefixArchive = new Uint8Array(archive.length + 10);
  prefixArchive.set(archive, 10);

  const application = await parseArchive(prefixArchive);
  const { namespace } = await application.import({
    globals,
    globalLexicals,
    modules,
    Compartment,
  });
  assertFixture(t, namespace);
});

test('writeArchive / loadArchive', async t => {
  t.plan(fixtureAssertionCount + 2);
  await setup();

  // Single file slot.
  let archive;
  const fakeRead = async path => {
    t.is(path, 'app.agar');
    return archive;
  };
  const fakeWrite = async (path, content) => {
    t.is(path, 'app.agar');
    archive = content;
  };

  await writeArchive(fakeWrite, readPowers, 'app.agar', fixture);
  const application = await loadArchive(fakeRead, 'app.agar');
  const { namespace } = await application.import({
    globals,
    globalLexicals,
    modules,
    Compartment,
  });
  assertFixture(t, namespace);
});

test('writeArchive / importArchive', async t => {
  t.plan(fixtureAssertionCount + 2);
  await setup();

  // Single file slot.
  let archive;
  const fakeRead = async path => {
    t.is(path, 'app.agar');
    return archive;
  };
  const fakeWrite = async (path, content) => {
    t.is(path, 'app.agar');
    archive = content;
  };

  await writeArchive(fakeWrite, readPowers, 'app.agar', fixture);
  const { namespace } = await importArchive(fakeRead, 'app.agar', {
    globals,
    globalLexicals,
    modules,
    Compartment,
  });
  assertFixture(t, namespace);
});

test('importArchive', async t => {
  t.log(`\
If this test fails, it is either because the archive format has changed in a
way that is not backward compatible with a prior version (checked-in as
test/app.agar) or the test fixture and corresponding assertions have changed.
In the latter case, running node test/app.agar-make.js will sync the fixture
with the current test fixture.`);
  t.plan(fixtureAssertionCount);
  await setup();

  const { namespace } = await importArchive(readPowers.read, archiveFixture, {
    globals,
    globalLexicals,
    modules,
    Compartment,
  });
  assertFixture(t, namespace);
});
