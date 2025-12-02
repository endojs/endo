// @ts-nocheck
// import "./ses-lockdown.js";
import 'ses';
import test from 'ava';
import { moduleify, scaffold, sanitizePaths } from './scaffold.js';
import {
  WILDCARD_POLICY_VALUE,
  ATTENUATORS_COMPARTMENT,
  ENTRY_COMPARTMENT,
} from '../src/policy-format.js';
import { makePackagePolicy } from '../src/policy.js';

function combineAssertions(...assertionFunctions) {
  return async (...args) => {
    await null;
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
  globals: WILDCARD_POLICY_VALUE,
  packages: WILDCARD_POLICY_VALUE,
  builtins: WILDCARD_POLICY_VALUE,
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

const assertExternalModuleNotFound = async (
  t,
  { compartments, testCategoryHint },
) => {
  await null;
  if (testCategoryHint === 'Archive') {
    await t.throwsAsync(
      () => compartments.find(c => c.name.includes('alice')).import('hackity'),
      {
        message:
          /importing "hackity" in "alice" was not allowed by "builtins" policy/i,
      },
      'Attempting to import a missing package into a compartment should fail.',
    );
  } else {
    await t.throwsAsync(
      () => compartments.find(c => c.name.includes('alice')).import('hackity'),
      {
        message: /cannot find external module "hackity"/i,
      },
      'Attempting to import a missing package into a compartment should fail.',
    );
  }
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
    assertExternalModuleNotFound,
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
    assertExternalModuleNotFound,
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
    onError: (t, { error, testCategoryHint }) => {
      if (testCategoryHint === 'Archive') {
        t.regex(error.message, /unknown resources found in policy/i);
        t.snapshot(sanitizePaths(error.message), 'archive case error message');
      } else {
        t.regex(error.message, /cannot find external module/i);
        t.snapshot(sanitizePaths(error.message), 'location case error message');
      }
      // see the snapshot for the error hint in the message
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
    conditions: new Set(['browser']),
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
    conditions: new Set(['browser']),
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
      t.regex(error.message, /cannot find external module "carol"/i);
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
    assertExternalModuleNotFound,
  ),
  2, // expected number of assertions
  {
    addGlobals: globals,
    policy: nestedAttenuator(policy),
  },
);

// Unit tests for makePackagePolicy
test('makePackagePolicy() - no policy provided', t => {
  t.is(makePackagePolicy('alice'), undefined);
  t.is(makePackagePolicy(ATTENUATORS_COMPARTMENT), undefined);
  t.is(makePackagePolicy(ENTRY_COMPARTMENT), undefined);
  t.is(makePackagePolicy('alice', {}), undefined);
});

test('makePackagePolicy() - ATTENUATORS_COMPARTMENT label', t => {
  const testPolicy = {
    defaultAttenuator: 'myattenuator',
    entry: { packages: { alice: true } },
    resources: {},
  };

  const result = makePackagePolicy(ATTENUATORS_COMPARTMENT, {
    policy: testPolicy,
  });

  t.deepEqual(result, {
    defaultAttenuator: 'myattenuator',
    packages: WILDCARD_POLICY_VALUE,
  });
});

test('makePackagePolicy() - ATTENUATORS_COMPARTMENT label without defaultAttenuator', t => {
  const testPolicy = {
    entry: { packages: { alice: true } },
    resources: {},
  };

  const result = makePackagePolicy(ATTENUATORS_COMPARTMENT, {
    policy: testPolicy,
  });

  t.deepEqual(result, {
    defaultAttenuator: undefined,
    packages: WILDCARD_POLICY_VALUE,
  });
});

test('makePackagePolicy() - ENTRY_COMPARTMENT label', t => {
  const entryPolicy = {
    globals: { bluePill: true },
    packages: { alice: true },
    builtins: { builtin: { attenuate: 'myattenuator', params: ['a', 'b'] } },
  };
  const testPolicy = {
    defaultAttenuator: 'myattenuator',
    entry: entryPolicy,
    resources: {},
  };

  const result = makePackagePolicy(ENTRY_COMPARTMENT, { policy: testPolicy });

  t.is(result, entryPolicy);
  t.deepEqual(result, entryPolicy);
});

test('makePackagePolicy() - ENTRY_COMPARTMENT label with undefined entry', t => {
  const testPolicy = {
    defaultAttenuator: 'myattenuator',
    resources: {},
  };

  const result = makePackagePolicy(ENTRY_COMPARTMENT, { policy: testPolicy });

  t.is(result, undefined);
});

test('makePackagePolicy() - regular canonical name that exists in resources', t => {
  const resourcePolicy = {
    packages: { 'alice>carol': true },
  };
  const testPolicy = {
    entry: { packages: { alice: true } },
    resources: {
      alice: resourcePolicy,
    },
  };

  const result = makePackagePolicy('alice', { policy: testPolicy });

  t.is(result, resourcePolicy);
  t.deepEqual(result, resourcePolicy);
});

test('makePackagePolicy() - regular canonical name that does not exist in resources', t => {
  const testPolicy = {
    entry: { packages: { alice: true } },
    resources: {
      alice: { globals: { santorum: true } },
    },
  };

  const result = makePackagePolicy('nonexistent', { policy: testPolicy });

  t.not(result, undefined);
  t.is(Object.getPrototypeOf(result), null);
  t.deepEqual(result, {});
  t.is(Object.keys(result).length, 0);
});

test('makePackagePolicy() - regular canonical name with resources undefined', t => {
  const testPolicy = {
    entry: { packages: { alice: true } },
  };

  const result = makePackagePolicy('alice', { policy: testPolicy });

  t.not(result, undefined);
  t.is(Object.getPrototypeOf(result), null);
  t.deepEqual(result, {});
  t.is(Object.keys(result).length, 0);
});

test('makePackagePolicy() - empty label throws', t => {
  const testPolicy = {
    entry: { packages: { alice: true } },
    resources: {
      alice: { globals: { santorum: true } },
    },
  };

  t.throws(() => makePackagePolicy(null, { policy: testPolicy }), {
    message: /Invalid arguments: label must be a non-empty string; got null/i,
  });
  t.throws(() => makePackagePolicy(undefined, { policy: testPolicy }), {
    message:
      /Invalid arguments: label must be a non-empty string; got undefined/i,
  });
  t.throws(() => makePackagePolicy('', { policy: testPolicy }), {
    message: /Invalid arguments: label must be a non-empty string; got ""/i,
  });
});

test('makePackagePolicy() - preserves object reference for entry', t => {
  const entryPolicy = { packages: { alice: true } };
  const testPolicy = {
    entry: entryPolicy,
    resources: {},
  };

  const result = makePackagePolicy(ENTRY_COMPARTMENT, { policy: testPolicy });

  t.is(result, entryPolicy);
});

test('makePackagePolicy() - preserves object reference for resources', t => {
  const resourcePolicy = { globals: { redPill: true } };
  const testPolicy = {
    entry: { packages: { alice: true } },
    resources: {
      alice: resourcePolicy,
    },
  };

  const result = makePackagePolicy('alice', { policy: testPolicy });

  t.is(result, resourcePolicy);
});

test('makePackagePolicy() - empty resources object returns empty package policy', t => {
  const testPolicy = {
    entry: { packages: { alice: true } },
    resources: {},
  };

  const result = makePackagePolicy('alice', { policy: testPolicy });

  t.deepEqual(result, {});
});
