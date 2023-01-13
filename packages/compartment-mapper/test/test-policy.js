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
const fixtureAttack = new URL(
  'fixtures-policy/node_modules/app/attack.js',
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
      builtin: {
        // that's the one builtin name that scaffold is providing by default
        builtin: {
          attenuate: 'myattenuator',
          params: ['a', 'b'],
        },
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
  builtins: 'a,b',
};

const assertFixture = (t, { namespace }) => {
  const { alice, bob, carol, builtins } = namespace;

  t.deepEqual({ alice, bob, carol, builtins }, expectations);
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

scaffold(
  'fixture-policy-attack',
  test,
  fixtureAttack,
  t => {
    // this test always throws
    t.fail('Expected it to throw.');
  },
  fixtureAssertionCount,
  {
    shouldFailBeforeArchiveOperations: true,
    onError: (t, { error, title }) => {
      t.regex(error.message, /Importing 'hackity' was not allowed by policy/);
    },
    addGlobals: globals,
    policy: {
      resources: {
        '<root>': {
          packages: {
            mallory: true,
          },
        },
        mallory: {
          packages: {
            dan: true,
          },
        },
      },
    },
    tags: new Set(['browser']),
  },
);
