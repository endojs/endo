/* eslint no-shadow: 0 */

import { readZip } from "./zip.js";
import { join } from "./node-module-specifier.js";
import { assemble } from "./assemble.js";

const decoder = new TextDecoder();

const makeArchiveImportHookMaker = archive => {
  // per-assembly:
  const makeImportHook = (packageLocation, parse) => {
    // per-compartment:
    const importHook = async moduleSpecifier => {
      // per-module:
      const moduleLocation = join(packageLocation, moduleSpecifier);
      const moduleBytes = await archive.read(moduleLocation);
      const moduleSource = decoder.decode(moduleBytes);
      return parse(moduleSource, moduleSpecifier, `file:///${moduleLocation}`);
    };
    return importHook;
  };
  return makeImportHook;
};

export const parseArchive = async (archiveBytes, archiveLocation) => {
  const archive = await readZip(archiveBytes, archiveLocation);

  const compartmentMapBytes = await archive.read("compartmap.json");
  const compartmentMapText = decoder.decode(compartmentMapBytes);
  const compartmentMap = JSON.parse(compartmentMapText);

  const { compartments, main, entry: moduleSpecifier } = compartmentMap;

  const makeImportHook = makeArchiveImportHookMaker(archive);

  const execute = (endowments, modules) => {
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

export const loadArchive = async (read, archiveLocation) => {
  const archiveBytes = await read(archiveLocation);
  return parseArchive(archiveBytes, archiveLocation);
};

export const importArchive = async (
  read,
  archiveLocation,
  endowments,
  modules
) => {
  const archive = await loadArchive(read, archiveLocation);
  return archive.execute(endowments, modules);
};
