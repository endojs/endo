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

const dirname = url.fileURLToPath(new URL('.', import.meta.url));

/**
 * @import {ProjectFixture} from './test.types.js'
 * @import {FileUrlString, MapNodeModulesOptions, MaybeReadPowers, PackageCompartmentMapDescriptor} from '../src/types.js'
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
