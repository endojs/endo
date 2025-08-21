/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-shadow */
import 'ses';

import fs from 'node:fs';
import url from 'node:url';
import test from 'ava';
import Module from 'node:module';
import { applyCompartmentMapTransforms } from '../src/compartment-map-transforms/index.js';
import {
  createReferencesByPolicyTransform,
  enforcePolicyTransform,
} from '../src/compartment-map-transforms/transforms.js';
import { mapNodeModules } from '../src/node-modules.js';
import {
  ATTENUATORS_COMPARTMENT,
  ENTRY_COMPARTMENT,
  WILDCARD_POLICY_VALUE,
} from '../src/policy-format.js';
import { captureFromMap } from '../capture-lite.js';
import { defaultParserForLanguage } from '../archive-parsers.js';
import { makeReadPowers } from '../src/node-powers.js';
import {
  stripCaptureResult,
  stripCompartmentMap,
} from './snapshot-utilities.js';

/**
 * @import {
 *   CompartmentDescriptor,
 *   ModuleDescriptorConfiguration,
 *   CompartmentMapDescriptor,
 *   CompartmentMapTransformFn,
 *   SomePolicy,
 *   SomePackagePolicy,
 *   LogFn,
 *   ExitModuleImportHook,
 *   PackageCompartmentDescriptor,
 *   PackageCompartmentMapDescriptor,
 *   PackageCompartmentDescriptors,
 *   FileUrlString,
 * } from '../src/types.js';
 * @import {CanonicalNameMap} from '../src/types/node-modules.js';
 * @import {ThirdPartyStaticModuleInterface} from 'ses';
 */

const { freeze, keys, assign, entries, fromEntries, isFrozen } = Object;

/**
 * Applies defaults to a dummy {@link CompartmentDescriptor} for testing.
 *
 * @param {Partial<PackageCompartmentDescriptor>} [compartmentDescriptor]
 * @returns {PackageCompartmentDescriptor}
 */
const makeCompartmentDescriptor = (compartmentDescriptor = {}) => {
  const {
    name = '<unknown>',
    path = [],
    label,
    scopes = {},
    modules = {},
    policy,
    types = {},
    parsers = {},
    ...rest
  } = compartmentDescriptor;
  // keep reference!
  return assign(compartmentDescriptor, {
    name,
    label: label ?? name,
    modules,
    policy,
    scopes,
    location: `file://${name}`,
    types,
    parsers,
    path,
    packageDescriptor: { name },
    sourceDirname: name,
    ...rest,
  });
};

/**
 * Creates a dummy {@link CompartmentMapDescriptor} for testing.
 *
 * @param {string} [entry]
 * @param {object} [options]
 * @param {Record<string, PackageCompartmentDescriptor>} [options.compartments]
 * @returns {PackageCompartmentMapDescriptor}
 */
const makeCompartmentMap = (
  entry = 'file://root',
  { compartments = { 'file://root': makeCompartmentDescriptor() } } = {},
) => {
  entry = entry.startsWith('file://') ? entry : `file://${entry}`;
  const map = {
    entry: {
      compartment: /** @type {FileUrlString} */ (entry),
      module: 'main',
    },
    compartments: /** @type {PackageCompartmentDescriptors} */ (
      fromEntries(
        entries(compartments).map(([name, descriptor]) => {
          if (name !== ATTENUATORS_COMPARTMENT && !name.startsWith('file://')) {
            name = `file://${name}`;
          }
          return [name, makeCompartmentDescriptor(descriptor)];
        }),
      )
    ),
    tags: ['test'],
  };
  assert(entry in map.compartments, `Entry compartment "${entry}" not found`);
  return map;
};

/**
 * No-op log function for compartment map transform tests
 * @type {LogFn}
 */
const log = () => {};

