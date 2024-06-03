// @ts-check

import { defaultParserForLanguage } from './import-parsers.js';
import { mapNodeModules } from './node-modules.js';
import { loadFromMap } from './import-lite.js';

const { assign, create, freeze } = Object;

/** @import {Application} from './types.js' */
/** @import {ArchiveOptions} from './types.js' */
/** @import {ExecuteOptions} from './types.js' */
/** @import {ReadFn} from './types.js' */
/** @import {ReadPowers} from './types.js' */

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
  return { ...rest, parserForLanguage };
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Application>}
 */
export const loadLocation = async (
  readPowers,
  moduleLocation,
  options = {},
) => {
  const { dev, tags, commonDependencies, policy } = options;
  const compartmentMap = await mapNodeModules(readPowers, moduleLocation, {
    dev,
    tags,
    commonDependencies,
    policy,
  });
  return loadFromMap(
    readPowers,
    compartmentMap,
    assignParserForLanguage(options),
  );
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {ExecuteOptions & ArchiveOptions} [options]
 * @returns {Promise<import('./types.js').SomeObject>} the object of the imported modules exported
 * names.
 */
export const importLocation = async (readPowers, moduleLocation, options) => {
  const application = await loadLocation(readPowers, moduleLocation, options);
  return application.import(options);
};
