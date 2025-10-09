/* eslint-disable no-shadow */
import './ses-lockdown.js';
import test from 'ava';
import { mapNodeModules } from '../src/node-modules.js';
import { makeProjectFixtureReadPowers } from './project-fixture.js';
import { defaultParserForLanguage } from '../src/import-parsers.js';
import { captureFromMap } from '../capture-lite.js';
import { loadFromMap } from '../import-lite.js';
import { loadLocation } from '../import.js';

/**
 * @import {
 *   MakeImportHookMakerHooks,
 *   HookConfiguration,
 *   CanonicalName,
 *   ModuleSource,
 MaybeReadPowers,
 * } from '../src/types.js';
 * @import {ExecutionContext} from 'ava';
 * @import {ProjectFixture} from './test.types.js';
 */

/**
 * Test fixture with a simple entry module
 * @satisfies {ProjectFixture}
 */
const testFixture = /** @type {const} */ ({
  root: 'test-app',
  graph: {
    'test-app': [],
  },
  entrypoint: 'file:///node_modules/test-app/index.js',
});

/**
 * Test fixture with a module that imports a non-existent module
 * @satisfies {ProjectFixture}
 */

/**
 * AVA macro for testing moduleSource hook with different loader functions
 * @param {ExecutionContext} t
 * @param {object} options
 * @param {Function} options.loaderFn - The function to call (captureFromMap, loadFromMap, or loadLocation)
 * @param {(readPowers: MaybeReadPowers, entrypoint: string, options: object) => any} options.argsFn - Function that returns arguments for the loader function
 * @param {boolean} options.callImport - Whether to call application.import() after loading
 */
const moduleSourceHookTest = async (
  t,
  { loaderFn, argsFn, callImport = false },
) => {
  t.plan(7); // log, moduleSource, canonicalName type, hook called, canonicalName content, moduleSource type, moduleSource truthy

  const readPowers = makeProjectFixtureReadPowers(testFixture);

  let hookCalled = false;
  /** @type {object | undefined} */
  let receivedModuleSource;
  /** @type {CanonicalName | undefined} */
  let receivedCanonicalName;

  /** @type {HookConfiguration<MakeImportHookMakerHooks>} */
  const hooks = {
    moduleSource: ({ moduleSource, canonicalName, log }) => {
      hookCalled = true;
      receivedModuleSource = moduleSource;
      receivedCanonicalName = canonicalName;

      t.truthy(log, 'log function should be provided');
      t.truthy(moduleSource, 'moduleSource should be provided');
      t.is(typeof canonicalName, 'string', 'canonicalName should be a string');
    },
  };

  const options = {
    hooks,
    parserForLanguage: defaultParserForLanguage,
  };

  // Get the arguments for the loader function
  const args = await argsFn(readPowers, testFixture.entrypoint, options);

  // Call the loader function with the specified arguments
  const result = await loaderFn(...args);

  if (
    callImport &&
    typeof result === 'object' &&
    !!result &&
    'import' in result &&
    result.import &&
    typeof result.import === 'function'
  ) {
    await result.import();
  }

  // The hook should have been called during capture/loading
  t.true(hookCalled, 'moduleSource hook should have been called');

  // Verify the received parameters have expected content
  t.is(
    receivedCanonicalName,
    '$root$',
    'canonicalName should be the root compartment identifier',
  );

  t.truthy(receivedModuleSource, 'moduleSource should be truthy');
  t.snapshot(receivedModuleSource);
};

/**
 * Computes title for macro
 *
 * @param {string} providedTitle
 * @param {{loaderFn: Function}} options
 * @returns {string}
 */
moduleSourceHookTest.title = (providedTitle, { loaderFn }) =>
  `${providedTitle || ''} ${loaderFn.name}`.trim();

// #region tests
test(
  'captureFromMap - moduleSource hook receives correct parameters (snapshot)',
  moduleSourceHookTest,
  {
    loaderFn: captureFromMap,
    argsFn: async (readPowers, entrypoint, options) => {
      const compartmentMap = await mapNodeModules(readPowers, entrypoint);
      return [readPowers, compartmentMap, options];
    },
    callImport: false,
  },
);

test(
  'loadFromMap - moduleSource hook receives correct parameters (snapshot)',
  moduleSourceHookTest,
  {
    loaderFn: loadFromMap,
    argsFn: async (readPowers, entrypoint, options) => {
      const compartmentMap = await mapNodeModules(readPowers, entrypoint);
      return [readPowers, compartmentMap, options];
    },
    callImport: true,
  },
);

test(
  'loadLocation - moduleSource hook receives correct parameters (snapshot)',
  moduleSourceHookTest,
  {
    loaderFn: loadLocation,
    argsFn: (readPowers, entrypoint, options) => [
      readPowers,
      entrypoint,
      options,
    ],
    callImport: true,
  },
);
// #endregion
