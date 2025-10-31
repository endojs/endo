/* eslint-disable no-shadow */
import 'ses';

import fs from 'node:fs';
import url from 'node:url';
import test from 'ava';
import path from 'node:path';
import { mapNodeModules } from '../src/node-modules.js';
import { makeReadPowers } from '../src/node-powers.js';
import {
  dumpCompartmentMap,
  dumpProjectFixture,
  makeProjectFixtureReadPowers,
} from './project-fixture.js';
import { relativizeCompartmentMap } from './snapshot-utilities.js';
import {
  ATTENUATORS_COMPARTMENT,
  WILDCARD_POLICY_VALUE,
} from '../src/policy-format.js';

const dirname = url.fileURLToPath(new URL('.', import.meta.url));

/**
 * @import {ProjectFixture} from './test.types.js'
 * @import {FileUrlString, MapNodeModulesOptions, MaybeReadPowers, PackageCompartmentMapDescriptor, CanonicalName, SomePolicy, PackageDescriptor, UnknownCanonicalNameHook, PackageDependenciesHook, LogFn} from '../src/types.js'
 */

const { keys, values } = Object;

/**
 * The expected canonical name of `goofy` in the tests using {@link phonyFixture}
 */
const CORRECT_CANONICAL_NAME = 'paperino>topolino>goofy';

/**
 * `ReadPowers` for on-disk fixtures
 */
const readPowers = makeReadPowers({ fs, url });

/**
 * In-memory project fixture
 * @see {@link makeProjectFixtureReadPowers}
 * @satisfies {ProjectFixture}
 */
const phonyFixture = /** @type {const} */ ({
  root: 'app',
  graph: {
    app: ['pippo', 'paperino'],
    paperino: ['topolino'],
    pippo: ['gambadilegno'],
    gambadilegno: ['topolino'],
    topolino: ['goofy'],
  },
  entrypoint: 'file:///node_modules/app/index.js',
});

test(`mapNodeModules() should return compartment descriptors containing shortest path`, async t => {
  const shortestPathFixture = new URL(
    'fixtures-shortest-path/node_modules/app/index.js',
    import.meta.url,
  ).href;

  const compartmentMap = await mapNodeModules(readPowers, shortestPathFixture);

  const compartmentDescriptor = values(compartmentMap.compartments).find(
    compartment => compartment.label === CORRECT_CANONICAL_NAME,
  );

  // not using AVA's assertions here because assertion types are not assert-style type guards (they just return `void`) which prevents the need for type assertions on `compartmentDescriptor` after
  if (!compartmentDescriptor) {
    t.fail(
      `compartment descriptor for '${CORRECT_CANONICAL_NAME}' should exist, but it does not`,
    );
    return;
  }
  t.is(
    compartmentDescriptor.label,
    CORRECT_CANONICAL_NAME,
    `compartment descriptor should have canonical name: ${CORRECT_CANONICAL_NAME}`,
  );
});

test.serial(
  'mapNodeModules() should consider peerDependenciesMeta without corresponding peerDependencies when the dependency is present',
  async t => {
    t.plan(2);
    const moduleLocation = new URL(
      'fixtures-optional-peer-dependencies/node_modules/app/index.js',
      import.meta.url,
    ).href;

    const compartmentMap = await mapNodeModules(readPowers, moduleLocation);

    t.is(keys(compartmentMap.compartments).length, 2);
    t.assert(
      values(compartmentMap.compartments).find(
        compartment => compartment.name === 'paperina',
      ),
    );
  },
);

test('mapNodeModules() should not consider peerDependenciesMeta without corresponding peerDependencies when the dependency is missing', async t => {
  const moduleLocation = new URL(
    'fixtures-missing-optional-peer-dependencies/node_modules/app/index.js',
    import.meta.url,
  ).href;
  const compartmentMap = await mapNodeModules(readPowers, moduleLocation);

  t.is(keys(compartmentMap.compartments).length, 1);
});

