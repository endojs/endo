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
 *   CanonicalName,
 *   MaybeReadPowers,
 *   ModuleSourceHook,
 * } from '../src/types.js';
 * @import {ExecutionContext} from 'ava';
 * @import {ProjectFixture} from './test.types.js';
 */

/**
 * Test fixture with a simple entry module
 * @type {ProjectFixture}
 */
const testFixture = {
  root: 'test-app',
  graph: {
    'test-app': [],
  },
  entrypoint: 'file:///node_modules/test-app/index.js',
};

/**
 * AVA macro for testing moduleSource hook with different loader functions
 *
 * This could be more narrowly-typed, but it's a test.
 *
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

  /** @type {ModuleSourceHook} */
  const moduleSourceHook = ({ moduleSource, canonicalName, log }) => {
    hookCalled = true;
    receivedModuleSource = moduleSource;
    receivedCanonicalName = canonicalName;

    t.truthy(log, 'log function should be provided');
    t.truthy(moduleSource, 'moduleSource should be provided');
    t.is(typeof canonicalName, 'string', 'canonicalName should be a string');
  };

  const options = {
    moduleSourceHook,
    parserForLanguage: defaultParserForLanguage,
  };

  const args = await argsFn(
    readPowers,
    /** @type {string} */ (testFixture.entrypoint),
    options,
  );

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
  'captureFromMap - moduleSourceHook - receives correct parameters (snapshot)',
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
  'loadFromMap - moduleSourceHook - receives correct parameters (snapshot)',
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
  'loadLocation - moduleSourceHook - receives correct parameters (snapshot)',
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
