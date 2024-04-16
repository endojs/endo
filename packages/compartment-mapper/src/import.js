// @ts-check
/* eslint no-shadow: "off" */

/** @import {Application, DynamicImportHook, ImportNowHookMaker, ModuleTransforms, SomeObject, SyncArchiveOptions, SyncReadPowers} from './types.js' */
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
  makeImportNowHookMaker,
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
 * @overload
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Application>}
 */

/**
 * @overload
 * @param {SyncReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {SyncArchiveOptions} options
 * @returns {Promise<Application>}
 */

/**
 * @param {ReadFn | ReadPowers|SyncReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {ArchiveOptions|SyncArchiveOptions} [options]
 * @returns {Promise<Application>}
 */
export const loadLocation = async (
  readPowers,
  moduleLocation,
  options = {},
) => {
  const {
    syncModuleTransforms = {},
    dev = false,
    tags = new Set(),
    searchSuffixes = undefined,
    commonDependencies = undefined,
    policy,
  } = options;

  /**
   * This type guard determines which of the two paths through the code is taken.
   *
   * If `options` is `SyncArchiveOptions`, we will permit dynamic requires. By definition, this must not include async module transforms, and must have a non-empty `dynamicHook`
   *
   * If `options` isn't `SyncArchiveOptions`, then no.
   *
   * @param {ArchiveOptions|SyncArchiveOptions} value
   * @returns {value is SyncArchiveOptions}
   */
  const isSyncOptions = value => 'dynamicHook' in value;

  const moduleTransforms = isSyncOptions(options)
    ? undefined
    : /** @type {ModuleTransforms} */ ({
        ...syncModuleTransforms,
        ...(options.moduleTransforms || {}),
      });

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
      fallbackLanguageForExtension = {},
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

    /** @type {ImportNowHookMaker | undefined} */
    let makeImportNowHook;

    /** @type {Compartment} */
    let compartment;
    /** @type {Promise<void>} */
    let pendingJobsPromise;

    // only if we are in "sync mode" do we create an ImportNowHookMaker
    if (isSyncOptions(options)) {
      makeImportNowHook = makeImportNowHookMaker(
        /** @type {SyncReadPowers} */ (readPowers),
        packageLocation,
        {
          compartmentDescriptors: compartmentMap.compartments,
          searchSuffixes,
          // type assertion is required here
          dynamicHook: options.dynamicHook,
        },
      );
      ({ compartment, pendingJobsPromise } = link(compartmentMap, {
        makeImportHook,
        makeImportNowHook,
        parserForLanguage,
        globals,
        transforms,
        syncModuleTransforms,
        __shimTransforms__,
        Compartment,
        fallbackLanguageForExtension,
      }));
    } else {
      ({ compartment, pendingJobsPromise } = link(compartmentMap, {
        makeImportHook,
        parserForLanguage,
        globals,
        transforms,
        moduleTransforms,
        __shimTransforms__,
        Compartment,
        fallbackLanguageForExtension,
      }));
    }

    await pendingJobsPromise;

    return compartment.import(moduleSpecifier);
  };

  return { import: execute };
};

/**
 * Disallows dynamic requires
 *
 * @overload
 * @param {ReadPowers|ReadFn} readPowers
 * @param {string} moduleLocation
 * @param {ExecuteOptions & ArchiveOptions} [options]
 * @returns {Promise<SomeObject>} the object of the imported modules exported
 * names.
 */

/**
 * Allows dynamic requires
 *
 * @overload
 * @param {SyncReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {ExecuteOptions & SyncArchiveOptions} options
 * @returns {Promise<SomeObject>} the object of the imported modules exported
 * names.
 */

/**
 * @param {ReadPowers|ReadFn|SyncReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {ExecuteOptions & (SyncArchiveOptions | ArchiveOptions)} [options]
 * @returns {Promise<SomeObject>} the object of the imported modules exported
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
