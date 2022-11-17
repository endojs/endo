// @ts-check
/* eslint no-shadow: "off" */

/** @typedef {import('./types.js').Application} Application */
/** @typedef {import('./types.js').ArchiveOptions} ArchiveOptions */
/** @typedef {import('./types.js').ExecuteFn} ExecuteFn */
/** @typedef {import('./types.js').ExecuteOptions} ExecuteOptions */
/** @typedef {import('./types.js').ParserImplementation} ParserImplementation */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').ReadPowers} ReadPowers */

import { compartmentMapForNodeModules } from './node-modules.js';
import { search } from './search.js';
import { link } from './link.js';
import { makeImportHookMaker } from './import-hook.js';
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
  const { moduleTransforms = {}, dev = false, tags = new Set() } =
    options || {};

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
    { dev },
  );

  /** @type {ExecuteFn} */
  const execute = async (options = {}) => {
    const { globals, modules, transforms, __shimTransforms__, Compartment } =
      options;
    const makeImportHook = makeImportHookMaker(readPowers, packageLocation);
    const { compartment } = link(compartmentMap, {
      makeImportHook,
      parserForLanguage,
      globals,
      modules,
      transforms,
      moduleTransforms,
      __shimTransforms__,
      Compartment,
    });
    return compartment.import(moduleSpecifier);
  };

  return { import: execute };
};

/**
 * @param {ReadFn | ReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {ExecuteOptions & ArchiveOptions} [options]
 * @returns {Promise<Object>} the object of the imported modules exported
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
