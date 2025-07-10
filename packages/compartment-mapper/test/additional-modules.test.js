/* eslint-disable import/no-dynamic-require */
import 'ses';

import fs from 'node:fs';
import url from 'node:url';
import test from 'ava';
import { Module } from 'node:module';
import path from 'node:path';
import { mapNodeModules } from '../src/node-modules.js';
import { makeReadNowPowers } from '../src/node-powers.js';
import {
  ATTENUATORS_COMPARTMENT,
  WILDCARD_POLICY_VALUE,
} from '../src/policy-format.js';
import { importLocation } from '../src/import.js';
import { captureFromMap } from '../capture-lite.js';
import { defaultParserForLanguage } from '../archive-parsers.js';

/**
 * @import {AdditionalModuleLocationObject,
 *  AdditionalPackageDetails,
 *  ExitModuleImportNowHook,
 *  MapNodeModulesOptions,
 *  ExitModuleImportHook,
 *  MaybeReadPowers,
 *  ReadNowPowers,
 *  SomePolicy} from '../src/types.js';
 * @import {ExecutionContext} from 'ava';
 * @import {ThirdPartyStaticModuleInterface} from 'ses'
 */

const { keys, values, freeze, assign } = Object;

const defaultReadPowers = makeReadNowPowers({ fs, url, path });

const entryModuleLocation = new URL(
  'fixtures-dynamic-ancestor/node_modules/pantspack/pantspack.js',
  import.meta.url,
).href;

const defaultPantspackConfigModuleLocation = new URL(
  'fixtures-dynamic-ancestor/node_modules/webpackish-app/pantspack.config.js',
  import.meta.url,
).href;

/**
 * In this case, we want to set the `dev` flag to `true`, since the only way
 * `jorts-folder` is discoverable is if we crawl `webpackish-app`'s dev
 * dependencies.
 *
 * _Note_: We do _not_ want to set `dev` to `true` for the entry module
 * (`pantspack`) since it's _itself_ a dev dependency of `webpackish-app`—
 * unless we're testing that behavior, of course!
 * @type {AdditionalModuleLocationObject}
 */
const defaultPantspackConfigAdditionalModuleLocationObject = {
  location: defaultPantspackConfigModuleLocation,
  dev: true,
};

const defaultAdditionalModuleLocations = [
  defaultPantspackConfigAdditionalModuleLocationObject,
];

/** @type {SomePolicy} */
const defaultPolicy = {
  entry: {
    packages: WILDCARD_POLICY_VALUE,
    globals: WILDCARD_POLICY_VALUE,
    builtins: WILDCARD_POLICY_VALUE,
  },
  resources: {
    'webpackish-app': {
      packages: {
        pantspack: true,
        'webpackish-app>jorts-folder': true,
      },
    },
    'pantspack-folder-runner': {
      packages: {
        'webpackish-app>jorts-folder': true,
      },
    },
  },
};

/**
 * Just applies defaults to `mapNodeModules()`
 *
 * @param {MapNodeModulesOptions & {readPowers?: ReadNowPowers<any>}} [options] Extra options for `mapNodeModules()` and {@link MaybeReadPowers} (w/o additional module options)
 */
const mapNodeModulesForAdditionalModules = async ({
  readPowers = defaultReadPowers,
  additionalModuleLocations = defaultAdditionalModuleLocations,
  additionalPackageDetails = [],
  ...options
} = {}) =>
  mapNodeModules(readPowers, entryModuleLocation, {
    additionalModuleLocations,
    additionalPackageDetails,
    ...options,
  });

