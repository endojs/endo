import 'ses';
import fs from 'node:fs';
import url from 'node:url';
import test from 'ava';
import { ANONYMOUS_COMPARTMENT, mapNodeModules } from '../src/node-modules.js';
import { makeReadPowers } from '../src/node-powers.js';

const { keys, values } = Object;

test('mapNodeModules() should fulfill with a denormalized CompartmentMapDescriptor', async t => {
  t.plan(4);

  const readPowers = makeReadPowers({ fs, url });
  const moduleLocation = `${new URL(
    'fixtures-0/node_modules/bundle/main.js',
    import.meta.url,
  )}`;

  const { compartments, entry } = await mapNodeModules(
    readPowers,
    moduleLocation,
  );

  t.deepEqual(
    values(compartments)
      .map(({ name }) => name)
      .sort(),
    ['bundle', 'bundle-dep'],
  );

  t.true(keys(compartments).every(name => name.startsWith('file://')));

  t.is(compartments[entry.compartment].name, 'bundle');

  t.deepEqual(keys(compartments[entry.compartment].modules).sort(), [
    '.',
    'bundle',
    'bundle-dep',
  ]);
});

test(`mapNodeModules() should assign a package name when the entry point's package descriptor lacks a "name" field`, async t => {
  t.plan(1);

  const readPowers = makeReadPowers({ fs, url });
  const moduleLocation = `${new URL(
    'fixtures-anonymous/node_modules/unnamed/incognito/index.js',
    import.meta.url,
  )}`;

  const { compartments } = await mapNodeModules(readPowers, moduleLocation);

  t.deepEqual(
    values(compartments).map(({ name }) => name),
    [ANONYMOUS_COMPARTMENT],
  );
});
