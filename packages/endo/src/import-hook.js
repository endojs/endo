import { parseExtension } from "./extension.js";

// q, as in quote, for quoting strings in error messages.
const q = JSON.stringify;

const decoder = new TextDecoder();

const { freeze } = Object;

const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

export const makeImportHookMaker = (read, baseLocation, sources = {}) => {
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

          const { record, parser } = parse(
            moduleSource,
            moduleSpecifier,
            moduleLocation,
            packageLocation
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
