import { parseExtension } from "./extension.js";

// q, as in quote, for quoting strings in error messages.
const q = JSON.stringify;

const decoder = new TextDecoder();

const { freeze } = Object;

const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

export const makeImportHookMaker = (
  read,
  baseLocation,
  sources = {},
  compartments = {}
) => {
  // per-assembly:
  const makeImportHook = (packageLocation, parse) => {
    // per-compartment:
    packageLocation = resolveLocation(packageLocation, baseLocation);
    const packageSources = sources[packageLocation] || {};
    sources[packageLocation] = packageSources;
    const { modules = {} } = compartments[packageLocation] || {};

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
        candidates.push("./index.js");
      } else {
        candidates.push(moduleSpecifier);
        if (parseExtension(moduleSpecifier) === "") {
          candidates.push(
            `${moduleSpecifier}.js`,
            `${moduleSpecifier}/index.js`
          );
        }
      }

      for (const candidateSpecifier of candidates) {
        // Using a specifier as a location.
        // This is not always valid.
        // But, for Node.js, when the specifier is relative and not a directory
        // name, they are usable as URL's.
        const moduleLocation = resolveLocation(
          candidateSpecifier,
          packageLocation
        );
        // eslint-disable-next-line no-await-in-loop
        const moduleBytes = await read(moduleLocation).catch(
          _error => undefined
        );
        if (moduleBytes !== undefined) {
          const moduleSource = decoder.decode(moduleBytes);

          const envelope = parse(
            moduleSource,
            candidateSpecifier,
            moduleLocation,
            packageLocation
          );
          const { parser } = envelope;
          let { record } = envelope;

          // Facilitate a redirect if the returned record has a different
          // module specifier than the requested one.
          if (candidateSpecifier !== moduleSpecifier) {
            modules[moduleSpecifier] = {
              module: candidateSpecifier,
              compartment: packageLocation
            };
            record = { record, specifier: candidateSpecifier };
          }

          const packageRelativeLocation = moduleLocation.slice(
            packageLocation.length
          );
          packageSources[candidateSpecifier] = {
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
