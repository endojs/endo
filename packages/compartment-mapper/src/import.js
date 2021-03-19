// @ts-check
/* eslint no-shadow: "off" */

import './types.js';
import { compartmentMapForNodeModules } from './node-modules.js';
import { search } from './search.js';
import { assemble } from './assemble.js';
import { makeImportHookMaker } from './import-hook.js';
import * as json from './json.js';

/**
 * @param {ReadFn} read
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<Application>}
 */
export const loadLocation = async (read, moduleLocation, options) => {
  const { moduleTransforms = {} } = options || {};

  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(read, moduleLocation);

  const packageDescriptor = json.parse(
    packageDescriptorText,
    packageDescriptorLocation,
  );
  /** @type {Set<string>} */
  const tags = new Set();
  const compartmentMap = await compartmentMapForNodeModules(
    read,
    packageLocation,
    tags,
    packageDescriptor,
    moduleSpecifier,
  );

  /** @type {ExecuteFn} */
  const execute = async (options = {}) => {
    const {
      globals,
      globalLexicals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment,
    } = options;
    const makeImportHook = makeImportHookMaker(read, packageLocation);
    const compartment = assemble(compartmentMap, {
      makeImportHook,
      globals,
      globalLexicals,
      modules,
      transforms,
      moduleTransforms,
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
 * @param {string} moduleLocation
 * @param {ExecuteOptions & ArchiveOptions} [options]
 * @returns {Promise<Object>} the object of the imported modules exported
 * names.
 */
export const importLocation = async (read, moduleLocation, options = {}) => {
  const application = await loadLocation(read, moduleLocation, options);
  // Call import by property to bypass SES censoring for dynamic import.
  // eslint-disable-next-line dot-notation
  return application['import'](options);
};