const testAdditionalModulesOk = test.macro(
  /**
   * @template [Context=unknown]
   * @param {ExecutionContext<Context>} t Test context
   * @param {Omit<MapNodeModulesOptions, 'additionalPackageDetails'> & {readPowers?: ReadNowPowers<any>}} [options] Extra options for `mapNodeModules()` and {@link MaybeReadPowers} (w/o additional package details)
   */
  async (
    t,
    {
      additionalModuleLocations = defaultAdditionalModuleLocations,
      ...options
    } = {},
  ) => {
    t.plan(7);

    /**
     * This array will be populated by {@link mapNodeModules}
     * @type {AdditionalPackageDetails[]}
     */
    const additionalPackageDetails = [];

    const { compartments, entry } = await mapNodeModulesForAdditionalModules({
      additionalPackageDetails,
      additionalModuleLocations,
      log: t.log.bind(t),
      ...options,
    });

    const pantspackConfigPackageLocation = new URL(
      '.',
      defaultPantspackConfigModuleLocation,
    ).href;

    t.like(
      additionalPackageDetails,
      [
        {
          ...(typeof additionalModuleLocations[0] === 'object'
            ? additionalModuleLocations[0]
            : { location: additionalModuleLocations[0] }),
          packageDescriptor: { name: 'webpackish-app', version: '1.2.3' },
          packageLocation: pantspackConfigPackageLocation,
        },
      ],
      'additionalPackageDetails should contain details about additional module location(s)',
    );

    const entryCompartmentDescriptor = compartments[entry.compartment];

    const additionalPackageCompartmentDescriptor =
      compartments[pantspackConfigPackageLocation];

    const jortsFolderCompartmentDescriptor =
      compartments[
        /** @type {string} */ (
          additionalPackageCompartmentDescriptor.modules['jorts-folder']
            .compartment
        )
      ];

    const pantspackFolderRunnerCompartmentDescriptor =
      compartments[
        /** @type {string} */ (
          entryCompartmentDescriptor.modules['pantspack-folder-runner']
            .compartment
        )
      ];
    t.like(
      pantspackFolderRunnerCompartmentDescriptor,
      {
        retained: undefined,
        // currently, this is `webpackish-app>pantspack-folder-runner`, which is nonsensical
        path: ['pantspack-folder-runner'],
      },
      'compartment descriptor for `pantspack-folder-runner` should not have been retained and should be a child of the entry',
    );

    t.like(
      additionalPackageCompartmentDescriptor,
      {
        retained: true,
        modules: {
          'jorts-folder': {
            retained: true,
          },
          '.': {
            retained: true,
          },
        },
        path: ['webpackish-app'],
      },
      'compartment descriptor for `webpackish-app` should have been retained and have a retained module module descriptor referencing `jorts-folder` (and itself)',
    );

    t.like(
      jortsFolderCompartmentDescriptor,
      {
        retained: true,
        path: ['webpackish-app', 'jorts-folder'],
      },
      'compartment descriptor for `jorts-folder` should have been retained and be a child of `webpackish-app`',
    );

    t.is(
      keys(entryCompartmentDescriptor.modules).length,
      3,
      'entry compartment descriptor should have no extra modules',
    );

    t.like(
      entryCompartmentDescriptor,
      {
        retained: undefined,
        path: [],
      },
      'entry compartment descriptor should not have been retained and should have an empty path',
    );

    t.deepEqual(
      values(compartments)
        .filter(({ name }) => name !== ATTENUATORS_COMPARTMENT)
        .map(({ name }) => name)
        .sort(),
      [
        'webpackish-app',
        'pantspack',
        'pantspack-folder-runner',
        'jorts-folder',
      ].sort(),
      'compartmentMap.compartments should contain all expected compartment descriptors',
    );
  },
);

test(
  'mapNodeModules() - should accept additional module locations w/o policy',
  testAdditionalModulesOk,
);

test(
  'mapNodeModules() - should accept additional module locations w/ policy',
  testAdditionalModulesOk,
  {
    policy: defaultPolicy,
  },
);

test('mapNodeModules() - should apply `dev` flag to additional module locations if not otherwise provided', async t => {
  const { compartments } = await mapNodeModulesForAdditionalModules({
    additionalModuleLocations: [defaultPantspackConfigModuleLocation],
    dev: true,
  });

  t.assert(
    values(compartments).find(({ name }) => name === 'pantstest'),
    'compartment descriptor for `pantstest` should exist',
  );

  t.deepEqual(
    values(compartments)
      .filter(({ name }) => name !== ATTENUATORS_COMPARTMENT)
      .map(({ name }) => name)
      .sort(),
    [
      'webpackish-app',
      'pantspack',
      'pantspack-folder-runner',
      'jorts-folder',
      'pantstest',
    ].sort(),
    'compartmentMap.compartments should contain all expected compartment descriptors',
  );
});

/**
 * @type {ExitModuleImportNowHook}
 */
const defaultImportNowHook = (specifier, packageLocation) => {
  const require = Module.createRequire(
    defaultReadPowers.fileURLToPath(packageLocation),
  );
  // console.trace(`defaultImportNowHook: ${specifier} from ${packageLocation}`);
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

/**
 * @type {ExitModuleImportHook}
 */
const defaultImportHook = async (specifier, packageLocation) => {
  await Promise.resolve();
  return defaultImportNowHook(specifier, packageLocation);
};

test('importLocation() - should allow execution of additional modules', async t => {
  const additionalPackageDetails = [];
  const { namespace } = await importLocation(
    defaultReadPowers,
    entryModuleLocation,
    {
      additionalModuleLocations: defaultAdditionalModuleLocations,
      additionalPackageDetails,
      importNowHook: defaultImportNowHook,
      importHook: defaultImportHook,
      policy: defaultPolicy,
      log: t.log.bind(t),
    },
  );

  t.like(namespace, [
    {
      packageDescriptor: { name: 'webpackish-app' },
      foldedSources: ['webpackish-app-v1.2.3'],
    },
  ]);
});

test('captureFromMap() - should retain additional module locations', async t => {
  /**
   * @type {AdditionalPackageDetails[]}
   */
  const additionalPackageDetails = [];

  const nodeCompartmentMap = await mapNodeModules(
    defaultReadPowers,
    entryModuleLocation,
    {
      additionalModuleLocations: defaultAdditionalModuleLocations,
      additionalPackageDetails,
    },
  );

  const { captureCompartmentMap } = await captureFromMap(
    defaultReadPowers,
    nodeCompartmentMap,
    {
      // we are NOT pre-compiling sources
      parserForLanguage: defaultParserForLanguage,
      additionalPackageDetails,
    },
  );

  t.deepEqual(
    keys(captureCompartmentMap.compartments).sort(),
    [
      'pantspack-v1.0.0',
      'pantspack-folder-runner-v1.0.0',
      'webpackish-app-v1.2.3',
      'jorts-folder-v1.0.0',
    ].sort(),
  );
});
