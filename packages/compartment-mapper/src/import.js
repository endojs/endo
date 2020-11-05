/* eslint no-shadow: "off", no-extra-parens: "off" */

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

  const execute = async (options = {}) => {
    const {
      globals,
      globalLexicals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment
    } = options;
    const makeImportHook = makeImportHookMaker(read, packageLocation);
    const compartment = assemble(compartmentMap, {
      makeImportHook,
      globals,
      globalLexicals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment
    });
    return (compartment.import)(moduleSpecifier);
  };

  return { import: execute };
};

export const importLocation = async (read, moduleLocation, options = {}) => {
  const application = await loadLocation(read, moduleLocation);
  return (application.import)(options);
};