test('enforcePolicyTransform - removes modules per policy', async t => {
  t.plan(2);

  /** @type {SomePolicy} */
  const policy = {
    resources: {
      other: { packages: { some: false } },
      some: { packages: { other: true } },
    },
  };

  /** @type {SomePolicy} */
  const policyOverride = {
    resources: {
      other: { packages: { some: true } },
      some: { packages: { other: true } },
    },
  };

  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy: policy.entry,
  });

  const someDescriptor = makeCompartmentDescriptor({
    name: 'some',
    path: ['some'],
    label: 'some',
    modules: {
      some: {
        module: './index.js',
        compartment: 'file://some',
      },
      other: {
        module: 'other',
        compartment: 'file://other',
      },
    },
    scopes: {
      some: { compartment: 'file://some' },
      other: { compartment: 'file://other' },
    },
    policy: {},
  });

  const otherDescriptor = makeCompartmentDescriptor({
    name: 'other',
    path: ['other'],
    label: 'other',
    modules: {
      other: {
        module: './index.js',
        compartment: 'file://other',
      },
      some: {
        module: 'some',
        compartment: 'file://some',
      },
    },
    scopes: {
      some: { compartment: 'file://some' },
      other: { compartment: 'file://other' },
    },
    policy: {},
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: {
      some: someDescriptor,
      other: otherDescriptor,
      root: rootDescriptor,
    },
  });
  await applyCompartmentMapTransforms(
    compartmentMap,
    new Map([
      ['some', 'file://some'],
      ['other', 'file://other'],
    ]),
    [enforcePolicyTransform],
    { log, policyOverride, policy },
  );
  t.false(
    'some' in otherDescriptor.modules,
    'ModuleDescriptor for "some" should have been removed',
  );
  t.true(
    'other' in someDescriptor.modules,
    'ModuleDescriptor for "other" should have been retained',
  );
});
test('enforcePolicyTransform - fallback to policy from CompartmentDescriptor', async t => {
  t.plan(2);

  /** @type {SomePolicy} */
  const policy = {
    resources: {
      other: { packages: { some: false } },
      some: { packages: { other: true } },
    },
  };

  /** @type {SomePolicy} */
  const policyOverride = {
    resources: {
      other: { packages: { some: true } },
      some: { packages: { other: true } },
    },
  };

  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy: {
      packages: WILDCARD_POLICY_VALUE,
      builtins: WILDCARD_POLICY_VALUE,
      globals: WILDCARD_POLICY_VALUE,
      noGlobalFreeze: true,
    },
  });

  const someDescriptor = makeCompartmentDescriptor({
    name: 'some',
    path: ['some'],
    label: 'some',
    modules: {
      some: {
        module: './index.js',
        compartment: 'file://some',
      },
      other: {
        module: 'other',
        compartment: 'file://other',
      },
    },
    scopes: {
      some: { compartment: 'file://some' },
      other: { compartment: 'file://other' },
    },
    policy: {},
  });

  const otherDescriptor = makeCompartmentDescriptor({
    name: 'other',
    path: ['other'],
    label: 'other',
    modules: {
      other: {
        module: './index.js',
        compartment: 'file://other',
      },
      some: {
        module: 'some',
        compartment: 'file://some',
      },
    },
    scopes: {
      some: { compartment: 'file://some' },
      other: { compartment: 'file://other' },
    },
    policy: {},
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: {
      some: someDescriptor,
      other: otherDescriptor,
      root: rootDescriptor,
    },
  });
  await applyCompartmentMapTransforms(
    compartmentMap,
    new Map([
      ['some', 'file://some'],
      ['other', 'file://other'],
    ]),
    [enforcePolicyTransform],
    { log, policyOverride, policy },
  );
  t.false(
    'some' in otherDescriptor.modules,
    'ModuleDescriptor for "some" should have been removed',
  );
  t.true(
    'other' in someDescriptor.modules,
    'ModuleDescriptor for "other" should have been retained',
  );
});

