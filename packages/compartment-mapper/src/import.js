// @ts-check
/* eslint no-shadow: "off" */

/** @import {Application} from './types.js' */
/** @import {ArchiveOptions} from './types.js' */
/** @import {ExecuteFn} from './types.js' */
/** @import {ExecuteOptions} from './types.js' */
/** @import {ParserImplementation} from './types.js' */
/** @import {ReadFn} from './types.js' */
/** @import {ReadPowers} from './types.js' */

import { compartmentMapForNodeModules } from './node-modules.js';
import { search } from './search.js';
import { link } from './link.js';
import {
  exitModuleImportHookMaker,
  makeImportHookMaker,
} from './import-hook.js';
import parserJson from './parse-json.js';
import parserText from './parse-text.js';
import parserBytes from './parse-bytes.js';
import parserCjs from './parse-cjs.js';
import parserMjs from './parse-mjs.js';
import { parseLocatedJson } from './json.js';
import { unpackReadPowers } from './powers.js';

/** @type {Record<string, ParserImplementation>} */
export const parserForLanguage = {
  mjs: parserMjs,
  cjs: parserCjs,
  json: parserJson,
  text: parserText,
  bytes: parserBytes,
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Application>}
 */
export const loadLocation = async (readPowers, moduleLocation, options) => {
  const {
    moduleTransforms = {},
    dev = false,
    tags = new Set(),
    searchSuffixes = undefined,
    commonDependencies = undefined,
    policy,
  } = options || {};

  const { read } = unpackReadPowers(readPowers);

  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(read, moduleLocation);

  const packageDescriptor = parseLocatedJson(
    packageDescriptorText,
    packageDescriptorLocation,
  );
  const compartmentMap = await compartmentMapForNodeModules(
    readPowers,
    packageLocation,
    tags,
    packageDescriptor,
    moduleSpecifier,
    { dev, commonDependencies, policy },
  );

  /** @type {ExecuteFn} */
  const execute = async (options = {}) => {
    const {
      globals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment,
      importHook: exitModuleImportHook,
    } = options;
    const compartmentExitModuleImportHook = exitModuleImportHookMaker({
      modules,
      exitModuleImportHook,
    });
    const makeImportHook = makeImportHookMaker(readPowers, packageLocation, {
      compartmentDescriptors: compartmentMap.compartments,
      searchSuffixes,
      archiveOnly: false,
      entryCompartmentName: packageLocation,
      entryModuleSpecifier: moduleSpecifier,
      exitModuleImportHook: compartmentExitModuleImportHook,
    });
    const { compartment, pendingJobsPromise } = link(compartmentMap, {
      makeImportHook,
      parserForLanguage,
      globals,
      transforms,
      moduleTransforms,
      __shimTransforms__,
      Compartment,
    });

    await pendingJobsPromise;

    return compartment.import(moduleSpecifier);
  };

  return { import: execute };
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {ExecuteOptions & ArchiveOptions} [options]
 * @returns {Promise<import('./types.js').SomeObject>} the object of the imported modules exported
 * names.
 */
export const importLocation = async (
  readPowers,
  moduleLocation,
  options = {},
) => {
  const application = await loadLocation(readPowers, moduleLocation, options);
  return application.import(options);
};
