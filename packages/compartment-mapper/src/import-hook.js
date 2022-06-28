// @ts-check

/** @typedef {import('ses').ImportHook} ImportHook */
/** @typedef {import('ses').StaticModuleType} StaticModuleType */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').ReadPowers} ReadPowers */
/** @typedef {import('./types.js').HashFn} HashFn */
/** @typedef {import('./types.js').Sources} Sources */
/** @typedef {import('./types.js').CompartmentSources} CompartmentSources */
/** @typedef {import('./types.js').CompartmentDescriptor} CompartmentDescriptor */
/** @typedef {import('./types.js').ImportHookMaker} ImportHookMaker */

import { parseExtension } from './extension.js';
import { unpackReadPowers } from './powers.js';

// q, as in quote, for quoting strings in error messages.
const q = JSON.stringify;

const { apply } = Reflect;

/**
 * TypeScript cannot be relied upon to deal with the nuances of Readonly, so we
 * borrow the pass-through type definition of harden here.
 *
 * @type {import('ses').Harden}
 */
const freeze = Object.freeze;

const { hasOwnProperty } = Object.prototype;
/**
 * @param {Record<string, any>} haystack
 * @param {string} needle
 */
const has = (haystack, needle) => apply(hasOwnProperty, haystack, [needle]);

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

// this is annoying
function getImportsFromRecord(record) {
  return (has(record, 'record') ? record.record.imports : record.imports) || [];
}

/**
 * @param {ReadFn|ReadPowers} readPowers
 * @param {string} baseLocation
 * @param {Sources} sources
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @param {Record<string, any>} exitModules
 * @param {HashFn=} computeSha512
 * @returns {ImportHookMaker}
 */
export const makeImportHookMaker = (
  readPowers,
  baseLocation,
  sources = Object.create(null),
  compartments = Object.create(null),
  exitModules = Object.create(null),
  computeSha512 = undefined,
) => {
  // Set of specifiers for modules whose parser is not using heuristics to determine imports
  const strictlyRequired = new Set();
  // per-assembly:
  /** @type {ImportHookMaker} */
  const makeImportHook = (
    packageLocation,
    _packageName,
    parse,
    shouldDeferError,
  ) => {
    // per-compartment:
    packageLocation = resolveLocation(packageLocation, baseLocation);
    const packageSources = sources[packageLocation] || Object.create(null);
    sources[packageLocation] = packageSources;
    const compartment = compartments[packageLocation] || {};
    const { modules = Object.create(null) } = compartment;

    /**
     * @param {string} specifier
     * @param {Error} error - error to throw on execute
     * @returns {StaticModuleType}
     */
    const deferError = (specifier, error) => {
      // strictlyRequired is populated with imports declared by modules whose parser is not using heuristics to figure
      // out imports. We're guaranteed they're reachable. If the same module is imported and required, it will not
      // defer, because importing from esm makes it strictly required.
      // Note that ultimately a situation may arise, with exit modules, where the module never reaches importHook but
      // its imports do. In that case the notion of strictly required is no longer boolean, it's true,false,noidea.
      if (strictlyRequired.has(specifier)) {
        throw error;
      }
      // Return a place-holder that'd throw an error if executed
      // This allows cjs parser to more eagerly find calls to require
      // - if parser identified a require call that's a local function, execute will never be called
      // - if actual required module is missing, the error will happen anyway - at execution time
      const record = freeze({
        imports: [],
        exports: [],
        execute: () => {
          throw error;
        },
      });
      packageSources[specifier] = {
        deferredError: error.message,
      };

      return record;
    };

    /** @type {ImportHook} */
    const importHook = async moduleSpecifier => {
      compartment.retained = true;

      // per-module:

      // In Node.js, an absolute specifier always indicates a built-in or
      // third-party dependency.
      // The `moduleMapHook` captures all third-party dependencies.
      if (moduleSpecifier !== '.' && !moduleSpecifier.startsWith('./')) {
        if (has(exitModules, moduleSpecifier)) {
          packageSources[moduleSpecifier] = {
            exit: moduleSpecifier,
          };
          // Return a place-holder.
          // Archived compartments are not executed.
          return freeze({ imports: [], exports: [], execute() {} });
        }
        return deferError(
          moduleSpecifier,
          new Error(
            `Cannot find external module ${q(
              moduleSpecifier,
            )} in package ${packageLocation}`,
          ),
        );
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

      const { read } = unpackReadPowers(readPowers);

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
            readPowers,
          );
          const {
            parser,
            bytes: transformedBytes,
            record: concreteRecord,
          } = envelope;

          // Facilitate a redirect if the returned record has a different
          // module specifier than the requested one.
          if (candidateSpecifier !== moduleSpecifier) {
            modules[moduleSpecifier] = {
              module: candidateSpecifier,
              compartment: packageLocation,
            };
          }
          /** @type {StaticModuleType} */
          const record = {
            record: concreteRecord,
            specifier: candidateSpecifier,
            importMeta: { url: moduleLocation },
          };

          let sha512;
          if (computeSha512 !== undefined) {
            sha512 = computeSha512(transformedBytes);
          }

          const packageRelativeLocation = moduleLocation.slice(
            packageLocation.length,
          );
          packageSources[candidateSpecifier] = {
            location: packageRelativeLocation,
            sourceLocation: moduleLocation,
            parser,
            bytes: transformedBytes,
            record: concreteRecord,
            sha512,
          };
          if (!shouldDeferError(parser)) {
            getImportsFromRecord(record).forEach(
              strictlyRequired.add,
              strictlyRequired,
            );
          }

          return record;
        }
      }

      return deferError(
        moduleSpecifier,
        // TODO offer breadcrumbs in the error message, or how to construct breadcrumbs with another tool.
        new Error(
          `Cannot find file for internal module ${q(
            moduleSpecifier,
          )} (with candidates ${candidates
            .map(x => q(x))
            .join(', ')}) in package ${packageLocation}`,
        ),
      );
    };
    return importHook;
  };
  return makeImportHook;
};