{
  /**
   * We will iterate at most _n_ times to trigger path flakiness
   */
  const shortestPathTestCount = 20;

  test(`mapNodeModules() should be path stable`, async t => {
    await null;

    t.plan(shortestPathTestCount);
    /** @type {string|undefined} */
    let expectedCanonicalName;

    const targetLabel = 'paperino>topolino>goofy';

    const readPowers = makeProjectFixtureReadPowers(phonyFixture, {
      randomDelay: true,
    });

    for (let i = 0; i < shortestPathTestCount; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const compartmentMap = await mapNodeModules(
        readPowers,
        phonyFixture.entrypoint,
      );

      const compartmentDescriptor = Object.values(
        compartmentMap.compartments,
      ).find(compartment => compartment.label === targetLabel);
      if (!compartmentDescriptor) {
        t.fail(
          `compartment descriptor for '${targetLabel}' should exist, but it does not`,
        );

        dumpProjectFixture(t, phonyFixture);
        dumpCompartmentMap(t, compartmentMap);
        return;
      }

      const { label } = compartmentDescriptor;
      if (!label) {
        t.fail(
          `label for '${compartmentDescriptor.name}' should exist, but it does not`,
        );

        dumpProjectFixture(t, phonyFixture);
        dumpCompartmentMap(t, compartmentMap);
        return;
      }

      if (i === 0) {
        expectedCanonicalName = label;
        t.log(
          `Canonical name of compartment '${targetLabel}': ${expectedCanonicalName}`,
        );
      }

      try {
        t.is(label, /** @type {any} */ (expectedCanonicalName));
      } catch (err) {
        dumpProjectFixture(t, phonyFixture);
        dumpCompartmentMap(t, compartmentMap);
        throw err;
      }
    }
  });
}

/**
 * @typedef StabilityFixtureConfig
 * @property {string} entrypoint
 * @property {MaybeReadPowers} readPowers
 * @property {MapNodeModulesOptions} [options]
 */

/**
 * Configuration of all fixtures to test for stable generation of a {@link PackageCompartmentMapDescriptor}
 * @type {Array<StabilityFixtureConfig>}
 */
const fixtureConfigs = [
  {
    entrypoint: phonyFixture.entrypoint,
    readPowers: makeProjectFixtureReadPowers(phonyFixture, {
      randomDelay: true,
    }),
  },
  {
    entrypoint: new URL(
      'fixtures-shortest-path/node_modules/app/index.js',
      import.meta.url,
    ).href,
    readPowers,
  },
  {
    entrypoint: new URL(
      'fixtures-optional-peer-dependencies/node_modules/app/index.js',
      import.meta.url,
    ).href,
    readPowers,
  },
  {
    entrypoint: new URL(
      'fixtures-missing-optional-peer-dependencies/node_modules/app/index.js',
      import.meta.url,
    ).href,
    readPowers,
  },
  {
    entrypoint: new URL(
      'fixtures-policy/node_modules/app/index.js',
      import.meta.url,
    ).href,
    readPowers,
    options: {
      policy: {
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
      },
    },
  },
];

for (const { entrypoint, readPowers, options } of fixtureConfigs) {
  const relativeEntrypoint = entrypoint.startsWith(`file://${dirname}`)
    ? path.relative(dirname, url.fileURLToPath(entrypoint))
    : entrypoint;
  test(`mapNodeModules() should be idempotent for ${relativeEntrypoint}`, async t => {
    const compartmentMap = await mapNodeModules(
      readPowers,
      entrypoint,
      options,
    );

    t.snapshot(relativizeCompartmentMap(compartmentMap));
  });
}

/**
 * Test fixture with dependencies for hook testing
 * @satisfies {ProjectFixture}
 */
const hookTestFixture = /** @type {const} */ ({
  root: 'app',
  graph: {
    app: ['dep-a', 'dep-b'],
    'dep-a': ['dep-c'],
    'dep-b': ['dep-c'],
    'dep-c': [],
  },
  entrypoint: 'file:///node_modules/app/index.js',
});

