/* eslint no-shadow: 0 */

import { compartmentMapForNodeModules } from "./node-modules.js";
import { search } from "./search.js";
import { assemble } from "./assemble.js";
import { makeImportHookMaker } from "./import-hook.js";
import * as json from "./json.js";

export const loadLocation = async (read, moduleLocation) => {
  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier
  } = await search(read, moduleLocation);

  const packageDescriptor = json.parse(
    packageDescriptorText,
    packageDescriptorLocation
  );
  const compartmentMap = await compartmentMapForNodeModules(
    read,
    packageLocation,
    [],
    packageDescriptor
  );

  const execute = async (endowments = {}, modules = {}) => {
    const makeImportHook = makeImportHookMaker(read, packageLocation);
    const compartment = assemble(compartmentMap, {
      makeImportHook,
      endowments,
      modules
    });
    return compartment.import(moduleSpecifier);
  };

  return { import: execute };
};

export const importLocation = async (
  read,
  moduleLocation,
  endowments,
  modules
) => {
  const application = await loadLocation(read, moduleLocation);
  return application.import(endowments, modules);
};
