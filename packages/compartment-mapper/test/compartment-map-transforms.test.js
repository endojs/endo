import 'ses';

import test from 'ava';
import {
  applyCompartmentMapTransforms,
  enforcePolicyTransform,
  createReferencesByPolicyTransform,
} from '../src/compartment-map-transforms.js';

/**
 * @import {
 *   CompartmentDescriptor,
 *   ModuleDescriptor,
 *   CompartmentMapDescriptor,
 *   CompartmentMapTransformFn,
 *   SomePolicy,
 *   SomePackagePolicy,
 *   CompartmentDescriptorMetadata,
 *   LogFn
 * } from '../src/types.js';
 */

/**
 * Creates a dummy {@link CompartmentDescriptor} for testing.
 *
 * @param {object} opts
 * @param {string} opts.name
 * @param {string[]} opts.path
 * @param {string} [opts.label]
 * @param {Record<string, ModuleDescriptor>} [opts.modules]
 * @param {SomePackagePolicy} [opts.policy]
 * @returns {CompartmentDescriptor}
 */
const makeCompartmentDescriptor = ({
  name,
  path,
  label,
  modules = {},
  policy: flimsyPolicy,
}) => {
  return {
    name,
    path,
    label: label ?? name,
    modules,
    policy: /** @type {any} */ (flimsyPolicy),
    compartments: new Set(),
    scopes: {},
    location: `file:///${(path ?? []).join('/')}`,
    types: {},
    parsers: {},
  };
};

/**
 * @param {object} [opts]
 * @param {string} [opts.entry]
 * @param {Record<string, CompartmentDescriptor>} [opts.compartments]
 * @returns {CompartmentMapDescriptor}
 */
const makeCompartmentMap = ({ entry = 'root', compartments = {} } = {}) => {
  return {
    entry: { compartment: entry, module: 'main' },
    compartments,
    tags: ['test'],
  };
};

/**
 * No-op log function for compartment map transform tests
 */
const log = () => {};

test('enforcePolicyTransform - removes modules per policy', async t => {
  t.plan(2);
  /** @type {string[]} */
  const loggedLines = [];
  /** @type {LogFn} */
  const logLinesFn = (...args) => {
    loggedLines.push(args.join(' '));
  };
  /** @type {SomePolicy} */
  const policy = { resources: { canonical: { packages: {} } } };
  /** @type {ModuleDescriptor} */
  const fooModule = { module: 'foo', compartment: 'other', retained: false };
  /** @type {ModuleDescriptor} */
  const barModule = { module: 'bar', compartment: 'root', retained: false };
  const compartmentDescriptor = makeCompartmentDescriptor({
    name: 'root',
    path: [],
    label: 'root',
    modules: { foo: fooModule, bar: barModule },
    policy,
  });
  const otherDescriptor = makeCompartmentDescriptor({
    name: 'other',
    path: ['other'],
    label: 'other',
    modules: {},
    policy,
  });
  const compartmentMap = makeCompartmentMap({
    entry: 'root',
    compartments: { root: compartmentDescriptor, other: otherDescriptor },
  });
  await applyCompartmentMapTransforms(
    compartmentMap,
    new WeakMap(),
    new Map(),
    [enforcePolicyTransform],
    { log: logLinesFn, policy },
  );
  t.like(compartmentDescriptor.modules, {
    foo: undefined,
    bar: { compartment: 'root', module: 'bar' },
  });
  t.truthy(loggedLines.length, 'log called');
});

test.todo('enforcePolicyTransform - interaction of policy and policyOverride');