/**
 * Policy for testing packageDependencies hook
 * @type {SomePolicy}
 */
const hookTestPolicy = {
  entry: {
    packages: WILDCARD_POLICY_VALUE,
  },
  resources: {
    'dep-a': {
      packages: {
        'dep-a>dep-c': true,
      },
    },
    'dep-b': {
      packages: {
        'dep-a>dep-c': true,
      },
    },
  },
};

/**
 * Test fixture with extra dependencies for snapshot testing
 * @satisfies {ProjectFixture}
 */
const packageDependenciesHookFixture = /** @type {const} */ ({
  root: 'app',
  graph: {
    app: ['dep-a', 'dep-b'],
    'dep-a': ['dep-c'],
    'dep-b': ['dep-c'],
    'dep-c': [],
    'extra-dep': ['dep-c'], // Extra dep that exists in the fixture
  },
  entrypoint: 'file:///node_modules/app/index.js',
});

/**
 * Policy for snapshot testing with packageDependencies hook
 * @type {SomePolicy}
 */
const packageDependenciesHookPolicy = {
  entry: {
    packages: WILDCARD_POLICY_VALUE,
  },
  resources: {
    'dep-a': {
      packages: {
        'dep-a>dep-c': true,
      },
    },
    'dep-b': {
      packages: {
        'dep-a>dep-c': true,
      },
    },
    // extra-dep omitted from policy to test dynamic addition via hooks
  },
};

test('mapNodeModules - packageDataHook - called with correct parameters', async t => {
  /** @type {Map<string, any> | undefined} */
  let receivedPackageData;

  const packageDataHook = ({ packageData, log }) => {
    receivedPackageData = packageData;
    t.is(typeof log, 'function', 'log should be a function');
  };

  const hookReadPowers = makeProjectFixtureReadPowers(hookTestFixture);
  await mapNodeModules(hookReadPowers, hookTestFixture.entrypoint, {
    packageDataHook,
  });

  t.truthy(receivedPackageData, 'packageData should be provided');
  if (!receivedPackageData) {
    return;
  }

  t.true(
    typeof receivedPackageData.size === 'number' &&
      typeof receivedPackageData.has === 'function',
    'packageData should be a Map',
  );

  // Expected canonical names: $root$, dep-a, dep-b, dep-a>dep-c
  t.is(
    receivedPackageData.size,
    4,
    'should include entry package and all unique dependencies',
  );

  // Verify each package data has the correct structure
  for (const [canonicalName, packageData] of receivedPackageData) {
    t.is(typeof packageData.name, 'string', 'name should be a string');
    t.is(
      typeof packageData.packageDescriptor,
      'object',
      'packageDescriptor should be an object',
    );
    t.is(typeof packageData.location, 'string', 'location should be a string');
    t.true(
      packageData.location.startsWith('file:///'),
      'location should be a file URL',
    );
    t.is(
      packageData.canonicalName,
      canonicalName,
      'canonicalName should match map key',
    );
  }
});

test('mapNodeModules - packageDependenciesHook modifies dependencies', async t => {
  t.plan(4);

  /** @type {Array<{canonicalName: CanonicalName, dependencies: Set<CanonicalName>}>} */
  const hookCalls = [];

  /** @type {PackageDependenciesHook} */
  const packageDependenciesHook = ({ canonicalName, dependencies }) => {
    hookCalls.push({ canonicalName, dependencies: new Set(dependencies) });

    // Only modify attenuators compartment which holds actual dependency relationships
    if (canonicalName === ATTENUATORS_COMPARTMENT) {
      const newDeps = new Set([
        ...dependencies,
        /** @type {CanonicalName} */ ('added-dep'),
      ]);
      return { dependencies: newDeps };
    }

    return undefined;
  };

  const hookReadPowers = makeProjectFixtureReadPowers(hookTestFixture);
  await mapNodeModules(hookReadPowers, hookTestFixture.entrypoint, {
    packageDependenciesHook,
    policy: hookTestPolicy,
  });

  t.true(hookCalls.length > 0, 'hook should have been called');

  const attenuatorsCall = hookCalls.find(
    call => call.canonicalName === ATTENUATORS_COMPARTMENT,
  );
  t.truthy(
    attenuatorsCall,
    'hook should have been called for attenuators compartment',
  );
  if (attenuatorsCall) {
    t.true(
      attenuatorsCall.dependencies.has('dep-a'),
      'should include original dependency dep-a',
    );
    t.true(
      attenuatorsCall.dependencies.has('dep-b'),
      'should include original dependency dep-b',
    );
  }
});

