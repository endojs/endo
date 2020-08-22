/* eslint no-shadow: 0 */

import { compartmentMapForNodeModules } from "./compartmap.js";
import { search } from "./search.js";
import { assemble } from "./assemble.js";
import { parseExtension } from "./extension.js";

const decoder = new TextDecoder();

// q, as in quote, for quoting strings in error messages.
const q = JSON.stringify;

const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

const makeImportHookMaker = (read, baseLocation) => {
  // per-assembly:
  const makeImportHook = (packageLocation, parse) => {
    // per-compartment:
    packageLocation = resolveLocation(packageLocation, baseLocation);
    const importHook = async moduleSpecifier => {
      // per-module:

      // Collate candidate locations for the moduleSpecifier per Node.js
      // conventions.
      const candidates = [];
      if (moduleSpecifier === ".") {
        candidates.push("index.js");
      } else {
        candidates.push(moduleSpecifier);
        if (parseExtension(moduleSpecifier) === "") {
          candidates.push(
            `${moduleSpecifier}.js`,
            `${moduleSpecifier}/index.js`
          );
        }
      }

      for (const candidate of candidates) {
        const moduleLocation = resolveLocation(candidate, packageLocation);
        // eslint-disable-next-line no-await-in-loop
        const moduleBytes = await read(moduleLocation).catch(
          _error => undefined
        );
        if (moduleBytes !== undefined) {
          const moduleSource = decoder.decode(moduleBytes);

          return parse(
            moduleSource,
            moduleSpecifier,
            moduleLocation,
            packageLocation
          ).record;
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
