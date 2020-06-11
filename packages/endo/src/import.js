/* global StaticModuleRecord */
/* eslint no-shadow: 0 */

import { compartmentMapForNodeModules } from "./compartmap.js";
import { search } from "./search.js";
import { assemble } from "./assemble.js";

const decoder = new TextDecoder();

const resolve = (rel, abs) => new URL(rel, abs).toString();

const makeImportHookMaker = (read, rootLocation) => packagePath => {
  const packageLocation = resolve(packagePath, rootLocation);
  return async moduleSpecifier => {
    const moduleLocation = resolve(moduleSpecifier, packageLocation);
    const moduleBytes = await read(moduleLocation);
    const moduleSource = decoder.decode(moduleBytes);
    return new StaticModuleRecord(moduleSource, moduleLocation);
  };
};

export const loadPath = async (read, modulePath) => {
  const { packagePath, packageDescriptorText, moduleSpecifier } = await search(
    read,
    modulePath
  );

  const packageDescriptor = JSON.parse(packageDescriptorText);
  const compartmentMap = await compartmentMapForNodeModules(
    read,
    packagePath,
    [],
    packageDescriptor
  );

  const { compartments, main } = compartmentMap;

  const makeImportHook = makeImportHookMaker(read, packagePath);

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

export const importPath = async (read, modulePath, endowments, modules) => {
  const application = await loadPath(read, modulePath, endowments, modules);
  return application.execute(endowments, modules);
};
