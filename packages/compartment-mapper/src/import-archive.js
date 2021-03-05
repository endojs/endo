// @ts-check
/* eslint no-shadow: "off" */

import { readZip } from './zip.js';
import { assemble } from './assemble.js';
import { parserForLanguage } from './parse.js';
import * as json from './json.js';

// q as in quote for strings in error messages.
const q = JSON.stringify;

const decoder = new TextDecoder();

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
      const moduleSource = decoder.decode(moduleBytes);
      return parse(
        moduleSource,
        moduleSpecifier,
        `file:///${moduleLocation}`,
        packageLocation,
      ).record;
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
  const compartmentMapText = decoder.decode(compartmentMapBytes);
  const compartmentMap = /** @type {CompartmentMapDescriptor} */ (json.parse(
    compartmentMapText,
    'compartment-map.json',
  ));

  // TODO validate compartmentMap instead of leaning hard on the above type
  // assertion.

  /**
   * @param {ExecuteOptions} options
   * @returns {Promise<Object>}
   */
  const execute = options => {
    const {
      globals,
      globalLexicals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment,
    } = options;
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
      globals,
      globalLexicals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment,
    });
    // Call import by property to bypass SES censoring for dynamic import.
    // eslint-disable-next-line dot-notation
    return compartment['import'](moduleSpecifier);
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
  // Call import by property to bypass SES censoring for dynamic import.
  // eslint-disable-next-line dot-notation
  return archive['import'](options);
};
