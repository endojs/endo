/* eslint no-shadow: 0 */

import { readZip } from "./zip.js";
import { assemble } from "./assemble.js";
import { parserForLanguage } from "./parse.js";
import * as json from "./json.js";

const decoder = new TextDecoder();

const makeArchiveImportHookMaker = (archive, compartments) => {
  // per-assembly:
  const makeImportHook = packageLocation => {
    // per-compartment:
    const { modules } = compartments[packageLocation];
    const importHook = async moduleSpecifier => {
      // per-module:
      const module = modules[moduleSpecifier];
      const parse = parserForLanguage[module.parser];
      const moduleLocation = `${packageLocation}/${module.location}`;
      const moduleBytes = await archive.read(moduleLocation);
      const moduleSource = decoder.decode(moduleBytes);
      return parse(
        moduleSource,
        moduleSpecifier,
        `file:///${moduleLocation}`,
        packageLocation
      ).record;
    };
    return importHook;
  };
  return makeImportHook;
};

export const parseArchive = async (archiveBytes, archiveLocation) => {
  const archive = await readZip(archiveBytes, archiveLocation);

  const compartmentMapBytes = await archive.read("compartment-map.json");
  const compartmentMapText = decoder.decode(compartmentMapBytes);
  const compartmentMap = json.parse(compartmentMapText, "compartment-map.json");

  const execute = (endowments, modules) => {
    const { compartments, entry: moduleSpecifier } = compartmentMap;
    const makeImportHook = makeArchiveImportHookMaker(archive, compartments);
    const compartment = assemble(compartmentMap, {
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