test('enforcePolicyTransform - ignores policyOverride', async t => {
  t.plan(2);
  /** @type {SomePolicy} */
  const policy = {
    resources: {
      other: { packages: { some: false } },
      some: { packages: { other: true } },
    },
  };
  /** @type {SomePolicy} */
  const policyOverride = {
    resources: {
      other: { packages: { some: true } },
      some: { packages: { other: true } },
    },
  };

  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy: policy.entry,
  });

  const someDescriptor = makeCompartmentDescriptor({
    name: 'some',
    path: ['some'],
    label: 'some',
    modules: {
      some: {
        module: './index.js',
        compartment: 'file://some',
      },
      other: {
        module: 'other',
        compartment: 'file://other',
      },
    },
    scopes: {
      some: { compartment: 'file://some' },
      other: { compartment: 'file://other' },
    },
    policy: {},
  });

  const otherDescriptor = makeCompartmentDescriptor({
    name: 'other',
    path: ['other'],
    label: 'other',
    modules: {
      other: {
        module: './index.js',
        compartment: 'file://other',
      },
      some: {
        module: 'some',
        compartment: 'file://some',
      },
    },
    scopes: {
      some: { compartment: 'file://some' },
      other: { compartment: 'file://other' },
    },
    policy: {},
  });

  const compartmentMap = makeCompartmentMap('root', {
    compartments: {
      some: someDescriptor,
      other: otherDescriptor,
      root: rootDescriptor,
    },
  });

  await applyCompartmentMapTransforms(
    compartmentMap,
    new Map([
      ['some', 'file://some'],
      ['other', 'file://other'],
    ]),
    [enforcePolicyTransform],
    { log, policyOverride, policy },
  );
  t.truthy(otherDescriptor.scopes.some, 'scope should not have been removed');
  t.false(
    'file://some' in otherDescriptor.modules,
    'ModuleDescriptor for "some" should not have been added',
  );
});

test('createReferencesByPolicyTransform - adds references per policyOverride', async t => {
  t.plan(2);
  /** @type {SomePolicy} */
  const policy = { resources: {} };
  /** @type {SomePolicy} */
  const policyOverride = { resources: { some: { packages: { other: true } } } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy: policy.entry,
  });
  const someDescriptor = makeCompartmentDescriptor({
    name: 'some',
    path: ['some'],
    label: 'some',
    modules: {},
    policy: policy.resources.some,
  });
  /** @type {ModuleDescriptorConfiguration} */
  const otherModule = {
    module: 'other',
    compartment: 'file://other',
  };
  const otherDescriptor = makeCompartmentDescriptor({
    name: 'other',
    path: ['other'],
    label: 'other',
    modules: { other: otherModule },
    policy: policy.resources.other,
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: {
      some: someDescriptor,
      other: otherDescriptor,
      root: rootDescriptor,
    },
  });
  await applyCompartmentMapTransforms(
    compartmentMap,
    new Map([
      ['some', 'file://some'],
      ['other', 'file://other'],
    ]),
    [createReferencesByPolicyTransform],
    { log, policyOverride },
  );
  t.truthy(someDescriptor.scopes.other, 'scope should have been added');
  t.truthy(
    someDescriptor.modules.other,
    'ModuleDescriptor should have been added',
  );
});

test('createReferencesByPolicyTransform - adds references per policy', async t => {
  t.plan(2);
  /** @type {SomePolicy} */
  const policy = { resources: { some: { packages: { other: true } } } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy: policy.entry,
  });
  const someDescriptor = makeCompartmentDescriptor({
    name: 'some',
    path: ['some'],
    label: 'some',
    modules: {},
    policy: policy.resources.some,
  });
  /** @type {ModuleDescriptorConfiguration} */
  const otherModule = {
    module: 'other',
    compartment: 'file://other',
  };
  const otherDescriptor = makeCompartmentDescriptor({
    name: 'other',
    path: ['other'],
    label: 'other',
    modules: { other: otherModule },
    policy: policy.resources.other,
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: {
      some: someDescriptor,
      other: otherDescriptor,
      root: rootDescriptor,
    },
  });
  await applyCompartmentMapTransforms(
    compartmentMap,
    new Map([
      ['some', 'file://some'],
      ['other', 'file://other'],
    ]),
    [createReferencesByPolicyTransform],
    { log, policy },
  );
  t.truthy(someDescriptor.scopes.other, 'scope should have been added');
  t.truthy(
    someDescriptor.modules.other,
    'ModuleDescriptor should have been added',
  );
});

