/* Provides functions for evaluating a module and its transitive dependencies
 * given a partially completed compartment map.
 * The compartment map needs to describe every reachable compartment, where to
 * find modules in that compartment, and how to link modules between
 * compartments, but does not need to capture a module descriptor for every
 * module in the working set of transitive dependencies from the entry module.
 *
 * These functions do not have a bias for any particular mapping, so you will
 * need to use `mapNodeModules` from `@endo/compartment-map/node-modules.js` or
 * a similar device to construct one.
 *
 * The default `parserForLanguage` mapping is empty.
 * You will need to provide the `defaultParserForLanguage` from
 * `@endo/compartment-mapper/import-parsers.js` or similar.
 */

// @ts-check
/* eslint no-shadow: "off" */

/** @import {ArchiveOptions, CompartmentMapDescriptor, ImportLocationSyncOptions, ImportNowHookMaker, LoadArchiveOptions, ModuleTransforms, SyncArchiveOptions, SyncReadPowers} from './types.js' */
/** @import {Application} from './types.js' */
/** @import {ImportLocationOptions} from './types.js' */
/** @import {LoadLocationOptions} from './types.js' */
/** @import {ExecuteFn} from './types.js' */
/** @import {ReadFn} from './types.js' */
/** @import {ReadPowers} from './types.js' */
/** @import {SomeObject} from './types.js' */

import { link } from './link.js';
import {
  exitModuleImportHookMaker,
  makeImportHookMaker,
  makeImportNowHookMaker,
} from './import-hook.js';

const { assign, create, freeze } = Object;

/**
 * @overload
 * @param {SyncReadPowers} readPowers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ImportLocationSyncOptions} options
 * @returns {Promise<Application>}
 */

/**
 * @overload
 * @param {ReadFn | ReadPowers} readPowers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ImportLocationOptions} [options]
 * @returns {Promise<Application>}
 */

/**
 * @param {ReadFn|ReadPowers|SyncReadPowers} readPowers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ImportLocationOptions} [options]
 * @returns {Promise<Application>}
 */

export const loadFromMap = async (readPowers, compartmentMap, options = {}) => {
  const {
    syncModuleTransforms = {},
    searchSuffixes = undefined,
    parserForLanguage: parserForLanguageOption = {},
    languageForExtension: languageForExtensionOption = {},
  } = options;

  const parserForLanguage = freeze(
    assign(create(null), parserForLanguageOption),
  );
  const languageForExtension = freeze(
    assign(create(null), languageForExtensionOption),
  );

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
  const {
    entry: { compartment: entryCompartmentName, module: entryModuleSpecifier },
  } = compartmentMap;

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
    const makeImportHook = makeImportHookMaker(
      readPowers,
      entryCompartmentName,
      {
        compartmentDescriptors: compartmentMap.compartments,
        searchSuffixes,
        archiveOnly: false,
        entryCompartmentName,
        entryModuleSpecifier,
        exitModuleImportHook: compartmentExitModuleImportHook,
      },
    );

    /** @type {ImportNowHookMaker | undefined} */
    let makeImportNowHook;

    /** @type {Compartment} */
    let compartment;
    /** @type {Promise<void>} */
    let pendingJobsPromise;

    if (isSyncOptions(options)) {
      makeImportNowHook = makeImportNowHookMaker(
        /** @type {SyncReadPowers} */ (readPowers),
        entryCompartmentName,
        {
          compartmentDescriptors: compartmentMap.compartments,
          searchSuffixes,
          dynamicHook: options.dynamicHook,
        },
      );
      ({ compartment, pendingJobsPromise } = link(compartmentMap, {
        makeImportHook,
        makeImportNowHook,
        parserForLanguage,
        languageForExtension,
        globals,
        transforms,
        syncModuleTransforms,
        __shimTransforms__,
        Compartment,
      }));
    } else {
      ({ compartment, pendingJobsPromise } = link(compartmentMap, {
        makeImportHook,
        parserForLanguage,
        languageForExtension,
        globals,
        transforms,
        moduleTransforms,
        syncModuleTransforms,
        __shimTransforms__,
        Compartment,
      }));
    }

    await pendingJobsPromise;

    return compartment.import(entryModuleSpecifier);
  };

  return { import: execute };
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {ImportLocationOptions} [options]
 * @returns {Promise<SomeObject>} the object of the imported modules exported
 * names.
 */
export const importFromMap = async (
  readPowers,
  compartmentMap,
  options = {},
) => {
  const application = await loadFromMap(readPowers, compartmentMap, options);
  return application.import(options);
};
