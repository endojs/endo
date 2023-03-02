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
  namespace: {
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
    scopedBob: { scoped: 1 },
    builtins: 'a,b',
  },
};
const anyExpectations = {
  namespace: {
    ...defaultExpectations.namespace,
    carol: { bluePill: 'number', redPill: 'number', purplePill: 'number' },
  },
};

const makeResultAssertions =
  expectations =>
  async (t, { namespace }) => {
    t.deepEqual(namespace, expectations.namespace);
  };

const assertNoPolicyBypassImport = async (
  t,
  { compartments, testCategoryHint },
) => {
  // scaffold for bundle could not possibly be instrumented with Compartment
  if (testCategoryHint === 'Bundle') {
    return t.assert(true);
  }
  await t.throwsAsync(
    () => compartments.find(c => c.name.includes('alice')).import('hackity'),
    { message: /Failed to load module "hackity" in package .*alice/ },
    'Attempting to import a package into a compartment despite policy should fail.',
  );
};

const assertAttenuatorGotGlobalThis = (
  t,
  { compartments, testCategoryHint },
) => {
  // scaffold for bundle could not possibly be instrumented with Compartment
  if (testCategoryHint === 'Bundle') {
    return t.assert(true);
  }
  t.is(
    1,
    compartments.find(c => c.name.includes('alice')).globalThis.attenuatorFlag,
    'attenuator should have been called with access to globalThis',
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
  'policy - insufficient policy detected early',
  test,
  fixture,
  assertTestAlwaysThrows,
  2, // expected number of assertions
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
  'policy - malfunction resulting in missing compartment',
  test,
  fixture,
  assertTestAlwaysThrows,
  2, // expected number of assertions
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
  2, // expected number of assertions
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
      Object.keys(obj).forEach(key => {
        editor(key, obj);
        recur(obj[key]);
      });
    }
    return obj;
  };
  return recur(policyToAlter);
};

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

scaffold(
  'policy - globals attenuator',
  test,
  fixture,
  combineAssertions(
    makeResultAssertions(defaultExpectations),
    assertAttenuatorGotGlobalThis,
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
    assertAttenuatorGotGlobalThis,
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
