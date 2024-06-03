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