test('createReferencesByPolicyTransform - missing compartment descriptor for compartment name', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: { other: { packages: { nuffin: true } } } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy: policy.entry,
  });
  const someDescriptor = makeCompartmentDescriptor({
    name: 'some',
    path: ['some'],
    label: 'some',
    modules: {
      some: {
        module: './index.js',
        compartment: 'file://some',
      },
    },
    policy: {},
  });
  const otherDescriptor = makeCompartmentDescriptor({
    name: 'other',
    path: ['other'],
    label: 'other',
    modules: {},
    policy: {},
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: {
      some: someDescriptor,
      other: otherDescriptor,
      root: rootDescriptor,
    },
  });
  // @ts-expect-error bad type
  compartmentMap.compartments.nuffin = undefined;

  await t.throwsAsync(
    applyCompartmentMapTransforms(
      compartmentMap,
      new Map([
        ['some', 'file://some'],
        ['other', 'file://other'],
      ]),
      [createReferencesByPolicyTransform],
      { log, policy },
    ),
    {
      message: /No CompartmentDescriptor for name "nuffin"/,
    },
  );
});

test('createReferencesByPolicyTransform - warn on missing compartment descriptor for canonical name', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: { other: { packages: { nuffin: true } } } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy: policy.entry,
  });
  const someDescriptor = makeCompartmentDescriptor({
    name: 'some',
    path: ['some'],
    label: 'some',
    modules: {
      some: {
        module: './index.js',
        compartment: 'file://some',
      },
    },
    policy: {},
  });
  const otherDescriptor = makeCompartmentDescriptor({
    name: 'other',
    path: ['other'],
    label: 'other',
    modules: {},
    policy: {},
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: {
      some: someDescriptor,
      other: otherDescriptor,
      root: rootDescriptor,
    },
  });
  /** @type {any[]} */
  const calls = [];
  /** @type {LogFn} */
  const logger = (...args) => {
    calls.push(args);
  };
  await applyCompartmentMapTransforms(
    compartmentMap,
    new Map([
      ['some', 'file://some'],
      ['other', 'file://other'],
    ]),
    [createReferencesByPolicyTransform],
    { log: logger, policy },
  );
  t.deepEqual(calls, [
    [
      `Warning: no compartment name found for "nuffin"; package policy may be malformed`,
    ],
  ]);
});

test('createReferencesByPolicyTransform - prefer policy over policyOverride', async t => {
  t.plan(2);
  /** @type {SomePolicy} */
  const policy = { resources: { other: { packages: { some: true } } } };
  /** @type {SomePolicy} */
  const policyOverride = { resources: { some: { packages: { other: true } } } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy: policy.entry,
  });
  const someDescriptor = makeCompartmentDescriptor({
    name: 'some',
    path: ['some'],
    label: 'some',
    modules: {
      some: {
        module: './index.js',
        compartment: 'file://some',
      },
    },
    policy: {},
  });
  const otherDescriptor = makeCompartmentDescriptor({
    name: 'other',
    path: ['other'],
    label: 'other',
    modules: {
      other: {
        module: './index.js',
        compartment: 'file://other',
      },
    },
    policy: {},
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: {
      some: someDescriptor,
      other: otherDescriptor,
      root: rootDescriptor,
    },
  });
  await applyCompartmentMapTransforms(
    compartmentMap,
    new Map([
      ['some', 'file://some'],
      ['other', 'file://other'],
    ]),
    [createReferencesByPolicyTransform],
    { log, policyOverride, policy },
  );
  t.truthy(otherDescriptor.scopes.some, 'scope should have been added');
  t.like(
    otherDescriptor.modules.some,
    {
      module: './index.js',
      compartment: 'file://some',
      createdBy: 'transform',
    },
    'ModuleDescriptor for "some" should have been added',
  );
});

test('CompartmentMapTransformContext - API is frozen', async t => {
  t.plan(5);
  /** @type {CompartmentMapTransformFn[]} */
  const transforms = [
    ({ compartmentMap, context }) => {
      t.true(isFrozen(context), 'context should be frozen');
      for (const [propName, member] of entries(context)) {
        t.true(isFrozen(member), `context.${propName} should be frozen`);
      }
      return compartmentMap;
    },
  ];
  await applyCompartmentMapTransforms(
    makeCompartmentMap(),
    new Map(),
    transforms,
    { log },
  );
});

