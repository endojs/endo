/* global StaticModuleRecord */
/* eslint no-shadow: 0 */

import { writeZip } from "./zip.js";
import { resolve, join } from "./node-module-specifier.js";
import { compartmentMapForNodeModules } from "./compartmap.js";
import { search } from "./search.js";
import { assemble } from "./assemble.js";

const { entries, fromEntries } = Object;

const q = JSON.stringify;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const makeRecordingImportHookMaker = (
  read,
  root,
  manifest,
  errors
) => packagePath => {
  const packageLocation = new URL(packagePath, root).toString();
  return async moduleSpecifier => {
    const moduleLocation = new URL(moduleSpecifier, packageLocation).toString();
    const moduleBytes = await read(moduleLocation).catch(_error => undefined);
    if (moduleBytes === undefined) {
      errors.push(
        `missing ${q(moduleSpecifier)} needed for package ${q(packagePath)}`
      );
      return new StaticModuleRecord("// Module not found", moduleSpecifier);
    }
    const moduleSource = decoder.decode(moduleBytes);

    const packageManifest = manifest[packagePath] || {};
    manifest[packagePath] = packageManifest;
    packageManifest[moduleSpecifier] = moduleBytes;

    return new StaticModuleRecord(moduleSource, moduleLocation);
  };
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
    const { label } = compartment;
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
      root: renames[name],
      modules
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

export const makeArchive = async (read, modulePath) => {
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

  const sources = {};
  const errors = [];
  const makeImportHook = makeRecordingImportHookMaker(
    read,
    packagePath,
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

export const writeArchive = async (write, read, archivePath, modulePath) => {
  const archiveBytes = await makeArchive(read, modulePath);
  await write(archivePath, archiveBytes);
};