test('createReferencesByPolicyTransform - adds references per policyOverride', async t => {
  t.plan(5);
  /** @type {string[]} */
  const logLines = [];
  /** @type {LogFn} */
  const logLinesFn = (...args) => {
    logLines.push(args.join(' '));
  };
  /** @type {SomePolicy} */
  const policy = { resources: {} };
  /** @type {SomePolicy} */
  const policyOverride = { resources: { some: { packages: { other: true } } } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: 'root',
    path: [],
    label: 'root',
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
  /** @type {ModuleDescriptor} */
  const otherModule = {
    module: 'other',
    compartment: 'other',
    retained: false,
  };
  const otherDescriptor = makeCompartmentDescriptor({
    name: 'other',
    path: ['other'],
    label: 'other',
    modules: { other: otherModule },
    policy: policy.resources.other,
  });
  const compartmentMap = makeCompartmentMap({
    entry: 'root',
    compartments: {
      some: someDescriptor,
      other: otherDescriptor,
      root: rootDescriptor,
    },
  });
  await applyCompartmentMapTransforms(
    compartmentMap,
    new WeakMap(),
    new Map([
      ['some', 'some'],
      ['other', 'other'],
    ]),
    [createReferencesByPolicyTransform],
    { log: logLinesFn, policyOverride },
  );
  t.true(someDescriptor.compartments.has('other'), 'reference added');
  t.truthy(someDescriptor.scopes.other, 'scope added');
  t.true(otherDescriptor.compartments.has('some'), 'reverse reference added');
  t.true(otherDescriptor.retained, 'retained set');
  t.true(
    logLines.some(l => l.includes('Policy: adding module descriptor')),
    'log called',
  );
});

test.todo('createReferencesByPolicyTransform - adds references per policy');

test.todo(
  'createReferencesByPolicyTransform - missing compartment descriptor for canonical name',
);

test.todo(
  'createReferencesByPolicyTransform - missing compartment descriptor for compartment name',
);

test.todo(
  'createReferencesByPolicyTransform - interaction of policy and policyOverride',
);

test.todo(
  'createReferencesByPolicyTransform - integration with captureFromMap()',
);

test.todo('CompartmentMapTransformContext - frozen objects');

test('CompartmentMapTransformContext - getCompartmentDescriptor', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: { canonical: { packages: {} } } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: 'root',
    path: ['root'],
    label: 'root',
    modules: {},
    policy,
  });
  const compartmentMap = makeCompartmentMap({
    entry: 'root',
    compartments: { root: rootDescriptor },
  });
  /**
   * @type {CompartmentDescriptor | undefined}
   */
  let actual;
  /** @type {CompartmentMapTransformFn} */
  const wrapperTransform = ({ context }) => {
    actual = context.getCompartmentDescriptor('root');
    return compartmentMap;
  };
  await applyCompartmentMapTransforms(
    compartmentMap,
    new WeakMap(),
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
    name: 'root',
    path: [],
    label: 'root',
    modules: {},
    policy,
  });
  // Non-root compartment with non-empty path
  const fooBarDescriptor = makeCompartmentDescriptor({
    name: 'fooBar',
    path: ['foo', 'bar'],
    label: 'fooBar',
    modules: {},
    policy,
  });
  const compartmentMap = makeCompartmentMap({
    entry: 'root',
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
    new WeakMap(),
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
    name: 'root',
    path: [],
    label: 'root',
    modules: {},
    policy,
  });
  // Non-root compartment with non-empty path
  const fooBarDescriptor = makeCompartmentDescriptor({
    name: 'fooBar',
    path: ['foo', 'bar'],
    label: 'fooBar',
    modules: {},
    policy,
  });
  const compartmentMap = makeCompartmentMap({
    entry: 'root',
    compartments: { root: rootDescriptor, fooBar: fooBarDescriptor },
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
  const canonicalNameToCompartmentNameMap = new Map([['foo>bar', 'fooBar']]);
  await applyCompartmentMapTransforms(
    compartmentMap,
    new WeakMap(),
    canonicalNameToCompartmentNameMap,
    [wrapperTransform],
    { log, policy },
  );
  t.is(actual, 'fooBar');
});

test('CompartmentMapTransformContext - getPackagePolicy', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: {}, entry: { packages: 'all' } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: 'root',
    path: ['root'],
    label: 'root',
    modules: {},
    policy: {},
  });
  const compartmentMap = makeCompartmentMap({
    entry: 'root',
    compartments: { root: rootDescriptor },
  });
  /**
   * @type {SomePackagePolicy | undefined}
   */
  let actual;
  /** @type {CompartmentMapTransformFn} */
  const wrapperTransform = ({ context }) => {
    actual = context.getPackagePolicy(rootDescriptor, policy);
    return compartmentMap;
  };
  await applyCompartmentMapTransforms(
    compartmentMap,
    new WeakMap(),
    new Map(),
    [wrapperTransform],
    { log, policy },
  );
  t.is(actual, policy.entry);
});

