// @ts-check

import { defaultParserForLanguage } from './archive-parsers.js';
import {
  makeAndHashArchive as makeAndHashArchiveLite,
  makeArchive as makeArchiveLite,
  mapLocation as mapLocationLite,
  hashLocation as hashLocationLite,
  writeArchive as writeArchiveLite,
} from './archive-lite.js';

export { makeArchiveCompartmentMap } from './archive-lite.js';

const { assign, create, freeze } = Object;

/** @import {ArchiveOptions} from './types.js' */
/** @import {ReadFn} from './types.js' */
/** @import {ReadPowers} from './types.js' */
/** @import {HashPowers} from './types.js' */
/** @import {WriteFn} from './types.js' */

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
 * @param {ReadFn | ReadPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<{bytes: Uint8Array, sha512?: string}>}
 */
export const makeAndHashArchive = async (powers, moduleLocation, options) =>
  makeAndHashArchiveLite(
    powers,
    moduleLocation,
    assignParserForLanguage(options),
  );

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Uint8Array>}
 */
export const makeArchive = async (powers, moduleLocation, options) =>
  makeArchiveLite(powers, moduleLocation, assignParserForLanguage(options));

/**
 * @param {ReadFn | ReadPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Uint8Array>}
 */
export const mapLocation = async (powers, moduleLocation, options) =>
  mapLocationLite(powers, moduleLocation, assignParserForLanguage(options));

/**
 * @param {HashPowers} powers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<string>}
 */
export const hashLocation = async (powers, moduleLocation, options) =>
  hashLocationLite(powers, moduleLocation, assignParserForLanguage(options));

/**
 * @param {WriteFn} write
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} archiveLocation
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 */
export const writeArchive = async (
  write,
  readPowers,
  archiveLocation,
  moduleLocation,
  options,
) =>
  writeArchiveLite(
    write,
    readPowers,
    archiveLocation,
    moduleLocation,
    assignParserForLanguage(options),
  );