test('mapNodeModules - packageDependenciesHook called even without policy', async t => {
  let hookCalled = false;

  /** @type {PackageDependenciesHook} */
  const packageDependenciesHook = () => {
    hookCalled = true;
    return undefined;
  };

  const hookReadPowers = makeProjectFixtureReadPowers(hookTestFixture);
  await mapNodeModules(hookReadPowers, hookTestFixture.entrypoint, {
    packageDependenciesHook,
  });

  t.true(
    hookCalled,
    'user packageDependencies hook should be called even without policy',
  );
});

test('mapNodeModules - packageDependenciesHook removes dependencies', async t => {
  t.plan(3);

  /** @type {Array<{canonicalName: CanonicalName, dependencies: Set<CanonicalName>}>} */
  const hookCalls = [];

  /** @type {PackageDependenciesHook} */
  const packageDependenciesHook = ({ canonicalName, dependencies }) => {
    hookCalls.push({ canonicalName, dependencies: new Set(dependencies) });

    if (canonicalName === ATTENUATORS_COMPARTMENT) {
      const filteredDeps = new Set(
        [...dependencies].filter(dep => dep !== 'dep-b'),
      );
      return { dependencies: filteredDeps };
    }

    return undefined;
  };

  const hookReadPowers = makeProjectFixtureReadPowers(hookTestFixture);
  await mapNodeModules(hookReadPowers, hookTestFixture.entrypoint, {
    packageDependenciesHook,
    policy: hookTestPolicy,
  });

  const attenuatorsCall = hookCalls.find(
    call => call.canonicalName === ATTENUATORS_COMPARTMENT,
  );
  t.truthy(
    attenuatorsCall,
    'hook should have been called for attenuators compartment',
  );
  if (attenuatorsCall) {
    t.true(
      attenuatorsCall.dependencies.has('dep-a'),
      'should include original dependency dep-a',
    );
    // Test shows dep-b present before hook filtering removes it
    t.true(
      attenuatorsCall.dependencies.has('dep-b'),
      'should include original dependency dep-b before filtering',
    );
  }
});

test('mapNodeModules - multiple hooks work together', async t => {
  t.plan(2);

  let packageDataCalled = false;
  let packageDependenciesCalls = 0;

  const packageDataHook = () => {
    packageDataCalled = true;
  };

  /** @type {PackageDependenciesHook} */
  const packageDependenciesHook = () => {
    packageDependenciesCalls += 1;
    return undefined;
  };

  const hookReadPowers = makeProjectFixtureReadPowers(hookTestFixture);
  await mapNodeModules(hookReadPowers, hookTestFixture.entrypoint, {
    packageDataHook,
    packageDependenciesHook,
    policy: hookTestPolicy,
  });

  t.true(packageDataCalled, 'packageData hook should be called');
  t.true(
    packageDependenciesCalls > 0,
    'packageDependencies hook should be called',
  );
});

test('mapNodeModules - packageDataHook - hook error handling', async t => {
  t.plan(3);

  const packageDataHook = ({ packageData }) => {
    // Check if dep-a is in the packageData
    if ([...packageData.keys()].some(key => key.includes('dep-a'))) {
      throw new Error('Test hook error');
    }
  };

  const hookReadPowers = makeProjectFixtureReadPowers(hookTestFixture);

  const error = await t.throwsAsync(
    mapNodeModules(hookReadPowers, hookTestFixture.entrypoint, {
      packageDataHook,
    }),
  );

  t.truthy(error, 'should throw error when hook fails');
  t.true(
    error.message.includes('Test hook error'),
    'should propagate hook errors',
  );
});

