// import "./ses-lockdown.js";
import 'ses';
import test from 'ava';
import { moduleify, scaffold, sanitizePaths } from './scaffold.js';

function combineAssertions(...assertionFunctions) {
  return async (...args) => {
    for (const assertion of assertionFunctions) {
      // eslint-disable-next-line no-await-in-loop
      await assertion(...args);
    }
  };
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
      builtins: {
        // that's the one builtin name that scaffold is providing by default
        builtin: {
          attenuate: 'myattenuator',
          params: ['c'],
        },
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
const ANY = {
  globals: 'any',
  packages: 'any',
  builtins: 'any',
};
const anyPolicy = {
  entry: policy.entry,
  resources: {
    ...policy.resources,
    'alice>carol': ANY,
  },
};

const defaultExpectations = {
  namespace: moduleify({
    alice: {
      bluePill: 'undefined',
      redPill: 'number',
      purplePill: 'undefined',
    },
    bob: { bluePill: 'number', redPill: 'undefined', purplePill: 'undefined' },
    carol: {
      bluePill: 'undefined',
      redPill: 'undefined',
      purplePill: 'number',
    },
    nestedScopedBob: { scoped: 1 },
    scopedBob: { scoped: 1 },
    builtins: '{"a":1,"b":2,"default":{"a":1,"b":2}}',
    builtins2: '{"c":3,"default":{"c":3}}',
  }),
};
const anyExpectations = {
  namespace: moduleify({
    ...defaultExpectations.namespace,
    carol: { bluePill: 'number', redPill: 'number', purplePill: 'number' },
  }),
};
const powerlessCarolExpectations = {
  namespace: moduleify({
    ...defaultExpectations.namespace,
    carol: {
      bluePill: 'undefined',
      redPill: 'undefined',
      purplePill: 'undefined',
    },
  }),
};

const makeResultAssertions =
  expectations =>
  async (t, { namespace }) => {
    t.deepEqual(namespace, expectations.namespace);
  };

const assertNoPolicyBypassImport = async (t, { compartments }) => {
  await t.throwsAsync(
    () => compartments.find(c => c.name.includes('alice')).import('hackity'),
    { message: /Failed to load module "hackity" in package .*alice/ },
    'Attempting to import a package into a compartment despite policy should fail.',
  );
};

const assertTestAlwaysThrows = t => {
  t.fail('Expected it to throw.');
};

scaffold(
  'policy - enforcement',
  test,
  fixture,
  combineAssertions(
    makeResultAssertions(defaultExpectations),
    assertNoPolicyBypassImport,
  ),
  2, // expected number of assertions
  {
    addGlobals: globals,
    policy,
  },
);

scaffold(
  'policy - enforcement with "any" policy',
  test,
  fixture,
  combineAssertions(
    makeResultAssertions(anyExpectations),
    assertNoPolicyBypassImport,
  ),
  2, // expected number of assertions
  {
    addGlobals: globals,
    policy: anyPolicy,
  },
);

scaffold(
  'policy - attack - browser alias - with alias hint',
  test,
  fixtureAttack,
  assertTestAlwaysThrows,
  2, // expected number of assertions
  {
    shouldFailBeforeArchiveOperations: true,
    onError: (t, { error }) => {
      t.regex(error.message, /dan.*resolves.*hackity/);
      // see the snapshot for the error hint in the message
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
  'policy - attack - scoped module alias',
  test,
  fixture,
  assertTestAlwaysThrows,
  1, // expected number of assertions
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

const recursiveEdit = editor => originalPolicy => {
  const policyToAlter = JSON.parse(JSON.stringify(originalPolicy));
  const recur = obj => {
    if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        editor(key, obj);
        recur(obj[key]);
      }
    }
    return obj;
  };
  return recur(policyToAlter);
};
const mutationEdit = editor => originalPolicy => {
  const policyToAlter = JSON.parse(JSON.stringify(originalPolicy));
  editor(policyToAlter);
  return policyToAlter;
};

const skipCarol = mutationEdit(policyToAlter => {
  policyToAlter.resources['alice>carol'] = undefined;
});

const disallowCarol = mutationEdit(policyToAlter => {
  policyToAlter.resources.alice.packages['alice>carol'] = false;
});

const addAttenuatorForAllGlobals = recursiveEdit((key, obj) => {
  if (key === 'globals') {
    obj[key] = {
      attenuate: 'myattenuator',
      params: Object.keys(obj[key]),
    };
  }
});

const implicitAttenuator = recursiveEdit((key, obj) => {
  if (key === 'globals') {
    obj[key] = Object.keys(obj[key]);
  }
  if (key === 'builtin') {
    obj[key] = obj[key].params;
  }
});

const errorAttenuatorForAllGlobals = recursiveEdit((key, obj) => {
  if (key === 'globals') {
    obj[key] = {
      attenuate: 'myattenuator',
      params: ['pleaseThrow'],
    };
  }
});

const nestedAttenuator = recursiveEdit((key, obj) => {
  if (key === 'attenuate') {
    obj[key] = 'myattenuator/attenuate';
  }
  if (key === 'resources') {
    obj[key]['myattenuator/attenuate'] = obj[key].myattenuator;
  }
});

scaffold(
  'policy - allow skipping policy entries for powerless compartments',
  test,
  fixture,
  makeResultAssertions(powerlessCarolExpectations),
  1, // expected number of assertions
  {
    addGlobals: globals,
    policy: skipCarol(policy),
  },
);

scaffold(
  'policy - disallowed package with error hint',
  test,
  fixture,
  assertTestAlwaysThrows,
  2, // expected number of assertions
  {
    shouldFailBeforeArchiveOperations: true,
    onError: (t, { error }) => {
      t.regex(error.message, /Importing.*carol.*in.*alice.*not allowed/i);
      t.snapshot(sanitizePaths(error.message));
    },
    addGlobals: globals,
    policy: disallowCarol(policy),
  },
);

scaffold(
  'policy - globals attenuator',
  test,
  fixture,
  combineAssertions(
    makeResultAssertions(defaultExpectations),
    async (t, { compartments }) => {
      t.is(
        1,
        compartments.find(c => c.name.includes('alice')).globalThis
          .attenuatorFlag,
        'attenuator should have been called with access to globalThis',
      );
    },
  ),
  2, // expected number of assertions
  {
    addGlobals: globals,
    policy: addAttenuatorForAllGlobals(policy),
  },
);

scaffold(
  'policy - default attenuator',
  test,
  fixture,
  combineAssertions(
    makeResultAssertions(defaultExpectations),
    async (t, { compartments }) => {
      t.is(
        1,
        compartments.find(c => c.name.includes('alice')).globalThis
          .attenuatorFlag,
        'attenuator should have been called with access to globalThis',
      );
    },
  ),
  2, // expected number of assertions
  {
    addGlobals: globals,
    policy: {
      defaultAttenuator: 'myattenuator',
      ...implicitAttenuator(policy),
    },
  },
);

scaffold(
  'policy - attenuator error aggregation',
  test,
  fixture,
  assertTestAlwaysThrows,
  2, // expected number of assertions
  {
    onError: (t, { error }) => {
      const count = (string, substring) => string.split(substring).length - 1;
      t.is(
        count(error.message, 'Error while attenuating globals'),
        3,
        'attenuator errors should be aggregated',
      );
      t.snapshot(sanitizePaths(error.message));
    },
    addGlobals: globals,
    policy: errorAttenuatorForAllGlobals(policy),
  },
);

scaffold(
  'policy - exitModules import',
  test,
  fixture,
  makeResultAssertions(defaultExpectations),
  1, // expected number of assertions
  {
    addGlobals: globals,
    policy,
    additionalOptions: {
      modules: {},
      importHook: async specifier => {
        const ns = {
          a: 1,
          b: 2,
          c: 3,
        };
        return Object.freeze({
          imports: [],
          exports: Object.keys(ns),
          execute: moduleExports => {
            moduleExports.default = ns;
            Object.assign(moduleExports, ns);
          },
        });
      },
    },
  },
);

scaffold(
  'policy - nested export in attenuator',
  test,
  fixture,
  combineAssertions(
    makeResultAssertions(defaultExpectations),
    assertNoPolicyBypassImport,
  ),
  2, // expected number of assertions
  {
    addGlobals: globals,
    policy: nestedAttenuator(policy),
  },
);
