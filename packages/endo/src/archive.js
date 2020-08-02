/* global StaticModuleRecord */
/* eslint no-shadow: 0 */

import { writeZip } from "./zip.js";
import { resolve, join } from "./node-module-specifier.js";
import { parseExtension } from "./extension.js";
import { compartmentMapForNodeModules } from "./compartmap.js";
import { search } from "./search.js";
import { assemble } from "./assemble.js";

const { entries, fromEntries } = Object;

const q = JSON.stringify;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

const makeRecordingImportHookMaker = (read, baseLocation, manifest, errors) => {
  // per-assembly:
  const makeImportHook = (packageLocation, parse) => {
    // per-compartment:
    packageLocation = resolveLocation(packageLocation, baseLocation);
    const importHook = async moduleSpecifier => {
      // per-module:
      const candidates = [moduleSpecifier];
      if (parseExtension(moduleSpecifier) === "") {
        candidates.push(`${moduleSpecifier}.js`, `${moduleSpecifier}/index.js`);
      }
      for (const candidate of candidates) {
        const moduleLocation = new URL(candidate, packageLocation).toString();
        // eslint-disable-next-line no-await-in-loop
        const moduleBytes = await read(moduleLocation).catch(
          _error => undefined
        );
        if (moduleBytes === undefined) {
          errors.push(
            `missing ${q(candidate)} needed for package ${q(packageLocation)}`
          );
        } else {
          const moduleSource = decoder.decode(moduleBytes);

          const packageManifest = manifest[packageLocation] || {};
          manifest[packageLocation] = packageManifest;
          packageManifest[moduleSpecifier] = moduleBytes;

          return parse(moduleSource, moduleLocation);
        }
      }
      return new StaticModuleRecord("// Module not found", moduleSpecifier);
    };
    return importHook;
  };
  return makeImportHook;
};

const renameCompartments = compartments => {
  const renames = {};
  let n = 0;
  for (const [name, compartment] of entries(compartments)) {
    const { label } = compartment;
    renames[name] = `${label}#${n}`;
    n += 1;
  }
  return renames;
};

const renameCompartmentMap = (compartments, renames) => {
  const result = {};
  for (const [name, compartment] of entries(compartments)) {
    const { label, parsers } = compartment;
    const modules = {};
    for (const [name, module] of entries(compartment.modules || {})) {
      const compartment = module.compartment
        ? renames[module.compartment]
        : undefined;
      modules[name] = {
        ...module,
        compartment
      };
    }
    result[renames[name]] = {
      label,
      location: renames[name],
      modules,
      parsers
    };
  }
  return result;
};

const renameSources = (sources, renames) => {
  return fromEntries(
    entries(sources).map(([name, compartment]) => [renames[name], compartment])
  );
};

const addSourcesToArchive = async (archive, sources) => {
  for (const [compartment, modules] of entries(sources)) {
    for (const [module, content] of entries(modules)) {
      const path = join(compartment, module);
      // eslint-disable-next-line no-await-in-loop
      await archive.write(path, content);
    }
  }
};

export const makeArchive = async (read, moduleLocation) => {
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

  const sources = {};
  const errors = [];
  const makeImportHook = makeRecordingImportHookMaker(
    read,
    packageLocation,
    sources,
    errors
  );

  if (errors.length > 0) {
    throw new Error(
      `Cannot assemble compartment for ${errors.length} reasons: ${errors.join(
        ", "
      )}`
    );
  }

  // Induce importHook to record all the necessary modules to import the given module specifier.
  const compartment = assemble({
    name: main,
    compartments,
    resolve,
    makeImportHook
  });
  await compartment.load(moduleSpecifier);

  const renames = renameCompartments(compartments);
  const renamedCompartments = renameCompartmentMap(compartments, renames);
  const renamedSources = renameSources(sources, renames);

  const manifest = {
    main: renames[main],
    entry: moduleSpecifier,
    compartments: renamedCompartments
  };
  const manifestText = JSON.stringify(manifest, null, 2);
  const manifestBytes = encoder.encode(manifestText);

  const archive = writeZip();
  await archive.write("compartmap.json", manifestBytes);
  await addSourcesToArchive(archive, renamedSources);

  return archive.data();
};

export const writeArchive = async (
  write,
  read,
  archiveLocation,
  moduleLocation
) => {
  const archiveBytes = await makeArchive(read, moduleLocation);
  await write(archiveLocation, archiveBytes);
};