test('mapNodeModules - packageDependenciesHook receives expected canonical names', async t => {
  t.plan(8);

  /** @type {Set<CanonicalName>} */
  const receivedCanonicalNames = new Set();

  /** @type {PackageDependenciesHook} */
  const packageDependenciesHook = ({ canonicalName, dependencies }) => {
    receivedCanonicalNames.add(canonicalName);

    return undefined;
  };

  const hookReadPowers = makeProjectFixtureReadPowers(hookTestFixture);
  await mapNodeModules(hookReadPowers, hookTestFixture.entrypoint, {
    packageDependenciesHook,
    policy: hookTestPolicy,
  });

  t.true(
    receivedCanonicalNames.size > 0,
    'hook should be called for some canonical names',
  );

  t.true(
    receivedCanonicalNames.has(ATTENUATORS_COMPARTMENT),
    'hook should be called for attenuators compartment',
  );

  const canonicalNamesArray = [...receivedCanonicalNames].sort();
  t.true(canonicalNamesArray.length > 0, 'should receive some canonical names');

  for (const name of canonicalNamesArray) {
    t.is(typeof name, 'string', `canonical name ${name} should be a string`);
  }
});

test('mapNodeModules - packageDependenciesHook removes dependency (snapshot)', async t => {
  /** @type {PackageDependenciesHook} */
  const packageDependenciesHook = ({ canonicalName, dependencies }) => {
    if (canonicalName === ATTENUATORS_COMPARTMENT) {
      const filteredDeps = new Set(
        [...dependencies].filter(dep => dep !== 'dep-b'),
      );
      return { dependencies: filteredDeps };
    }
    return undefined;
  };

  const hookReadPowers = makeProjectFixtureReadPowers(
    packageDependenciesHookFixture,
  );
  const compartmentMap = await mapNodeModules(
    hookReadPowers,
    packageDependenciesHookFixture.entrypoint,
    {
      packageDependenciesHook,
      policy: packageDependenciesHookPolicy,
    },
  );

  t.snapshot(relativizeCompartmentMap(compartmentMap), 'remove dependency');
});

test('mapNodeModules - packageDependenciesHook adds existing dependency (snapshot)', async t => {
  /** @type {PackageDependenciesHook} */
  const packageDependenciesHook = ({ canonicalName, dependencies }) => {
    // extra-dep exists in snapshotTestFixture but isn't part of normal dependency graph
    if (canonicalName === ATTENUATORS_COMPARTMENT) {
      const newDeps = new Set([
        ...dependencies,
        /** @type {CanonicalName} */ ('extra-dep'),
      ]);
      return { dependencies: newDeps };
    }
    return undefined;
  };

  const hookReadPowers = makeProjectFixtureReadPowers(
    packageDependenciesHookFixture,
  );
  const compartmentMap = await mapNodeModules(
    hookReadPowers,
    packageDependenciesHookFixture.entrypoint,
    {
      packageDependenciesHook,
      policy: packageDependenciesHookPolicy,
    },
  );

  t.snapshot(
    relativizeCompartmentMap(compartmentMap),
    'add existing dependency',
  );
});

