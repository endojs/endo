/* eslint no-shadow: 0 */

import { readZip } from "./zip.js";
import { assemble } from "./assemble.js";
import { parserForLanguage } from "./parse.js";
import * as json from "./json.js";

// q as in quote for strings in error messages.
const q = JSON.stringify;

const decoder = new TextDecoder();

const makeArchiveImportHookMaker = (archive, compartments, archiveLocation) => {
  // per-assembly:
  const makeImportHook = packageLocation => {
    // per-compartment:
    const { modules } = compartments[packageLocation];
    const importHook = async moduleSpecifier => {
      // per-module:
      const module = modules[moduleSpecifier];
      const parse = parserForLanguage[module.parser];
      if (parse === undefined) {
        throw new Error(
          `Cannot parse ${q(module.parser)} module ${q(
            moduleSpecifier
          )} in package ${q(packageLocation)} in archive ${q(archiveLocation)}`
        );
      }
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

  const execute = options => {
    const {
      globals,
      globalLexicals,
      modules,
      transforms,
      __shimTransforms__,
      Compartment
    } = options;
    const {
      compartments,
      entry: { module: moduleSpecifier }
    } = compartmentMap;
    const makeImportHook = makeArchiveImportHookMaker(
      archive,
      compartments,
      archiveLocation
    );
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

export const loadArchive = async (read, archiveLocation) => {
  const archiveBytes = await read(archiveLocation);
  return parseArchive(archiveBytes, archiveLocation);
};

export const importArchive = async (read, archiveLocation, options) => {
  const archive = await loadArchive(read, archiveLocation);
  return (archive.import)(options);
};
