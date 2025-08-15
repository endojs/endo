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

test('captureFromMap() - should resolve with a CaptureResult', async t => {
  t.plan(5);

  const readPowers = makeReadPowers({ fs, url });
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

test('captureFromMap() - should discard unretained CompartmentDescriptors', async t => {
  const readPowers = makeReadPowers({ fs, url });
  const moduleLocation = `${new URL(
    'fixtures-digest/node_modules/app/index.js',
    import.meta.url,
  )}`;

  const nodeCompartmentMap = await mapNodeModules(readPowers, moduleLocation);

  const nodeComartmentMapSize = keys(nodeCompartmentMap.compartments).length;

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

test('captureFromMap() - should force-load', async t => {
  const readPowers = makeReadPowers({ fs, url });
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
      forceLoad: [fjordCompartment.location],
      parserForLanguage: defaultParserForLanguage,
    },
  );

  t.true(
    'fjord' in captureCompartmentMap.compartments,
    '"fjord" should be retained in captureCompartmentMap',
  );
});

test('captureFromMap() - should discard unretained CompartmentDescriptors', async t => {
  const readPowers = makeReadPowers({ fs, url });
  const moduleLocation = `${new URL(
    'fixtures-digest/node_modules/app/index.js',
    import.meta.url,
  )}`;

  const nodeCompartmentMap = await mapNodeModules(readPowers, moduleLocation);

  const nodeComartmentMapSize = keys(nodeCompartmentMap.compartments).length;

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

test('captureFromMap() - should force-load', async t => {
  const readPowers = makeReadPowers({ fs, url });
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
      forceLoad: [fjordCompartment.location],
      parserForLanguage: defaultParserForLanguage,
    },
  );

  t.true(
    'fjord' in captureCompartmentMap.compartments,
    '"fjord" should be retained in captureCompartmentMap',
  );
});

test('captureFromMap() - should round-trip sources based on parsers', async t => {
  const readPowers = makeReadPowers({ fs, url });
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
