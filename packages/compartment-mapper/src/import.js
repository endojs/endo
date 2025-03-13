/**
 * @module Provides functions for evaluating a module and its transitive
 * dependencies given the URL of the entry module and assuming packages laid
 * out according to the `node_modules` conventions.
 *
 * To import modules according to any other convention, use `import-lite.js`
 * and provide a compartment map with a custom analog to `mapNodeModules` from
 * `node-modules.js`.
 *
 * The default `parserForLanguage` is `import-parsers.js`, which is suitable
 * for most cases.
 */

/**
 * @import {
 *   Application,
 *   SyncImportLocationOptions,
 *   ImportLocationOptions,
 *   SyncArchiveOptions,
 *   LoadLocationOptions,
 *   SomeObject,
 *   ReadNowPowers,
 *   ArchiveOptions,
 *   ReadFn,
 *   ReadPowers,
 * } from './types.js'
 */

import { defaultParserForLanguage } from './import-parsers.js';
import { mapNodeModules } from './node-modules.js';
import { loadFromMap } from './import-lite.js';

const { assign, create, freeze } = Object;

/**
 * Add the default parserForLanguage option.
 * @param {ArchiveOptions} [options]
 * @returns {ArchiveOptions}
 */
const assignParserForLanguage = (options = {}) => {
  const { parserForLanguage: parserForLanguageOption, ...rest } = options;
  const parserForLanguage = freeze(
    assign(create(null), defaultParserForLanguage, parserForLanguageOption),
  );
  const languages = Object.keys(parserForLanguage);
  return { ...rest, parserForLanguage, languages };
};

/**
 * @overload
 * @param {ReadNowPowers} readPowers
 * @param {string} moduleLocation
 * @param {SyncArchiveOptions} options
 * @returns {Promise<Application>}
 */

/**
 * @overload
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {LoadLocationOptions} [options]
 * @returns {Promise<Application>}
 */

/**
 * @param {ReadFn|ReadPowers|ReadNowPowers} readPowers
 * @param {string} moduleLocation
 * @param {LoadLocationOptions} [options]
 * @returns {Promise<Application>}
 */
export const loadLocation = async (
  readPowers,
  moduleLocation,
  options = {},
) => {
  const {
    dev,
    tags,
    strict,
    commonDependencies,
    policy,
    parserForLanguage,
    languages,
    languageForExtension,
    commonjsLanguageForExtension,
    moduleLanguageForExtension,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
    ...otherOptions
  } = assignParserForLanguage(options);
  // conditions are not present in SyncArchiveOptions
  const conditions =
    'conditions' in options ? options.conditions || tags : tags;
  const compartmentMap = await mapNodeModules(readPowers, moduleLocation, {
    dev,
    strict,
    conditions,
    commonDependencies,
    policy,
    languageForExtension,
    commonjsLanguageForExtension,
    moduleLanguageForExtension,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
    languages,
  });
  return loadFromMap(readPowers, compartmentMap, {
    parserForLanguage,
    ...otherOptions,
  });
};

/**
 * Allows dynamic requires
 *
 * @overload
 * @param {ReadNowPowers} readPowers
 * @param {string} moduleLocation
 * @param {SyncImportLocationOptions} options
 * @returns {Promise<SomeObject>} the object of the imported modules exported
 * names.
 */

/**
 * Disallows dynamic requires
 *
 * @overload
 * @param {ReadPowers|ReadFn} readPowers
 * @param {string} moduleLocation
 * @param {ImportLocationOptions} [options]
 * @returns {Promise<SomeObject>} the object of the imported modules exported
 * names.
 */

/**
 * @param {ReadPowers|ReadFn|ReadNowPowers} readPowers
 * @param {string} moduleLocation
 * @param {ImportLocationOptions|SyncImportLocationOptions} [options]
 * @returns {Promise<SomeObject>} the object of the imported modules exported
 * names.
 */
export const importLocation = async (readPowers, moduleLocation, options) => {
  const application = await loadLocation(readPowers, moduleLocation, options);
  return application.import(options);
};
