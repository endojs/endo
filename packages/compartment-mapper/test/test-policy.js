// import "./ses-lockdown.js";
import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

function sanitizePaths(text = '') {
  return text.replace(
    /file:\/\/[^'"]+\/compartment-mapper\/test\//g,
    'file://.../compartment-mapper/test/',
  );
}

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
  purplePill: 3,
};
const policy = {
  entry: {
    globals: {
      bluePill: true,
    },
    packages: {
      alice: true,
      '@ohmyscope/bob': true,
    },
    builtins: {
      // that's the one builtin name that scaffold is providing by default
      builtin: {
        attenuate: 'myattenuator',
        params: ['a', 'b'],
      },
    },
  },
  resources: {
    alice: {
      globals: {
        redPill: true,
      },
      packages: {
        'alice>carol': true,
      },
    },
    '@ohmyscope/bob': {
      packages: {
        alice: true,
      },
    },
    'alice>carol': {
      globals: {
        purplePill: true,
      },
    },
    myattenuator: {},
  },
};

const expectations = {
  alice: { bluePill: 'undefined', redPill: 'number', purplePill: 'undefined' },
  bob: { bluePill: 'number', redPill: 'undefined', purplePill: 'undefined' },
  carol: { bluePill: 'undefined', redPill: 'undefined', purplePill: 'number' },
  builtins: 'a,b',
};

const fixtureAssertionCount = 2;
const assertFixture = async (t, { namespace, compartments }) => {
  const { alice, bob, carol, builtins } = namespace;
  t.deepEqual({ alice, bob, carol, builtins }, expectations);

  await t.throwsAsync(
    () => compartments.find(c => c.name.includes('alice')).import('hackity'),
    { message: /Failed to load module "hackity" in package .*alice/ },
    'Attempting to import a package into a compartment despite polict should fail.',
  );
};

scaffold(
  'policy enforcement',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
  {
    addGlobals: globals,
    policy,
  },
);

const assertTestAlwaysThrows = t => {
  t.fail('Expected it to throw.');
};

scaffold(
  'insufficient policy detected early',
  test,
  fixture,
  assertTestAlwaysThrows,
  2,
  {
    shouldFailBeforeArchiveOperations: true,
    onError: (t, { error }) => {
      t.regex(error.message, /carol.*policy.*add/);
      t.snapshot(sanitizePaths(error.message));
    },
    addGlobals: globals,
    policy: {
      resources: {
        '<root>': {
          ...policy.resources['<root>'],
        },
        alice: {
          ...policy.resources.alice,
        },
      },
    },
    tags: new Set(['browser']),
  },
);

scaffold(
  'policy malfunction resulting in missing compartment',
  test,
  fixture,
  assertTestAlwaysThrows,
  2,
  {
    shouldFailBeforeArchiveOperations: true,
    onError: (t, { error }) => {
      t.regex(error.message, /carol.*is missing.*policy/);
      t.snapshot(sanitizePaths(error.message));
    },
    addGlobals: globals,
    policy: {
      entry: policy.entry,
      resources: {
        ...policy.resources,
        // not something that can would normally be specified, but passes policy validation while triggering an error later.
        'alice>carol': undefined,
      },
    },
    tags: new Set(['browser']),
  },
);

scaffold(
  'policy - attack - browser alias',
  test,
  fixtureAttack,
  assertTestAlwaysThrows,
  2,
  {
    shouldFailBeforeArchiveOperations: true,
    onError: (t, { error }) => {
      t.regex(error.message, /dan.*hackity.*disallowed/);
      t.snapshot(sanitizePaths(error.message));
    },
    addGlobals: globals,
    policy: {
      entry: {
        packages: {
          eve: true,
        },
      },
      resources: {
        eve: {
          packages: {
            dan: true,
          },
        },
        dan: {},
      },
    },
    // 'eve' defines a browser override for 'dan' pointing to 'hackity'
    tags: new Set(['browser']),
  },
);

// This should not be possible by spec. The browser override should be local file only.
// Left here to guard against accidentally extending support of the browser field beyond that.
scaffold(
  'policy - attack - scoped module alias attempt',
  test,
  fixture,
  assertTestAlwaysThrows,
  1,
  {
    onError: (t, { error }) => {
      t.regex(
        error.message,
        /Cannot find file for internal module ".\/hackity".*/,
      );
    },
    addGlobals: globals,
    policy,
    // This turns alice malicious - attempting to redirect alice.js to an outside module
    tags: new Set(['browser']),
  },
);
