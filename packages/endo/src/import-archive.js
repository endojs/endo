/* global StaticModuleRecord */
/* eslint no-shadow: 0 */

import { readZip } from "./zip.js";
import { join } from "./node-module-specifier.js";
import { assemble } from "./assemble.js";

const decoder = new TextDecoder();

const makeArchiveImportHookMaker = archive => packagePath => async moduleSpecifier => {
  const moduleLocation = join(packagePath, moduleSpecifier);
  const moduleBytes = await archive.read(moduleLocation);
  const moduleSource = decoder.decode(moduleBytes);
  return new StaticModuleRecord(moduleSource, moduleLocation);
};

export const parseArchive = async archiveBytes => {
  const archive = await readZip(archiveBytes);

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

export const loadArchive = async (read, archivePath) => {
  const archiveBytes = await read(archivePath);
  return parseArchive(archiveBytes);
};

export const importArchive = async (read, archivePath, endowments, modules) => {
  const archive = await loadArchive(read, archivePath);
  return archive.execute(endowments, modules);
};
