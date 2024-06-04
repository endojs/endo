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

/** @import {CompartmentMapDescriptor} from './types.js' */
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
} from './import-hook.js';

const { assign, create, freeze } = Object;

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {LoadLocationOptions} [options]
 * @returns {Promise<Application>}
 */
export const loadFromMap = async (readPowers, compartmentMap, options = {}) => {
  const {
    moduleTransforms = {},
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
    const { compartment, pendingJobsPromise } = link(compartmentMap, {
      makeImportHook,
      parserForLanguage,
      languageForExtension,
      globals,
      transforms,
      moduleTransforms,
      __shimTransforms__,
      Compartment,
    });

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
