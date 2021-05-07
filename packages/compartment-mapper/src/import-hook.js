// @ts-check
import { parseExtension } from './extension.js';

// q, as in quote, for quoting strings in error messages.
const q = JSON.stringify;

const { freeze } = Object;

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

/**
 * @param {ReadFn} read
 * @param {string} baseLocation
 * @param {Sources} sources
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @returns {ImportHookMaker}
 */
export const makeImportHookMaker = (
  read,
  baseLocation,
  sources = {},
  compartments = {},
) => {
  // per-assembly:
  /** @type {ImportHookMaker} */
  const makeImportHook = (packageLocation, parse) => {
    // per-compartment:
    packageLocation = resolveLocation(packageLocation, baseLocation);
    const packageSources = sources[packageLocation] || {};
    sources[packageLocation] = packageSources;
    const { modules = {} } = compartments[packageLocation] || {};

    /** @type {ImportHook} */
    const importHook = async moduleSpecifier => {
      // per-module:

      // In Node.js, an absolute specifier always indicates a built-in or
      // third-party dependency.
      // The `moduleMapHook` captures all third-party dependencies.
      if (moduleSpecifier !== '.' && !moduleSpecifier.startsWith('./')) {
        packageSources[moduleSpecifier] = {
          exit: moduleSpecifier,
        };
        // Return a place-holder.
        // Archived compartments are not executed.
        return freeze({ imports: [], execute() {} });
      }

      // Collate candidate locations for the moduleSpecifier per Node.js
      // conventions.
      const candidates = [];
      if (moduleSpecifier === '.') {
        candidates.push('./index.js');
      } else {
        candidates.push(moduleSpecifier);
        if (parseExtension(moduleSpecifier) === '') {
          candidates.push(
            `${moduleSpecifier}.js`,
            `${moduleSpecifier}/index.js`,
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
          packageLocation,
        );
        // eslint-disable-next-line no-await-in-loop
        const moduleBytes = await read(moduleLocation).catch(
          _error => undefined,
        );
        if (moduleBytes !== undefined) {
          // eslint-disable-next-line no-await-in-loop
          const envelope = await parse(
            moduleBytes,
            candidateSpecifier,
            moduleLocation,
            packageLocation,
          );
          const { parser, bytes: transformedBytes } = envelope;
          const { record: concreteRecord } = envelope;

          // Facilitate a redirect if the returned record has a different
          // module specifier than the requested one.
          /** @type {StaticModuleType} */
          let record;
          if (candidateSpecifier !== moduleSpecifier) {
            modules[moduleSpecifier] = {
              module: candidateSpecifier,
              compartment: packageLocation,
            };
            record = {
              record: concreteRecord,
              specifier: candidateSpecifier,
            };
          } else {
            record = concreteRecord;
          }

          const packageRelativeLocation = moduleLocation.slice(
            packageLocation.length,
          );
          packageSources[candidateSpecifier] = {
            location: packageRelativeLocation,
            parser,
            bytes: transformedBytes,
            record,
          };
          return record;
        }
      }

      // TODO offer breadcrumbs in the error message, or how to construct breadcrumbs with another tool.
      throw new Error(
        `Cannot find file for internal module ${q(
          moduleSpecifier,
        )} (with candidates ${candidates
          .map(x => q(x))
          .join(', ')}) in package ${packageLocation}`,
      );
    };
    return importHook;
  };
  return makeImportHook;
};
