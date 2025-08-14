/**
 * Provides functions for evaluating modules in an archive (a zip file
 * with a `compartment-map.json` and a file for a module and each of its
 * transitive dependencies.)
 *
 * These functions accept the URL of an entry module and find its transitive
 * dependencies through the Node.js `node_modules` conventions.
 *
 * These functions use the default parsers in `import-archive-parsers.js`,
 * which support only pre-compiled ESM and CommonJS.
 *
 * See `import-archive-lite.js` for functions that are not coupled to these
 * parsers or the `node_modules` conventions without necessarily entraining a
 * dependency on Babel.
 *
 * @module
 */

/**
 * @import {
 *   Application,
 *   ExecuteOptions,
 *   LoadArchiveOptions,
 *   ReadPowers,
 *   ParserForLanguage,
 *   ParseArchiveOptions,
 *   ReadFn,
 * } from './types.js'
 */

import { defaultParserForLanguage } from './import-archive-parsers.js';
import {
  parseArchive as parseArchiveLite,
  loadArchive as loadArchiveLite,
  importArchive as importArchiveLite,
} from './import-archive-lite.js';

const { assign, create, freeze } = Object;

/**
 * Add the default parserForLanguage option.
 * @param {ParseArchiveOptions} [options]
 * @returns {ParseArchiveOptions}
 */
const assignParserForLanguage = (options = {}) => {
  const { parserForLanguage: parserForLanguageOption, ...rest } = options;
  /** @type {ParserForLanguage} */
  const parserForLanguage = freeze(
    assign(create(null), defaultParserForLanguage, parserForLanguageOption),
  );
  return { ...rest, parserForLanguage };
};

/**
 * @param {Uint8Array} archiveBytes
 * @param {string} [archiveLocation]
 * @param {ParseArchiveOptions} [options]
 * @returns {Promise<Application>}
 */
export const parseArchive = async (
  archiveBytes,
  archiveLocation = '<unknown>',
  options = {},
) =>
  parseArchiveLite(
    archiveBytes,
    archiveLocation,
    assignParserForLanguage(options),
  );

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {LoadArchiveOptions} [options]
 * @returns {Promise<Application>}
 */
export const loadArchive = async (readPowers, archiveLocation, options) =>
  loadArchiveLite(
    readPowers,
    archiveLocation,
    assignParserForLanguage(options),
  );

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {ExecuteOptions & LoadArchiveOptions} options
 * @returns {Promise<object>}
 */
export const importArchive = async (readPowers, archiveLocation, options) =>
  importArchiveLite(
    readPowers,
    archiveLocation,
    assignParserForLanguage(options),
  );
