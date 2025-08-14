import 'ses';

import fs from 'node:fs';
import url from 'node:url';
import test from 'ava';
import { mapNodeModules } from '../src/node-modules.js';
import { makeReadPowers } from '../src/node-powers.js';
import {
  dumpCompartmentMap,
  dumpProjectFixture,
  makeProjectFixtureReadPowers,
} from './project-fixture.js';

/**
 * @import {ProjectFixture} from './test.types.js'
 */

const { keys, values } = Object;

const CORRECT_CANONICAL_NAME = 'paperino>topolino>goofy';

test(`mapNodeModules() should return compartment descriptors containing shortest path`, async t => {
  const readPowers = makeReadPowers({ fs, url });
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
  },
);

test('mapNodeModules() should not consider peerDependenciesMeta without corresponding peerDependencies when the dependency is missing', async t => {
  const moduleLocation = new URL(
    'fixtures-missing-optional-peer-dependencies/node_modules/app/index.js',
    import.meta.url,
  ).href;
  const readPowers = makeReadPowers({ fs, url });
  const compartmentMap = await mapNodeModules(readPowers, moduleLocation);

  t.is(keys(compartmentMap.compartments).length, 1);
});

{
  /**
   * We will iterate at most _n_ times to trigger path flakiness
   */
  const shortestPathTestCount = 20;

  /** @type {ProjectFixture} */
  const fixture = {
    root: 'app',
    graph: {
      app: ['pippo', 'paperino'],
      paperino: ['topolino'],
      pippo: ['gambadilegno'],
      gambadilegno: ['topolino'],
      topolino: ['goofy'],
    },
  };

  const entrypoint = 'file:///node_modules/app/index.js';

  test(`mapNodeModules() should be path stable`, async t => {
    await null;

    t.plan(shortestPathTestCount);
    /** @type {string|undefined} */
    let expectedCanonicalName;

    const targetLabel = 'paperino>topolino>goofy';

    const readPowers = makeProjectFixtureReadPowers(fixture, {
      randomDelay: true,
    });

    for (let i = 0; i < shortestPathTestCount; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const compartmentMap = await mapNodeModules(readPowers, entrypoint);

      const compartmentDescriptor = Object.values(
        compartmentMap.compartments,
      ).find(compartment => compartment.label === targetLabel);
      if (!compartmentDescriptor) {
        t.fail(
          `compartment descriptor for '${targetLabel}' should exist, but it does not`,
        );

        dumpProjectFixture(t, fixture);
        dumpCompartmentMap(t, compartmentMap);
        return;
      }

      const { label } = compartmentDescriptor;
      if (!label) {
        t.fail(
          `label for '${compartmentDescriptor.name}' should exist, but it does not`,
        );

        dumpProjectFixture(t, fixture);
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
        dumpProjectFixture(t, fixture);
        dumpCompartmentMap(t, compartmentMap);
        throw err;
      }
    }
  });
}
