import 'ses';

import fs from 'node:fs';
import { scheduler } from 'node:timers/promises';
import url from 'node:url';
import test from 'ava';
import { mapNodeModules } from '../src/node-modules.js';
import { makeReadPowers } from '../src/node-powers.js';
/**
 * @import {CompartmentDescriptor, MaybeReadFn} from '../src/types.js'
 */

const { keys, values } = Object;

{
  /**
   * We will retry the subsequent test _n_ times to assert it is deterministic.
   * This is not a proof.
   */
  const shortestPathTestCount = 50;

  // `paperino` is before `pippo` when sorted alphabetically
  const expectedShortestPath = ['paperino', 'topolino', 'goofy'];

  const shortestPathFixture = new URL(
    'fixtures-shortest-path/node_modules/app/index.js',
    import.meta.url,
  ).href;

  const readPowers = makeReadPowers({ fs, url });
  const { maybeRead } = readPowers;

  /**
   * Inserts a random delay before the read to goad it into non-determinism (which
   * should fail)
   * @type {MaybeReadFn}
   */
  readPowers.maybeRead = async specifier => {
    await scheduler.wait(Math.random() * 50);
    return maybeRead(specifier);
  };

  for (let i = 0; i < shortestPathTestCount; i += 1) {
    test(`mapNodeModules() should return compartment descriptors containing shortest path (${i}/${shortestPathTestCount})`, async t => {
      t.plan(2);

      const compartmentMap = await mapNodeModules(
        readPowers,
        shortestPathFixture,
      );

      const compartmentDescriptor = Object.values(
        compartmentMap.compartments,
      ).find(compartment => compartment.label === 'goofy-v1.0.0');

      t.assert(compartmentDescriptor, 'compartment descriptor should exist');
      // the assert() call above should mean that we do not need this type assertion,
      // but return type of `t.assert()` is incorrect; it should use the `asserts` keyword.

      t.deepEqual(
        /** @type {CompartmentDescriptor} */ (compartmentDescriptor).path,
        expectedShortestPath,
        `compartment descriptor should have had path: ${expectedShortestPath.join('>')} (iteration ${i})`,
      );
    });
  }
}

test('mapNodeModules() should consider peerDependenciesMeta without corresponding peerDependencies when the dependency is present', async t => {
  t.plan(2);
  const readPowers = makeReadPowers({ fs, url });

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
});

test('mapNodeModules() should not consider peerDependenciesMeta without corresponding peerDependencies when the dependency is missing', async t => {
  const readPowers = makeReadPowers({ fs, url });

  const moduleLocation = new URL(
    'fixtures-missing-optional-peer-dependencies/node_modules/app/index.js',
    import.meta.url,
  ).href;

  const compartmentMap = await mapNodeModules(readPowers, moduleLocation);

  t.is(keys(compartmentMap.compartments).length, 1);
});