test('mapNodeModules - packageDependenciesHook adds non-existing dependency logs warning', async t => {
  t.plan(1); // single assertion for warning message

  /** @type {Array<string>} */
  const logCalls = [];

  /** @type {LogFn} */
  const mockLog = message => {
    logCalls.push(message);
  };

  /** @type {PackageDependenciesHook} */
  const packageDependenciesHook = ({ canonicalName, dependencies }) => {
    // non-existent-dep doesn't exist in fixture - tests how system handles invalid deps
    if (canonicalName === ATTENUATORS_COMPARTMENT) {
      const newDeps = new Set([
        ...dependencies,
        /** @type {CanonicalName} */ ('non-existent-dep'),
      ]);
      return { dependencies: newDeps };
    }
    return undefined;
  };

  const hookReadPowers = makeProjectFixtureReadPowers(
    packageDependenciesHookFixture,
  );

  await mapNodeModules(
    hookReadPowers,
    packageDependenciesHookFixture.entrypoint,
    {
      packageDependenciesHook,
      policy: packageDependenciesHookPolicy,
      log: mockLog,
    },
  );

  const warningMessage = logCalls.find(message =>
    message.includes(
      'WARNING: packageDependencies hook returned unknown package with label "non-existent-dep"',
    ),
  );

  t.truthy(warningMessage, 'should log warning for unknown package dependency');
});

test('mapNodeModules - packageDependenciesHook - no modification (snapshot)', async t => {
  // Return undefined to make no modifications (control case)
  /** @type {PackageDependenciesHook} */
  const packageDependenciesHook = () => {};

  const hookReadPowers = makeProjectFixtureReadPowers(
    packageDependenciesHookFixture,
  );
  const compartmentMap = await mapNodeModules(
    hookReadPowers,
    packageDependenciesHookFixture.entrypoint,
    {
      packageDependenciesHook,
      policy: packageDependenciesHookPolicy,
    },
  );

  t.snapshot(
    relativizeCompartmentMap(compartmentMap),
    'no dependency modification',
  );
});

test('mapNodeModules - unknownCanonicalNameHook called for missing policy resources', async t => {
  t.plan(6);

  /** @type {Array<{canonicalName: CanonicalName, path: string[], message: string}>} */
  const hookCalls = [];

  const unknownCanonicalNameHook = ({ canonicalName, path, message }) => {
    hookCalls.push({ canonicalName, path, message });
  };

  // Policy with unknown resources to trigger the hook
  /** @type {SomePolicy} */
  const policyWithUnknownResources = {
    entry: {
      packages: WILDCARD_POLICY_VALUE,
    },
    resources: {
      'unknown-package': {
        // This package doesn't exist in hookTestFixture
        packages: {
          'dep-a': true,
        },
      },
      'dep-a': {
        // This exists
        packages: {
          'dep-a>dep-c': true, // This exists
          'unknown-nested-package': true, // This doesn't exist
        },
      },
    },
  };

  const hookReadPowers = makeProjectFixtureReadPowers(hookTestFixture);
  await mapNodeModules(hookReadPowers, hookTestFixture.entrypoint, {
    unknownCanonicalNameHook,
    policy: policyWithUnknownResources,
  });

  t.is(hookCalls.length, 2, 'should call hook for each unknown canonical name');

  // Check hook call for unknown top-level resource
  const unknownResourceCall = hookCalls.find(
    call => call.canonicalName === 'unknown-package',
  );
  t.truthy(unknownResourceCall, 'should call hook for unknown resource');
  t.deepEqual(
    unknownResourceCall?.path,
    ['resources', 'unknown-package'],
    'should provide correct path for unknown resource',
  );
  t.true(
    unknownResourceCall?.message.includes(
      'Resource "unknown-package" was not found',
    ),
    'should provide descriptive message for unknown resource',
  );

  // Check hook call for unknown nested package
  const unknownPackageCall = hookCalls.find(
    call => call.canonicalName === 'unknown-nested-package',
  );
  t.truthy(unknownPackageCall, 'should call hook for unknown nested package');
  t.deepEqual(
    unknownPackageCall?.path,
    ['resources', 'dep-a', 'packages', 'unknown-nested-package'],
    'should provide correct path for unknown nested package',
  );
});

test('mapNodeModules - unknownCanonicalNameHook not called when all resources exist', async t => {
  let hookCalled = false;

  /** @type {UnknownCanonicalNameHook} */
  const unknownCanonicalNameHook = () => {
    hookCalled = true;
  };

  const hookReadPowers = makeProjectFixtureReadPowers(hookTestFixture);
  await mapNodeModules(hookReadPowers, hookTestFixture.entrypoint, {
    unknownCanonicalNameHook,
    policy: hookTestPolicy, // Uses only known resources
  });

  t.false(hookCalled, 'should not call hook when all policy resources exist');
});

