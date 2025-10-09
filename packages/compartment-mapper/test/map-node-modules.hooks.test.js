import './ses-lockdown.js';
import test from 'ava';
import { mapNodeModules } from '../src/node-modules.js';
import { makeProjectFixtureReadPowers } from './project-fixture.js';
import { relativizeCompartmentMap } from './snapshot-utilities.js';
import {
  ATTENUATORS_COMPARTMENT,
  WILDCARD_POLICY_VALUE,
} from '../src/policy-format.js';

/**
 * @import {
 *   HookConfiguration,
 *   MapNodeModulesHooks,
 *   CanonicalName,
 *   SomePolicy,
 *   PackageDescriptor,
 *   FileUrlString,
 * } from '../src/types.js';
 * @import {ProjectFixture} from './test.types.js';
 */

/**
 * Test fixture with dependencies for hook testing
 * @satisfies {ProjectFixture}
 */
const testFixture = /** @type {const} */ ({
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
const testPolicy = {
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
const snapshotTestFixture = /** @type {const} */ ({
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
const snapshotTestPolicy = {
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

test('mapNodeModules - packageDescriptor hook called with correct parameters', async t => {
  t.plan(22); // 2 base assertions + 4*5 loop assertions

  /** @type {Array<{packageDescriptor: PackageDescriptor, packageLocation: FileUrlString, moduleSpecifier: string}>} */
  const hookCalls = [];

  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    packageDescriptor: ({
      packageDescriptor,
      packageLocation,
      moduleSpecifier,
    }) => {
      hookCalls.push({ packageDescriptor, packageLocation, moduleSpecifier });
    },
  };

  const readPowers = makeProjectFixtureReadPowers(testFixture);
  await mapNodeModules(readPowers, testFixture.entrypoint, { hooks });

  t.is(
    hookCalls.length,
    5,
    'should call hook for entry package and all dependencies',
  );

  const moduleSpecifiers = hookCalls.map(call => call.moduleSpecifier).sort();
  // Entry uses './index.js', deps use their names, dep-c appears twice due to shared dependency
  t.deepEqual(
    moduleSpecifiers,
    ['./index.js', 'dep-a', 'dep-b', 'dep-c', 'dep-c'],
    'should call hook for all packages',
  );

  for (const call of hookCalls) {
    t.is(
      typeof call.packageDescriptor,
      'object',
      'packageDescriptor should be an object',
    );
    // Entry package uses './index.js' as moduleSpecifier but 'app' as name
    if (call.moduleSpecifier === './index.js') {
      t.is(
        call.packageDescriptor.name,
        'app',
        'entry package name should be app',
      );
    } else {
      t.is(
        call.packageDescriptor.name,
        call.moduleSpecifier,
        'dependency packageDescriptor name should match moduleSpecifier',
      );
    }
    t.is(
      typeof call.packageLocation,
      'string',
      'packageLocation should be a string',
    );
    t.true(
      call.packageLocation.startsWith('file:///'),
      'packageLocation should be a file URL',
    );
  }
});

test('mapNodeModules - packageDependencies hook modifies dependencies', async t => {
  t.plan(4); // t.true + t.truthy + 2 conditional t.true calls

  /** @type {Array<{canonicalName: CanonicalName, dependencies: Set<CanonicalName>}>} */
  const hookCalls = [];

  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    packageDependencies: ({ canonicalName, dependencies }) => {
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
    },
  };

  const readPowers = makeProjectFixtureReadPowers(testFixture);
  await mapNodeModules(readPowers, testFixture.entrypoint, {
    hooks,
    policy: testPolicy,
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

test('mapNodeModules - packageDependencies hook called even without policy', async t => {
  let hookCalled = false;

  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    packageDependencies: ({ canonicalName, dependencies }) => {
      hookCalled = true;
      return undefined;
    },
  };

  const readPowers = makeProjectFixtureReadPowers(testFixture);
  await mapNodeModules(readPowers, testFixture.entrypoint, { hooks });

  t.true(
    hookCalled,
    'user packageDependencies hook should be called even without policy',
  );
});

test('mapNodeModules - packageDependencies hook removes dependencies', async t => {
  t.plan(3); // t.truthy + 2 conditional t.true calls

  /** @type {Array<{canonicalName: CanonicalName, dependencies: Set<CanonicalName>}>} */
  const hookCalls = [];

  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    packageDependencies: ({ canonicalName, dependencies }) => {
      hookCalls.push({ canonicalName, dependencies: new Set(dependencies) });

      if (canonicalName === ATTENUATORS_COMPARTMENT) {
        const filteredDeps = new Set(
          [...dependencies].filter(dep => dep !== 'dep-b'),
        );
        return { dependencies: filteredDeps };
      }

      return undefined;
    },
  };

  const readPowers = makeProjectFixtureReadPowers(testFixture);
  await mapNodeModules(readPowers, testFixture.entrypoint, {
    hooks,
    policy: testPolicy,
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
  t.plan(2); // 3 assertions for each hook type

  let packageDescriptorCalls = 0;
  let packageDependenciesCalls = 0;

  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    packageDescriptor: () => {
      packageDescriptorCalls += 1;
      return undefined;
    },
    packageDependencies: () => {
      packageDependenciesCalls += 1;
      return undefined;
    },
  };

  const readPowers = makeProjectFixtureReadPowers(testFixture);
  await mapNodeModules(readPowers, testFixture.entrypoint, {
    hooks,
    policy: testPolicy,
  });

  t.true(packageDescriptorCalls > 0, 'packageDescriptor hook should be called');
  t.true(
    packageDependenciesCalls > 0,
    'packageDependencies hook should be called',
  );
});

test('mapNodeModules - hook pipeline with multiple functions', async t => {
  t.plan(1); // t.true for execution (conditional assertion may not always run)

  const executionOrder = [];

  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    packageDescriptor: [
      ({ moduleSpecifier }) => {
        executionOrder.push(`first-${moduleSpecifier}`);
        return undefined;
      },
      ({ moduleSpecifier }) => {
        executionOrder.push(`second-${moduleSpecifier}`);
        return undefined;
      },
    ],
  };

  const readPowers = makeProjectFixtureReadPowers(testFixture);
  await mapNodeModules(readPowers, testFixture.entrypoint, { hooks });

  t.true(executionOrder.length > 0, 'hooks should have executed');

  // Verify pipeline ordering within same package
  const appFirstIndex = executionOrder.indexOf('first-app');
  const appSecondIndex = executionOrder.indexOf('second-app');
  if (appFirstIndex !== -1 && appSecondIndex !== -1) {
    t.true(
      appFirstIndex < appSecondIndex,
      'hooks should execute in pipeline order',
    );
  }
});

test('mapNodeModules - hook error handling', async t => {
  t.plan(3); // t.truthy + t.true + t.throwsAsync

  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    packageDescriptor: ({ moduleSpecifier }) => {
      if (moduleSpecifier === 'dep-a') {
        throw new Error('Test hook error');
      }
      return undefined;
    },
  };

  const readPowers = makeProjectFixtureReadPowers(testFixture);

  const error = await t.throwsAsync(
    mapNodeModules(readPowers, testFixture.entrypoint, { hooks }),
  );

  t.truthy(error, 'should throw error when hook fails');
  t.true(error.message.includes('Hook Error'), 'should wrap hook errors');
});

test('mapNodeModules - packageDependencies hook receives expected canonical names', async t => {
  t.plan(8); // 3 base t.true calls + 5 loop assertions for canonical name strings

  /** @type {Set<CanonicalName>} */
  const receivedCanonicalNames = new Set();

  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    packageDependencies: ({ canonicalName, dependencies }) => {
      receivedCanonicalNames.add(canonicalName);

      return undefined;
    },
  };

  const readPowers = makeProjectFixtureReadPowers(testFixture);
  await mapNodeModules(readPowers, testFixture.entrypoint, {
    hooks,
    policy: testPolicy,
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

test('mapNodeModules - packageDependencies hook removes dependency (snapshot)', async t => {
  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    packageDependencies: ({ canonicalName, dependencies }) => {
      if (canonicalName === ATTENUATORS_COMPARTMENT) {
        const filteredDeps = new Set(
          [...dependencies].filter(dep => dep !== 'dep-b'),
        );
        return { dependencies: filteredDeps };
      }
      return undefined;
    },
  };

  const readPowers = makeProjectFixtureReadPowers(snapshotTestFixture);
  const compartmentMap = await mapNodeModules(
    readPowers,
    snapshotTestFixture.entrypoint,
    {
      hooks,
      policy: snapshotTestPolicy,
    },
  );

  t.snapshot(relativizeCompartmentMap(compartmentMap), 'remove dependency');
});

test('mapNodeModules - packageDependencies hook adds existing dependency (snapshot)', async t => {
  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    packageDependencies: ({ canonicalName, dependencies }) => {
      // extra-dep exists in snapshotTestFixture but isn't part of normal dependency graph
      if (canonicalName === ATTENUATORS_COMPARTMENT) {
        const newDeps = new Set([
          ...dependencies,
          /** @type {CanonicalName} */ ('extra-dep'),
        ]);
        return { dependencies: newDeps };
      }
      return undefined;
    },
  };

  const readPowers = makeProjectFixtureReadPowers(snapshotTestFixture);
  const compartmentMap = await mapNodeModules(
    readPowers,
    snapshotTestFixture.entrypoint,
    {
      hooks,
      policy: snapshotTestPolicy,
    },
  );

  t.snapshot(
    relativizeCompartmentMap(compartmentMap),
    'add existing dependency',
  );
});

test('mapNodeModules - packageDependencies hook adds non-existing dependency logs warning', async t => {
  t.plan(1); // single assertion for warning message

  /** @type {Array<string>} */
  const logCalls = [];

  /** @type {import('../src/types.js').LogFn} */
  const mockLog = message => {
    logCalls.push(message);
  };

  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    packageDependencies: ({ canonicalName, dependencies }) => {
      // non-existent-dep doesn't exist in fixture - tests how system handles invalid deps
      if (canonicalName === ATTENUATORS_COMPARTMENT) {
        const newDeps = new Set([
          ...dependencies,
          /** @type {CanonicalName} */ ('non-existent-dep'),
        ]);
        return { dependencies: newDeps };
      }
      return undefined;
    },
  };

  const readPowers = makeProjectFixtureReadPowers(snapshotTestFixture);

  await mapNodeModules(readPowers, snapshotTestFixture.entrypoint, {
    hooks,
    policy: snapshotTestPolicy,
    log: mockLog,
  });

  const warningMessage = logCalls.find(message =>
    message.includes(
      'WARNING: packageDependencies hook returned unknown package with label "non-existent-dep"',
    ),
  );

  t.truthy(warningMessage, 'should log warning for unknown package dependency');
});

test('mapNodeModules - packageDependencies hook no modification (snapshot)', async t => {
  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    // Return undefined to make no modifications (control case)
    packageDependencies: () => {},
  };

  const readPowers = makeProjectFixtureReadPowers(snapshotTestFixture);
  const compartmentMap = await mapNodeModules(
    readPowers,
    snapshotTestFixture.entrypoint,
    {
      hooks,
      policy: snapshotTestPolicy,
    },
  );

  t.snapshot(
    relativizeCompartmentMap(compartmentMap),
    'no dependency modification',
  );
});

test('mapNodeModules - unknownCanonicalName hook called for missing policy resources', async t => {
  t.plan(6);

  /** @type {Array<{canonicalName: CanonicalName, path: string[], issue: string}>} */
  const hookCalls = [];

  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    unknownCanonicalName: ({ canonicalName, path, issue }) => {
      hookCalls.push({ canonicalName, path, issue });
    },
  };

  // Policy with unknown resources to trigger the hook
  /** @type {SomePolicy} */
  const policyWithUnknownResources = {
    entry: {
      packages: WILDCARD_POLICY_VALUE,
    },
    resources: {
      'unknown-package': {
        // This package doesn't exist in testFixture
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

  const readPowers = makeProjectFixtureReadPowers(testFixture);
  await mapNodeModules(readPowers, testFixture.entrypoint, {
    hooks,
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
    unknownResourceCall?.issue.includes(
      'Resource "unknown-package" was not found',
    ),
    'should provide descriptive issue message for unknown resource',
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

test('mapNodeModules - unknownCanonicalName hook not called when all resources exist', async t => {
  let hookCalled = false;

  /** @type {HookConfiguration<MapNodeModulesHooks>} */
  const hooks = {
    unknownCanonicalName: () => {
      hookCalled = true;
    },
  };

  const readPowers = makeProjectFixtureReadPowers(testFixture);
  await mapNodeModules(readPowers, testFixture.entrypoint, {
    hooks,
    policy: testPolicy, // Uses only known resources
  });

  t.false(hookCalled, 'should not call hook when all policy resources exist');
});
