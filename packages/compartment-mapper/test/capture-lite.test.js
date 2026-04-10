import 'ses';

import fs from 'node:fs';
import url from 'node:url';
import path from 'node:path';
import test from 'ava';
import { captureFromMap } from '../capture-lite.js';
import { mapNodeModules } from '../src/node-modules.js';
import { makeReadPowers } from '../src/node-powers.js';
import { defaultParserForLanguage } from '../src/import-parsers.js';
import { ENTRY_COMPARTMENT } from '../src/policy-format.js';

/**
 * @import {LocalModuleSource} from '../src/types.js'
 */

const { keys } = Object;

const readPowers = makeReadPowers({ fs, url });

test('captureFromMap() - should resolve with a CaptureResult', async t => {
  t.plan(5);

  const moduleLocation = `${new URL(
    'fixtures-0/node_modules/bundle/main.js',
    import.meta.url,
  )}`;

  const nodeCompartmentMap = await mapNodeModules(readPowers, moduleLocation);

  const { captureCompartmentMap, captureSources, compartmentRenames } =
    await captureFromMap(readPowers, nodeCompartmentMap, {
      parserForLanguage: defaultParserForLanguage,
    });

  t.deepEqual(
    keys(captureSources).sort(),
    [ENTRY_COMPARTMENT, 'bundle-dep'],
    'captureSources should contain sources for each compartment map descriptor',
  );

  t.deepEqual(
    keys(compartmentRenames).sort(),
    [ENTRY_COMPARTMENT, 'bundle-dep'],
    'compartmentRenames must contain same compartment names as in captureCompartmentMap',
  );

  t.is(
    keys(compartmentRenames).length,
    keys(captureCompartmentMap.compartments).length,
    'Every compartment descriptor must have a corresponding value in compartmentRenames',
  );

  t.deepEqual(
    captureCompartmentMap.entry,
    {
      compartment: ENTRY_COMPARTMENT,
      module: './main.js',
    },
    'The entry compartment should point to the "bundle" compartment map',
  );

  t.deepEqual(
    keys(captureCompartmentMap.compartments).sort(),
    [ENTRY_COMPARTMENT, 'bundle-dep'],
    'The "bundle" and "bundle-dep" compartments should be present',
  );
});

test('captureFromMap() - should call _redundantPreloadHook for already-loaded compartments', async t => {
  t.plan(2);
  const moduleLocation = `${new URL(
    'fixtures-0/node_modules/bundle/main.js',
    import.meta.url,
  )}`;

  const nodeCompartmentMap = await mapNodeModules(readPowers, moduleLocation);

  /** @type {{ canonicalName: string, entry: string }[]} */
  const hookCalls = [];

  await captureFromMap(readPowers, nodeCompartmentMap, {
    _preload: ['bundle-dep'],
    _redundantPreloadHook: ({ canonicalName, entry }) => {
      hookCalls.push({ canonicalName, entry });
    },
    parserForLanguage: defaultParserForLanguage,
  });

  t.is(
    hookCalls.length,
    1,
    '_redundantPreloadHook should have been called once',
  );
  t.deepEqual(
    hookCalls[0],
    { canonicalName: 'bundle-dep', entry: '.' },
    'hook should have been called with the correct parameters',
  );
});

test('captureFromMap() - should only call _redundantPreloadHook for the entry already loaded', async t => {
  t.plan(3);
  const moduleLocation = `${new URL(
    'fixtures-digest/node_modules/app2/index.js',
    import.meta.url,
  )}`;

  const nodeCompartmentMap = await mapNodeModules(readPowers, moduleLocation);

  const fjordCompartment = Object.values(nodeCompartmentMap.compartments).find(
    c => c.name === 'fjord',
  );
  if (!fjordCompartment) {
    t.fail('Expected "fjord" compartment to be present in nodeCompartmentMap');
    return;
  }

  /** @type {{ canonicalName: string, entry: string }[]} */
  const hookCalls = [];

  const { captureCompartmentMap } = await captureFromMap(
    readPowers,
    nodeCompartmentMap,
    {
      _preload: [
        'fjord',
        { compartment: 'fjord', entry: './some-other-entry.js' },
      ],
      _redundantPreloadHook: ({ canonicalName, entry }) => {
        hookCalls.push({ canonicalName, entry });
      },
      parserForLanguage: defaultParserForLanguage,
    },
  );

  t.true(
    'fjord' in captureCompartmentMap.compartments,
    '"fjord" should be retained in captureCompartmentMap',
  );
  t.is(
    hookCalls.length,
    1,
    '_redundantPreloadHook should have been called exactly once',
  );
  t.deepEqual(
    hookCalls[0],
    { canonicalName: 'fjord', entry: '.' },
    'hook should have fired for the default entry which was already loaded',
  );
});

