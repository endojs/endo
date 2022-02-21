// @ts-check

/** @typedef {import('ses').ImportHook} ImportHook */
/** @typedef {import('ses').StaticModuleType} StaticModuleType */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').HashFn} HashFn */
/** @typedef {import('./types.js').Sources} Sources */
/** @typedef {import('./types.js').CompartmentDescriptor} CompartmentDescriptor */
/** @typedef {import('./types.js').ImportHookMaker} ImportHookMaker */

import { parseExtension } from './extension.js';

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
 * @param {Record<string, never>} haystack
 * @param {string} needle
 */
const has = (haystack, needle) => apply(hasOwnProperty, haystack, [needle]);

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
 * @param {Record<string, never>} exitModules
 * @param {HashFn=} computeSha512
 * @returns {ImportHookMaker}
 */
export const makeImportHookMaker = (
  read,
  baseLocation,
  sources = {},
  compartments = {},
  exitModules = {},
  computeSha512 = undefined,
) => {
  // per-assembly:
  /** @type {ImportHookMaker} */
  const makeImportHook = (packageLocation, _packageName, { readAndParse, scheduleError}) => {
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
        if (has(exitModules, moduleSpecifier)) {
          packageSources[moduleSpecifier] = {
            exit: moduleSpecifier,
          };
          // Return a place-holder.
          // Archived compartments are not executed.
          return freeze({ imports: [], exports: [], execute() {} });
        }
        return scheduleError(
          new Error(
            `Cannot find external module ${q(
              moduleSpecifier,
            )} in package ${packageLocation}`,
          ),
        );
      }

          const envelope = await readAndParse(
            read,
            moduleSpecifier,
            packageLocation,
          );
          const {
            parser,
            bytes: transformedBytes,
            record: concreteRecord,
          } = envelope;

          // Facilitate a redirect if the returned record has a different
          // module specifier than the requested one.
          /** @type {StaticModuleType} */
          let record;


          //TODO: not sure where to cram this yet, but it'd go away too
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
            record,
            sha512,
          };
          return record;
        }
      }

     
    };
    return importHook;
  };
  return makeImportHook;
};