test('CompartmentMapTransformContext - getCompartmentDescriptor', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: { canonical: { packages: {} } } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: ['root'],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy,
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: { root: rootDescriptor },
  });
  /**
   * @type {CompartmentDescriptor | undefined}
   */
  let actual;
  /** @type {CompartmentMapTransformFn} */
  const wrapperTransform = ({ context }) => {
    actual = context.getCompartmentDescriptor(compartmentMap.entry.compartment);
    return compartmentMap;
  };
  await applyCompartmentMapTransforms(
    compartmentMap,
    new Map(),
    [wrapperTransform],
    { log, policy },
  );
  t.deepEqual(actual, rootDescriptor);
});

test('CompartmentMapTransformContext - getCanonicalName', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: { canonical: { packages: {} } } };
  // Root compartment (entry) with empty path
  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy,
  });
  // Non-root compartment with non-empty path
  const fooBarDescriptor = makeCompartmentDescriptor({
    name: 'fooBar',
    path: ['foo', 'bar'],
    label: 'foo>bar',
    modules: {},
    policy,
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: { root: rootDescriptor, fooBar: fooBarDescriptor },
  });
  /**
   * @type {string | undefined}
   */
  let actual;
  /** @type {CompartmentMapTransformFn} */
  const wrapperTransform = ({ context }) => {
    actual = context.getCanonicalName(fooBarDescriptor);
    return compartmentMap;
  };
  await applyCompartmentMapTransforms(
    compartmentMap,
    new Map(),
    [wrapperTransform],
    { log, policy },
  );
  t.is(actual, 'foo>bar');
});

test('CompartmentMapTransformContext - getCompartmentName', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: { canonical: { packages: {} } } };
  // Root compartment (entry) with empty path
  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy,
  });
  // Non-root compartment with non-empty path
  const fooBarDescriptor = makeCompartmentDescriptor({
    name: 'fooBar',
    path: ['foo', 'bar'],
    label: 'foo>bar',
    modules: {},
    policy,
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: { root: rootDescriptor, 'file://foobar': fooBarDescriptor },
  });
  /**
   * @type {string | undefined}
   */
  let actual;
  /** @type {CompartmentMapTransformFn} */
  const wrapperTransform = ({ context }) => {
    const canonicalName = context.getCanonicalName(fooBarDescriptor);
    actual = context.getCompartmentName(/** @type {string} */ (canonicalName));
    return compartmentMap;
  };
  // Map canonical names to compartment keys
  /** @type {CanonicalNameMap} */
  const canonicalNameToCompartmentNameMap = new Map([
    ['foo>bar', 'file://foobar'],
  ]);
  await applyCompartmentMapTransforms(
    compartmentMap,
    canonicalNameToCompartmentNameMap,
    [wrapperTransform],
    { log, policy },
  );
  t.is(actual, 'file://foobar');
});

test('CompartmentMapTransformContext - getPackagePolicy', async t => {
  /** @type {SomePolicy} */
  const policy = {
    resources: { some: {} },
    entry: { packages: WILDCARD_POLICY_VALUE },
  };
  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    policy: {},
  });
  const someDescriptor = makeCompartmentDescriptor({
    name: 'some',
    path: ['some'],
    label: 'some',
    policy: {},
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: { root: rootDescriptor, some: someDescriptor },
  });
  /**
   * @type {SomePackagePolicy | undefined}
   */
  let actual;
  /** @type {CompartmentMapTransformFn} */
  const wrapperTransform = ({ context }) => {
    actual = context.getPackagePolicy(someDescriptor, policy);
    return compartmentMap;
  };
  await applyCompartmentMapTransforms(
    compartmentMap,
    new Map(),
    [wrapperTransform],
    { log, policy },
  );
  t.is(
    actual,
    policy.resources.some,
    'getPackagePolicy should return object from policy instead of compartment descriptor',
  );
});

test('CompartmentMapTransformContext - transforms CompartmentMapDescriptor', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: {} };
  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: ['root'],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy: policy.entry,
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: { root: rootDescriptor },
  });
  /** @type {CompartmentMapTransformFn} */
  const addTagTransform = ({ compartmentMap: inputMap }) => {
    // Clone and modify tags
    return {
      ...inputMap,
      tags: [...(inputMap.tags || []), 'dummy'],
    };
  };
  const result = await applyCompartmentMapTransforms(
    compartmentMap,
    new Map(),
    [addTagTransform],
    { log, policy },
  );
  t.like(
    result,
    { tags: ['test', 'dummy'] },
    'result should include the new tag',
  );
});