test('CompartmentMapTransformContext - metadataMap', async t => {
  t.plan(2);
  /** @type {SomePolicy} */
  const policy = { resources: {} };
  const rootDescriptor = makeCompartmentDescriptor({
    name: 'root',
    path: [],
    label: 'root',
    modules: {},
    policy: policy.entry,
  });
  const otherDescriptor = makeCompartmentDescriptor({
    name: 'other',
    path: ['other'],
    label: 'other',
    modules: {},
    policy: policy.resources.other,
  });
  const compartmentMap = makeCompartmentMap({
    entry: 'root',
    compartments: { root: rootDescriptor, other: otherDescriptor },
  });
  /**
   * @type {WeakMap<CompartmentDescriptor, CompartmentDescriptorMetadata> | undefined}
   */
  let actual;
  /** @type {CompartmentMapTransformFn} */
  const wrapperTransform = ({ context }) => {
    actual = context.metadataMap;
    return compartmentMap;
  };
  const metadataMap = new WeakMap([
    [otherDescriptor, { canonicalName: 'other' }],
  ]);
  await applyCompartmentMapTransforms(
    compartmentMap,
    metadataMap,
    new Map(),
    [wrapperTransform],
    { log, policy },
  );
  t.true(actual instanceof WeakMap, 'metadataMap should be a WeakMap');
  t.is(
    actual?.get(otherDescriptor)?.canonicalName,
    'other',
    'metadataMap should contain otherDescriptor',
  );
});

test('CompartmentMapTransformContext - transforms CompartmentMapDescriptor', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: {} };
  const rootDescriptor = makeCompartmentDescriptor({
    name: 'root',
    path: ['root'],
    label: 'root',
    modules: {},
    policy: policy.entry,
  });
  const compartmentMap = makeCompartmentMap({
    entry: 'root',
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
    new WeakMap(),
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

test('enforcePolicyTransform - throws if CompartmentDescriptor for module has no path property', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: { canonical: { packages: {} } } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: 'root',
    path: [],
    label: 'root',
    modules: { foo: { module: 'foo', compartment: 'other' } },
    policy,
  });
  // @ts-expect-error: missing path property for test
  const otherDescriptor = makeCompartmentDescriptor({
    name: 'other',
    label: 'other',
    modules: {},
    policy,
  });
  const compartmentMap = makeCompartmentMap({
    entry: 'root',
    compartments: { root: rootDescriptor, other: otherDescriptor },
  });
  await t.throwsAsync(
    applyCompartmentMapTransforms(
      compartmentMap,
      new WeakMap(),
      new Map(),
      [enforcePolicyTransform],
      { log, policy },
    ),
    {
      message: /has no path property/,
    },
  );
});

test('applyCompartmentMapTransforms - throws if optionsForTransforms is undefined', async t => {
  /** @type {SomePolicy} */
  const policy = { resources: { canonical: { packages: {} } } };
  const rootDescriptor = makeCompartmentDescriptor({
    name: 'root',
    path: [],
    label: 'root',
    modules: {},
    policy,
  });
  const compartmentMap = makeCompartmentMap({
    entry: 'root',
    compartments: { root: rootDescriptor },
  });
  await t.throwsAsync(
    applyCompartmentMapTransforms(
      compartmentMap,
      new WeakMap(),
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
    name: 'root',
    path: [],
    label: 'root',
    modules: {},
    policy,
  });
  const compartmentMap = makeCompartmentMap({
    entry: 'root',
    compartments: { root: rootDescriptor },
  });
  const badTransform = () => {
    throw new Error('bad transform');
  };
  await t.throwsAsync(
    applyCompartmentMapTransforms(
      compartmentMap,
      new WeakMap(),
      new Map(),
      [badTransform],
      { log, policy },
    ),
    {
      message:
        /Compartment Map Transform .+ errored during execution: bad transform/,
    },
  );
});