test('mapNodeModules - unknownCanonicalNameHook includes suggestions when available', async t => {
  /** @type {Array<{canonicalName: CanonicalName, path: string[], message: string, suggestion?: CanonicalName}>} */
  const hookCalls = [];

  /** @type {UnknownCanonicalNameHook} */
  const unknownCanonicalNameHook = ({
    canonicalName,
    path,
    message,
    suggestion,
  }) => {
    hookCalls.push({ canonicalName, path, message, suggestion });
  };

  // Policy with typos that should trigger suggestions
  /** @type {SomePolicy} */
  const policyWithTypo = {
    entry: {
      packages: WILDCARD_POLICY_VALUE,
    },
    resources: {
      'dep-aa': {
        // Not close enough to 'dep-a' to suggest, but contains 'dep-c'
        // which should suggest 'dep-a>dep-c'
        packages: {
          'dep-c': true,
        },
      },
    },
  };

  const hookReadPowers = makeProjectFixtureReadPowers(hookTestFixture);
  await mapNodeModules(hookReadPowers, hookTestFixture.entrypoint, {
    unknownCanonicalNameHook,
    policy: policyWithTypo,
  });

  t.is(
    hookCalls.length,
    2,
    'should call hook twice for both unknown resources',
  );

  // Check the call for the unknown top-level resource (no close suggestion)
  const unknownResourceCall = hookCalls.find(
    call => call.canonicalName === 'dep-aa',
  );
  t.truthy(unknownResourceCall, 'should call hook for unknown resource');
  t.deepEqual(
    unknownResourceCall?.path,
    ['resources', 'dep-aa'],
    'should provide correct path for unknown resource',
  );
  t.true(
    unknownResourceCall?.message.includes('Resource "dep-aa" was not found'),
    'should provide descriptive message for unknown resource',
  );
  t.is(
    unknownResourceCall?.suggestion,
    undefined,
    'should not suggest when no close match exists',
  );

  // Check the call for the nested package (should have suggestion)
  const nestedPackageCall = hookCalls.find(
    call => call.canonicalName === 'dep-c',
  );
  t.truthy(nestedPackageCall, 'should call hook for nested unknown package');
  t.deepEqual(
    nestedPackageCall?.path,
    ['resources', 'dep-aa', 'packages', 'dep-c'],
    'should provide correct path for nested unknown package',
  );
  t.true(
    nestedPackageCall?.message.includes(
      'Resource "dep-c" from resource "dep-aa" was not found',
    ),
    'should provide descriptive message for nested unknown package',
  );
  t.is(
    nestedPackageCall?.suggestion,
    'dep-a>dep-c',
    'should suggest the closest matching canonical name',
  );
});

test('mapNodeModules - packageDataHook provides all package data', async t => {
  t.plan(1);

  /** @type {Set<CanonicalName>} */
  let receivedCanonicalNames = new Set();

  const packageDataHook = ({ packageData }) => {
    receivedCanonicalNames = new Set([...packageData.keys()].sort());
  };

  const hookReadPowers = makeProjectFixtureReadPowers(hookTestFixture);
  await mapNodeModules(hookReadPowers, hookTestFixture.entrypoint, {
    packageDataHook,
  });

  // Expected canonical names based on the test fixture:
  // - $root$ (the entry package 'app' becomes '$root$')
  // - dep-a (direct dependency)
  // - dep-b (direct dependency)
  // - dep-a>dep-c (transitive dependency through dep-a)
  const expectedCanonicalNames = new Set(
    ['$root$', 'dep-a', 'dep-b', 'dep-a>dep-c'].sort(),
  );

  t.deepEqual(
    receivedCanonicalNames,
    expectedCanonicalNames,
    'should receive exactly the expected canonical names from the project fixture',
  );
});
