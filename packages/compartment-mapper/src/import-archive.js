// @ts-check
/* eslint no-shadow: "off" */

import { readZip } from '@endo/zip';
import { assemble } from './assemble.js';
import { parsePreCjs } from './parse-pre-cjs.js';
import { parseJson } from './parse-json.js';
import { parsePreMjs } from './parse-pre-mjs.js';
import { parseLocatedJson } from './json.js';

// q as in quote for strings in error messages.
const q = JSON.stringify;

const textDecoder = new TextDecoder();

/** @type {Record<string, ParseFn>} */
export const parserForLanguage = {
  precjs: parsePreCjs,
  premjs: parsePreMjs,
  json: parseJson,
};

/**
 * @callback ArchiveImportHookMaker
 * @param {string} packageLocation
 * @returns {ImportHook}
 */

/**
 * @param {ArchiveReader} archive
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @param {string} archiveLocation
 * @returns {ArchiveImportHookMaker}
 */
const makeArchiveImportHookMaker = (archive, compartments, archiveLocation) => {
  // per-assembly:
  /** @type {ArchiveImportHookMaker} */
  const makeImportHook = packageLocation => {
    // per-compartment:
    const { modules } = compartments[packageLocation];
    /** @type {ImportHook} */
    const importHook = async moduleSpecifier => {
      // per-module:
      const module = modules[moduleSpecifier];
      if (module.parser === undefined) {
        throw new Error(
          `Cannot parse module ${q(moduleSpecifier)} in package ${q(
            packageLocation,
          )} in archive ${q(archiveLocation)}`,
        );
      }
      const parse = parserForLanguage[module.parser];
      if (parse === undefined) {
        throw new Error(
          `Cannot parse ${q(module.parser)} module ${q(
            moduleSpecifier,
          )} in package ${q(packageLocation)} in archive ${q(archiveLocation)}`,
        );
      }
      const moduleLocation = `${packageLocation}/${module.location}`;
      const moduleBytes = await archive.read(moduleLocation);
      // eslint-disable-next-line no-await-in-loop
      const { record } = await parse(
        moduleBytes,
        moduleSpecifier,
        `file:///${moduleLocation}`,
        packageLocation,
      );
      return record;
    };
    return importHook;
  };
  return makeImportHook;
};

/**
 * @param {Uint8Array} archiveBytes
 * @param {string} archiveLocation
 * @returns {Promise<Application>}
 */
export const parseArchive = async (archiveBytes, archiveLocation) => {
  const archive = await readZip(archiveBytes, archiveLocation);

  const compartmentMapBytes = await archive.read('compartment-map.json');
  const compartmentMapText = textDecoder.decode(compartmentMapBytes);
  const compartmentMap = /** @type {CompartmentMapDescriptor} */ (parseLocatedJson(
    compartmentMapText,
    'compartment-map.json',
  ));

  // TODO validate compartmentMap instead of leaning hard on the above type
  // assertion.

  /** @type {ExecuteFn} */
  const execute = options => {
    const {
      globals,
      globalLexicals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment,
    } = options || {};
    const {
      compartments,
      entry: { module: moduleSpecifier },
    } = compartmentMap;
    const makeImportHook = makeArchiveImportHookMaker(
      archive,
      compartments,
      archiveLocation,
    );
    const compartment = assemble(compartmentMap, {
      makeImportHook,
      parserForLanguage,
      globals,
      globalLexicals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment,
    });
    return compartment.import(moduleSpecifier);
  };

  return { import: execute };
};

/**
 * @param {ReadFn} read
 * @param {string} archiveLocation
 * @returns {Promise<Application>}
 */
export const loadArchive = async (read, archiveLocation) => {
  const archiveBytes = await read(archiveLocation);
  return parseArchive(archiveBytes, archiveLocation);
};

/**
 * @param {ReadFn} read
 * @param {string} archiveLocation
 * @param {ExecuteOptions} options
 * @returns {Promise<Object>}
 */
export const importArchive = async (read, archiveLocation, options) => {
  const archive = await loadArchive(read, archiveLocation);
  return archive.import(options);
};