test('applyCompartmentMapTransforms - throws if optionsForTransforms is undefined', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: { canonical: { packages: {} } } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy,
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: { root: rootDescriptor },
  });
  await t.throwsAsync(
    applyCompartmentMapTransforms(
      compartmentMap,
      new Map(),
      [],
      /** @type {any} */ (undefined),
    ),
    {
      message: /optionsForTransforms expected/,
    },
  );
});

test('applyCompartmentMapTransforms - wraps thrown error from transform', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: { canonical: { packages: {} } } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: ENTRY_COMPARTMENT,
    path: [],
    label: ENTRY_COMPARTMENT,
    modules: {},
    policy,
  });
  const compartmentMap = makeCompartmentMap('root', {
    compartments: { root: rootDescriptor },
  });
  const badTransform = () => {
    throw new Error('bad transform');
  };
  await t.throwsAsync(
    applyCompartmentMapTransforms(compartmentMap, new Map(), [badTransform], {
      log,
      policy,
    }),
    {
      message:
        /Compartment Map Transform .+ errored during execution: bad transform/,
    },
  );
});

test('Compartment Map Transforms - integration with mapNodeModules()', async t => {
  const readPowers = makeReadPowers({ fs, url });
  const entrypoint = new URL(
    'fixtures-dynamic-ancestor/node_modules/webpackish-app/build.js',
    import.meta.url,
  ).href;

  const compartmentMap = await mapNodeModules(readPowers, entrypoint, {
    policy: {
      entry: {
        packages: WILDCARD_POLICY_VALUE,
        globals: WILDCARD_POLICY_VALUE,
        builtins: WILDCARD_POLICY_VALUE,
      },
      resources: {
        pantspack: {
          builtins: {
            'node:console': true,
            'node:path': true,
            'node:util': true,
          },
          packages: {
            'pantspack>pantspack-folder-runner': true,
            [ENTRY_COMPARTMENT]: true,
          },
        },
        'pantspack>pantspack-folder-runner': {
          packages: {
            'jorts-folder': true,
          },
        },
      },
    },
  });

  t.snapshot(stripCompartmentMap(compartmentMap));
});

test('Compartment Map Transforms - integration with captureFromMap()', async t => {
  const readPowers = makeReadPowers({ fs, url });
  const entrypoint = new URL(
    'fixtures-dynamic-ancestor/node_modules/webpackish-app/build.js',
    import.meta.url,
  ).href;
  /**
   * @type {ExitModuleImportHook}
   */
  const importHook = async (specifier, packageLocation) => {
    const require = Module.createRequire(url.fileURLToPath(packageLocation));
    const ns = require(specifier);
    return freeze(
      /** @type {ThirdPartyStaticModuleInterface} */ ({
        imports: [],
        exports: keys(ns),
        execute: moduleExports => {
          moduleExports.default = ns;
          assign(moduleExports, ns);
        },
      }),
    );
  };

  /** @type {SomePolicy} */
  const policy = {
    entry: {
      packages: WILDCARD_POLICY_VALUE,
      globals: WILDCARD_POLICY_VALUE,
      builtins: WILDCARD_POLICY_VALUE,
    },
    resources: {
      pantspack: {
        builtins: {
          'node:console': true,
          'node:path': true,
          'node:util': true,
        },
        packages: {
          'pantspack>pantspack-folder-runner': true,
          [ENTRY_COMPARTMENT]: true,
        },
      },
      'pantspack>pantspack-folder-runner': {
        packages: {
          'jorts-folder': true,
        },
      },
    },
  };
  const nodeCompartmentMap = await mapNodeModules(readPowers, entrypoint, {
    dev: true,
    policy,
  });
  const result = await captureFromMap(readPowers, nodeCompartmentMap, {
    policy,
    parserForLanguage: defaultParserForLanguage,
    importHook,
  });
  t.snapshot(stripCaptureResult(result));
});
