/* eslint no-shadow: 0 */

import { compartmentMapForNodeModules } from "./compartmap.js";
import { search } from "./search.js";
import { assemble } from "./assemble.js";

const decoder = new TextDecoder();

const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

const makeImportHookMaker = (read, baseLocation) => {
  // per-assembly:
  const makeImportHook = (packageLocation, parse) => {
    // per-compartment:
    packageLocation = resolveLocation(packageLocation, baseLocation);
    const importHook = async moduleSpecifier => {
      // per-module:
      const moduleLocation = resolveLocation(moduleSpecifier, packageLocation);
      const moduleBytes = await read(moduleLocation);
      const moduleSource = decoder.decode(moduleBytes);
      return parse(
        moduleSource,
        moduleSpecifier,
        moduleLocation,
        packageLocation
      );
    };
    return importHook;
  };
  return makeImportHook;
};

export const loadLocation = async (read, moduleLocation) => {
  const {
    packageLocation,
    packageDescriptorText,
    moduleSpecifier
  } = await search(read, moduleLocation);

  const packageDescriptor = JSON.parse(packageDescriptorText);
  const compartmentMap = await compartmentMapForNodeModules(
    read,
    packageLocation,
    [],
    packageDescriptor
  );

  const { compartments, main } = compartmentMap;

  const makeImportHook = makeImportHookMaker(read, packageLocation);

  const execute = async (endowments, modules) => {
    const compartment = assemble({
      name: main,
      compartments,
      makeImportHook,
      endowments,
      modules
    });
    return compartment.import(moduleSpecifier);
  };

  return { execute };
};

export const importLocation = async (
  read,
  moduleLocation,
  endowments,
  modules
) => {
  const application = await loadLocation(read, moduleLocation);
  return application.execute(endowments, modules);
};
