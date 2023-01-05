// import "./ses-lockdown.js";
import 'ses';
import test from 'ava';
import { scaffold, readPowers } from './scaffold.js';
import { loadLocation } from '../src/import.js';
import { makeArchive } from '../src/archive.js';
import { parseArchive } from '../src/import-archive.js';

const { read } = readPowers;

const fixture = new URL(
  'fixtures-policy/node_modules/app/index.js',
  import.meta.url,
).toString();

const globals = {
  redPill: 42,
  bluePill: 2,
  yellowPill: 3,
};
const policy = {
  resources: {
    '<root>': {
      globals: {
        bluePill: true,
      },
      packages: {
        alice: true,
        carol: true,
      },
    },
    alice: {
      globals: {
        redPill: true,
      },
    },
    'app>carol': {
      globals: {
        yellowPill: true,
      },
    },
  },
};

const expectations = {
  alice: { bluePill: 'undefined', redPill: 'number', yellowPill: 'undefined' },
  bob: { bluePill: 'number', redPill: 'undefined', yellowPill: 'undefined' },
  carol: { bluePill: 'undefined', redPill: 'undefined', yellowPill: 'number' },
};

test('policy - globals access', async t => {
  t.plan(1);

  const application = await loadLocation(read, fixture, {
    policy,
  });
  const {
    namespace: { alice, bob, carol },
  } = await application.import({
    globals,
    // globalLexicals explicitly ignored.
  });

  t.deepEqual({ alice, bob, carol }, expectations);
});

test('policy - built into archive', async t => {
  t.plan(1);
  const archive = await makeArchive(readPowers, fixture, {
    policy,
    dev: true,
  });
  const application = await parseArchive(archive, '<unknown>');
  const {
    namespace: { alice, bob, carol },
  } = await application.import({
    globals,
  });

  t.deepEqual({ alice, bob, carol }, expectations);
});

const assertFixture = (t, { namespace }) => {
  const { alice, bob, carol } = namespace;

  t.deepEqual({ alice, bob, carol }, expectations);
};

const fixtureAssertionCount = 1;

scaffold(
  'fixture-policy',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
  {
    addGlobals: globals,
    policy,
  },
);
