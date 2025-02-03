import 'ses';
import fs from 'node:fs';
import url from 'node:url';
import path from 'node:path';
import test from 'ava';
import { captureFromMap } from '../capture-lite.js';
import { mapNodeModules } from '../src/node-modules.js';
import { makeReadPowers } from '../src/node-powers.js';
import { defaultParserForLanguage } from '../src/import-parsers.js';

const { keys } = Object;

test('captureFromMap() should resolve with a CaptureResult', async t => {
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
    ['bundle', 'bundle-dep-v0.0.0'],
    'captureSources should contain sources for each compartment map descriptor',
  );

  t.deepEqual(
    keys(compartmentRenames).sort(),
    ['bundle', 'bundle-dep-v0.0.0'],
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
      compartment: 'bundle',
      module: './main.js',
    },
    'The entry compartment should point to the "bundle" compartment map',
  );

  t.deepEqual(
    keys(captureCompartmentMap.compartments).sort(),
    ['bundle', 'bundle-dep-v0.0.0'],
    'The "bundle" and "bundle-dep-v0.0.0" compartments should be present',
  );
});

test('captureFromMap() should round-trip sources based on parsers', async t => {
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
  // the actual source depends on the value of `parserForLanguage` above
  const actual = decoder.decode(captureSources.bundle['./icando.cjs'].bytes);
  const expected = await fs.promises.readFile(
    path.join(url.fileURLToPath(compartmentRenames.bundle), 'icando.cjs'),
    'utf-8',
  );
  t.is(actual, expected, 'Source code should not be pre-compiled');
});