test('captureFromMap() - should preload with canonical name', async t => {
  const moduleLocation = `${new URL(
    'fixtures-digest/node_modules/app/index.js',
    import.meta.url,
  )}`;

  const nodeCompartmentMap = await mapNodeModules(readPowers, moduleLocation);

  const fjordCompartment = Object.values(nodeCompartmentMap.compartments).find(
    c => c.name === 'fjord',
  );
  if (!fjordCompartment) {
    t.fail('Expected "fjord" compartment to be present in nodeCompartmentMap');
    return;
  }

  /** @type {{ canonicalName: string, entry: string }[]} */
  const hookCalls = [];

  const { captureCompartmentMap } = await captureFromMap(
    readPowers,
    nodeCompartmentMap,
    {
      _preload: [fjordCompartment.location],
      _redundantPreloadHook: ({ canonicalName, entry }) => {
        hookCalls.push({ canonicalName, entry });
      },
      parserForLanguage: defaultParserForLanguage,
    },
  );

  t.true(
    'fjord' in captureCompartmentMap.compartments,
    '"fjord" should be retained in captureCompartmentMap',
  );
  t.is(
    hookCalls.length,
    0,
    '_redundantPreloadHook should not have been called for a non-redundant preload',
  );
});

test('captureFromMap() - should discard unretained CompartmentDescriptors', async t => {
  const moduleLocation = `${new URL(
    'fixtures-digest/node_modules/app/index.js',
    import.meta.url,
  )}`;

  const nodeCompartmentMap = await mapNodeModules(readPowers, moduleLocation);

  const nodeComartmentMapSize = keys(nodeCompartmentMap.compartments).length;

  const fjordCompartment = Object.values(nodeCompartmentMap.compartments).find(
    c => c.name === 'fjord',
  );
  if (!fjordCompartment) {
    t.fail('Expected "fjord" compartment to be present in nodeCompartmentMap');
    return;
  }

  const { captureCompartmentMap } = await captureFromMap(
    readPowers,
    nodeCompartmentMap,
    {
      parserForLanguage: defaultParserForLanguage,
    },
  );

  const captureCompartmentMapSize = keys(
    captureCompartmentMap.compartments,
  ).length;

  t.true(
    captureCompartmentMapSize < nodeComartmentMapSize,
    'captureCompartmentMap should contain fewer CompartmentDescriptors than nodeCompartmentMap',
  );

  t.false(
    'fjord' in captureCompartmentMap.compartments,
    '"fjord" should not be retained in captureCompartmentMap',
  );
});

test('captureFromMap() - should preload custom entry', async t => {
  const moduleLocation = `${new URL(
    'fixtures-digest/node_modules/app/index.js',
    import.meta.url,
  )}`;

  const nodeCompartmentMap = await mapNodeModules(readPowers, moduleLocation);

  const fjordCompartment = Object.values(nodeCompartmentMap.compartments).find(
    c => c.name === 'fjord',
  );
  if (!fjordCompartment) {
    t.fail('Expected "fjord" compartment to be present in nodeCompartmentMap');
    return;
  }

  const { captureCompartmentMap } = await captureFromMap(
    readPowers,
    nodeCompartmentMap,
    {
      _preload: [
        {
          compartment: fjordCompartment.location,
          entry: './some-other-entry.js',
        },
      ],
      parserForLanguage: defaultParserForLanguage,
    },
  );

  t.true(
    'fjord' in captureCompartmentMap.compartments,
    '"fjord" should be retained in captureCompartmentMap',
  );
  const fjordCompartmentDescriptor = captureCompartmentMap.compartments.fjord;
  t.true(
    './some-other-entry.js' in fjordCompartmentDescriptor.modules,
    'The custom entry should be in the modules object of fjord',
  );
});

test('captureFromMap() - should round-trip sources based on parsers', async t => {
  const moduleLocation = `${new URL(
    'fixtures-0/node_modules/bundle/main.js',
    import.meta.url,
  )}`;

  const nodeCompartmentMap = await mapNodeModules(readPowers, moduleLocation);

  const { captureSources, compartmentRenames } = await captureFromMap(
    readPowers,
    nodeCompartmentMap,
    {
      // we are NOT pre-compiling sources
      parserForLanguage: defaultParserForLanguage,
    },
  );

  const decoder = new TextDecoder();
  const bundleSource = /** @type {LocalModuleSource} */ (
    captureSources[ENTRY_COMPARTMENT]['./icando.cjs']
  );
  // the actual source depends on the value of `parserForLanguage` above
  const actual = decoder.decode(bundleSource.bytes);
  const expected = await fs.promises.readFile(
    path.join(
      url.fileURLToPath(compartmentRenames[ENTRY_COMPARTMENT]),
      'icando.cjs',
    ),
    'utf-8',
  );
  t.is(actual, expected, 'Source code should not be pre-compiled');
});
