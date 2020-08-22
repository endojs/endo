/* eslint no-shadow: 0 */

import { writeZip } from "./zip.js";
import { resolve } from "./node-module-specifier.js";
import { parseExtension } from "./extension.js";
import { compartmentMapForNodeModules } from "./compartmap.js";
import { search } from "./search.js";
import { assemble } from "./assemble.js";

const { entries, freeze, fromEntries, values } = Object;

// q, as in quote, for quoted strings in error messages.
const q = JSON.stringify;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

const makeRecordingImportHookMaker = (read, baseLocation, sources) => {
  // per-assembly:
  const makeImportHook = (packageLocation, parse) => {
    // per-compartment:
    packageLocation = resolveLocation(packageLocation, baseLocation);
    const packageSources = sources[packageLocation] || {};
    sources[packageLocation] = packageSources;

    const importHook = async moduleSpecifier => {
      // per-module:

      // In Node.js, an absolute specifier always indicates a built-in or
      // third-party dependency.
      // The `moduleMapHook` captures all third-party dependencies.
      if (moduleSpecifier !== "." && !moduleSpecifier.startsWith("./")) {
        packageSources[moduleSpecifier] = {
          exit: moduleSpecifier
        };
        // Return a place-holder.
        // Archived compartments are not executed.
        return freeze({ imports: [], execute() {} });
      }

      const candidates = [moduleSpecifier];
      if (parseExtension(moduleSpecifier) === "") {
        candidates.push(`${moduleSpecifier}.js`, `${moduleSpecifier}/index.js`);
      }
      for (const candidate of candidates) {
        const moduleLocation = resolveLocation(candidate, packageLocation);
        // eslint-disable-next-line no-await-in-loop
        const moduleBytes = await read(moduleLocation).catch(
          _error => undefined
        );
        if (moduleBytes !== undefined) {
          const moduleSource = decoder.decode(moduleBytes);

          const { record, parser } = parse(
            moduleSource,
            moduleSpecifier,
            moduleLocation
          );

          const packageRelativeLocation = moduleLocation.slice(
            packageLocation.length
          );
          packageSources[moduleSpecifier] = {
            location: packageRelativeLocation,
            parser,
            bytes: moduleBytes
          };

          return record;
        }
      }

      // TODO offer breadcrumbs in the error message, or how to construct breadcrumbs with another tool.
      throw new Error(
        `Cannot find file for internal module ${q(
          moduleSpecifier
        )} (with candidates ${candidates
          .map(q)
          .join(", ")}) in package ${packageLocation}`
      );
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
    renames[name] = `${label}-n${n}`;
    n += 1;
  }
  return renames;
};

const translateCompartmentMap = (compartments, sources, renames) => {
  const result = {};
  for (const [name, compartment] of entries(compartments)) {
    const { label } = compartment;

    // rename module compartments
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

    // integrate sources into modules
    const compartmentSources = sources[name];
    for (const [name, source] of entries(compartmentSources || {})) {
      const { location, parser, exit } = source;
      modules[name] = {
        location,
        parser,
        exit
      };
    }

    result[renames[name]] = {
      label,
      location: renames[name],
      modules
      // `scopes`, `types`, and `parsers` are not necessary since every
      // loadable module is captured in `modules`.
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
    const compartmentLocation = resolveLocation(
      `${encodeURIComponent(compartment)}/`,
      "file:///"
    );
    for (const { location, bytes } of values(modules)) {
      const moduleLocation = resolveLocation(
        encodeURIComponent(location),
        compartmentLocation
      );
      const path = new URL(moduleLocation).pathname.slice(1); // elide initial "/"
      // eslint-disable-next-line no-await-in-loop
      await archive.write(path, bytes);
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

  const sources = {};
  const makeImportHook = makeRecordingImportHookMaker(
    read,
    packageLocation,
    sources
  );

  // Induce importHook to record all the necessary modules to import the given module specifier.
  const compartment = assemble(compartmentMap, {
    resolve,
    makeImportHook
  });
  await compartment.load(moduleSpecifier);

  const { compartments, main } = compartmentMap;
  const renames = renameCompartments(compartments);
  const renamedCompartments = translateCompartmentMap(
    compartments,
    sources,
    renames
  );
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
