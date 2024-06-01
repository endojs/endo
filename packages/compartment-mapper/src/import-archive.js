// @ts-check

import { defaultParserForLanguage } from './import-archive-parsers.js';
import {
  parseArchive as parseArchiveLite,
  loadArchive as loadArchiveLite,
  importArchive as importArchiveLite,
} from './import-archive-lite.js';

const { assign, create, freeze } = Object;

/** @import {Application, ComputeSourceLocationHook, ComputeSourceMapLocationHook, ExecuteOptions, ExitModuleImportHook, HashFn, LoadArchiveOptions, ReadPowers} from './types.js' */
/** @import {ParserForLanguage} from './types.js' */

// Have to give it a name to capture the external meaning of Compartment
// Otherwise @param {typeof Compartment} takes the Compartment to mean
// the const variable defined within the function.
//
/** @typedef {typeof Compartment} CompartmentConstructor */

/**
 * @typedef {object} Options
 * @property {string} [expectedSha512]
 * @property {HashFn} [computeSha512]
 * @property {Record<string, unknown>} [modules]
 * @property {ExitModuleImportHook} [importHook]
 * @property {CompartmentConstructor} [Compartment]
 * @property {ComputeSourceLocationHook} [computeSourceLocation]
 * @property {ComputeSourceMapLocationHook} [computeSourceMapLocation]
 * @property {ParserForLanguage} [parserForLanguage]
 */

/**
 * Add the default parserForLanguage option.
 * @param {Options} [options]
 * @returns {Options}
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
 * @param {Options} [options]
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
 * @param {import('@endo/zip').ReadFn | ReadPowers} readPowers
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
 * @param {import('@endo/zip').ReadFn | ReadPowers} readPowers
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
