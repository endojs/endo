/* Provides the implementation of each compartment's `importHook` when using
 * `import.js`, `import-lite.js`, `archive.js`, or `archive-lite.js`.
 * However, `import-archive.js` and `import-archive-lite.js` use their own variant.
 *
 * For building archives, these import hooks create a table of all the modules
 * in a "working set" of transitive dependencies.
 */

// @ts-check

/** @import {ImportHook, ThirdPartyStaticModuleInterface} from 'ses' */
/** @import {ImportNowHook} from 'ses' */
/** @import {StaticModuleType} from 'ses' */
/** @import {RedirectStaticModuleInterface} from 'ses' */
/** @import {MakeImportNowHookMakerOptions, ModuleDescriptor} from './types.js' */
/** @import {ReadFn} from './types.js' */
/** @import {SyncReadPowers} from './types.js' */
/** @import {ReadPowers} from './types.js' */
/** @import {HashFn} from './types.js' */
/** @import {Sources} from './types.js' */
/** @import {CompartmentDescriptor} from './types.js' */
/** @import {ImportHookMaker} from './types.js' */
/** @import {ExitModuleImportHook} from './types.js' */
/** @import {SourceMapHook} from './types.js' */
/** @import {ImportNowHookMaker} from './types.js' */

import {
  attenuateModuleHook,
  ATTENUATORS_COMPARTMENT,
  enforceModulePolicy,
} from './policy.js';
import { resolve } from './node-module-specifier.js';
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

const { entries, keys, assign, create } = Object;

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

// Node.js default resolution allows for an incomplement specifier that does not include a suffix.
// https://nodejs.org/api/modules.html#all-together
const nodejsConventionSearchSuffixes = [
  // LOAD_AS_FILE(X)
  '.js',
  '.json',
  '.node',
  // LOAD_INDEX(X)
  '/index.js',
  '/index.json',
  '/index.node',
];

/**
 * @param {object} params
 * @param {Record<string, any>=} params.modules
 * @param {ExitModuleImportHook} [params.exitModuleImportHook]
 * @returns {ExitModuleImportHook|undefined}
 */
export const exitModuleImportHookMaker = ({
  modules = undefined,
  exitModuleImportHook = undefined,
}) => {
  if (!modules && !exitModuleImportHook) {
    return undefined;
  }
  return async specifier => {
    if (modules && has(modules, specifier)) {
      const ns = modules[specifier];
      return freeze({
        imports: [],
        exports: ns ? keys(ns) : [],
        execute: moduleExports => {
          moduleExports.default = ns;
          assign(moduleExports, ns);
        },
      });
    }
    if (exitModuleImportHook) {
      return exitModuleImportHook(specifier);
    }
    return undefined;
  };
};

/**
 * @param {ReadFn|ReadPowers} readPowers
 * @param {string} baseLocation
 * @param {object} options
 * @param {Sources} [options.sources]
 * @param {Record<string, CompartmentDescriptor>} [options.compartmentDescriptors]
 * @param {boolean} [options.archiveOnly]
 * @param {HashFn} [options.computeSha512]
 * @param {Array<string>} [options.searchSuffixes] - Suffixes to search if the
 * unmodified specifier is not found.
 * Pass [] to emulate Node.js' strict behavior.
 * The default handles Node.js' CommonJS behavior.
 * Unlike Node.js, the Compartment Mapper lifts CommonJS up, more like a
 * bundler, and does not attempt to vary the behavior of resolution depending
 * on the language of the importing module.
 * @param {string} options.entryCompartmentName
 * @param {string} options.entryModuleSpecifier
 * @param {ExitModuleImportHook} [options.exitModuleImportHook]
 * @param {SourceMapHook} [options.sourceMapHook]
 * @returns {ImportHookMaker}
 */
export const makeImportHookMaker = (
  readPowers,
  baseLocation,
  {
    sources = create(null),
    compartmentDescriptors = create(null),
    archiveOnly = false,
    computeSha512 = undefined,
    searchSuffixes = nodejsConventionSearchSuffixes,
    sourceMapHook = undefined,
    entryCompartmentName,
    entryModuleSpecifier,
    exitModuleImportHook = undefined,
  },
) => {
  // Set of specifiers for modules (scoped to compartment) whose parser is not
  // using heuristics to determine imports.
  /** @type {Map<string, Set<string>>} compartment name ->* module specifier */
  const strictlyRequired = new Map([
    [entryCompartmentName, new Set([entryModuleSpecifier])],
  ]);

  /**
   * @param {string} compartmentName
   */
  const strictlyRequiredForCompartment = compartmentName => {
    let compartmentStrictlyRequired = strictlyRequired.get(compartmentName);
    if (compartmentStrictlyRequired !== undefined) {
      return compartmentStrictlyRequired;
    }
    compartmentStrictlyRequired = new Set();
    strictlyRequired.set(compartmentName, compartmentStrictlyRequired);
    return compartmentStrictlyRequired;
  };

  // per-compartment:
  /** @type {ImportHookMaker} */
  const makeImportHook = ({
    packageLocation,
    packageName: _packageName,
    attenuators,
    parse,
    shouldDeferError,
    compartments,
  }) => {
    // per-compartment:
    packageLocation = resolveLocation(packageLocation, baseLocation);
    const packageSources = sources[packageLocation] || create(null);
    sources[packageLocation] = packageSources;
    const compartmentDescriptor = compartmentDescriptors[packageLocation] || {};
    const { modules: moduleDescriptors = create(null) } = compartmentDescriptor;
    compartmentDescriptor.modules = moduleDescriptors;

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
      if (strictlyRequiredForCompartment(packageLocation).has(specifier)) {
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
      await null;
      compartmentDescriptor.retained = true;

      // for lint rule
      await null;

      // per-module:

      // In Node.js, an absolute specifier always indicates a built-in or
      // third-party dependency.
      // The `moduleMapHook` captures all third-party dependencies, unless
      // we allow importing any exit.
      if (moduleSpecifier !== '.' && !moduleSpecifier.startsWith('./')) {
        if (exitModuleImportHook) {
          const record = await exitModuleImportHook(moduleSpecifier);
          if (record) {
            // It'd be nice to check the policy before importing it, but we can only throw a policy error if the
            // hook returns something. Otherwise, we need to fall back to the 'cannot find' error below.
            enforceModulePolicy(moduleSpecifier, compartmentDescriptor, {
              exit: true,
              errorHint: `Blocked in loading. ${q(
                moduleSpecifier,
              )} was not in the compartment map and an attempt was made to load it as a builtin`,
            });
            if (archiveOnly) {
              // Return a place-holder.
              // Archived compartments are not executed.
              return freeze({ imports: [], exports: [], execute() {} });
            }
            // note it's not being marked as exit in sources
            // it could get marked and the second pass, when the archive is being executed, would have the data
            // to enforce which exits can be dynamically imported
            const attenuatedRecord = await attenuateModuleHook(
              moduleSpecifier,
              record,
              compartmentDescriptor.policy,
              attenuators,
            );
            return attenuatedRecord;
          }
        }
        return deferError(
          moduleSpecifier,
          Error(
            `Cannot find external module ${q(
              moduleSpecifier,
            )} in package ${packageLocation}`,
          ),
        );
      }

      // Collate candidate locations for the moduleSpecifier,
      // to support Node.js conventions and similar.
      const candidates = [moduleSpecifier];
      for (const candidateSuffix of searchSuffixes) {
        candidates.push(`${moduleSpecifier}${candidateSuffix}`);
      }

      for (const candidateSpecifier of candidates) {
        const candidateModuleDescriptor = moduleDescriptors[candidateSpecifier];
        if (candidateModuleDescriptor !== undefined) {
          const { compartment: candidateCompartmentName = packageLocation } =
            candidateModuleDescriptor;
          const candidateCompartment = compartments[candidateCompartmentName];
          if (candidateCompartment === undefined) {
            throw Error(
              `compartment missing for candidate ${candidateSpecifier} in ${candidateCompartmentName}`,
            );
          }
          // modify compartmentMap to include this redirect
          const candidateCompartmentDescriptor =
            compartmentDescriptors[candidateCompartmentName];
          if (candidateCompartmentDescriptor === undefined) {
            throw Error(
              `compartmentDescriptor missing for candidate ${candidateSpecifier} in ${candidateCompartmentName}`,
            );
          }
          candidateCompartmentDescriptor.modules[moduleSpecifier] =
            candidateModuleDescriptor;
          // return a redirect
          /** @type {RedirectStaticModuleInterface} */
          const record = {
            specifier: candidateSpecifier,
            compartment: candidateCompartment,
          };
          return record;
        }

        // Using a specifier as a location.
        // This is not always valid.
        // But, for Node.js, when the specifier is relative and not a directory
        // name, they are usable as URL's.
        const moduleLocation = resolveLocation(
          candidateSpecifier,
          packageLocation,
        );
        const { maybeRead } = unpackReadPowers(readPowers);
        // eslint-disable-next-line no-await-in-loop
        const moduleBytes = await maybeRead(moduleLocation);
        if (moduleBytes !== undefined) {
          /** @type {string | undefined} */
          let sourceMap;
          // eslint-disable-next-line no-await-in-loop
          const envelope = await parse(
            moduleBytes,
            candidateSpecifier,
            moduleLocation,
            packageLocation,
            {
              readPowers,
              sourceMapHook:
                sourceMapHook &&
                (nextSourceMapObject => {
                  sourceMap = JSON.stringify(nextSourceMapObject);
                }),
              compartmentDescriptor,
            },
          );
          const {
            parser,
            bytes: transformedBytes,
            record: concreteRecord,
          } = envelope;

          // Facilitate a redirect if the returned record has a different
          // module specifier than the requested one.
          if (candidateSpecifier !== moduleSpecifier) {
            moduleDescriptors[moduleSpecifier] = {
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

            if (sourceMapHook !== undefined && sourceMap !== undefined) {
              sourceMapHook(sourceMap, {
                compartment: packageLocation,
                module: candidateSpecifier,
                location: moduleLocation,
                sha512,
              });
            }
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
            for (const importSpecifier of getImportsFromRecord(record)) {
              strictlyRequiredForCompartment(packageLocation).add(
                resolve(importSpecifier, moduleSpecifier),
              );
            }
          }

          return record;
        }
      }

      return deferError(
        moduleSpecifier,
        // TODO offer breadcrumbs in the error message, or how to construct breadcrumbs with another tool.
        Error(
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

/**
 * Synchronous import for dynamic requires.
 *
 * @param {SyncReadPowers} readPowers
 * @param {string} baseLocation
 * @param {MakeImportNowHookMakerOptions} options
 * @returns {ImportNowHookMaker}
 */
export function makeImportNowHookMaker(
  readPowers,
  baseLocation,
  {
    sources = create(null),
    compartmentDescriptors = create(null),
    computeSha512 = undefined,
    searchSuffixes = nodejsConventionSearchSuffixes,
    sourceMapHook = undefined,
    exitModuleImportNowHook,
  },
) {
  // Set of specifiers for modules (scoped to compartment) whose parser is not
  // using heuristics to determine imports.
  /** @type {Map<string, Set<string>>} compartment name ->* module specifier */
  const strictlyRequired = new Map();

  /**
   * @param {string} compartmentName
   */
  const strictlyRequiredForCompartment = compartmentName => {
    let compartmentStrictlyRequired = strictlyRequired.get(compartmentName);
    if (compartmentStrictlyRequired !== undefined) {
      return compartmentStrictlyRequired;
    }
    compartmentStrictlyRequired = new Set();
    strictlyRequired.set(compartmentName, compartmentStrictlyRequired);
    return compartmentStrictlyRequired;
  };

  /**
   * @type {ImportNowHookMaker}
   */
  const makeImportNowHook = ({
    packageLocation,
    packageName: _packageName,
    entryCompartmentDescriptor,
    parse,
    compartments,
  }) => {
    const compartmentDescriptor = compartmentDescriptors[packageLocation] || {};

    // this is necessary, because there's nothing that prevents someone from calling this function with the entry compartment.
    assert(
      compartmentDescriptor !== entryCompartmentDescriptor,
      'Cannot create an ImportNowHook for the entry compartment',
    );

    // this is not strictly necessary, since the types should handle it.
    assert(
      parse[Symbol.toStringTag] !== 'AsyncFunction',
      'async parsers are unsupported',
    );

    packageLocation = resolveLocation(packageLocation, baseLocation);
    const packageSources = sources[packageLocation] || create(null);
    sources[packageLocation] = packageSources;
    const {
      modules:
        moduleDescriptors = /** @type {Record<string, ModuleDescriptor>} */ (
          create(null)
        ),
    } = compartmentDescriptor;
    compartmentDescriptor.modules = moduleDescriptors;

    let { policy } = compartmentDescriptor;
    policy = policy || create(null);

    // associates modules with compartment descriptors based on policy
    // which wouldn't otherwise be there
    if ('packages' in policy && typeof policy.packages === 'object') {
      for (const [packageName, packagePolicyItem] of entries(policy.packages)) {
        if (
          !(packageName in compartmentDescriptor.modules) &&
          packageName in compartmentDescriptor.scopes &&
          packagePolicyItem
        ) {
          compartmentDescriptor.modules[packageName] =
            compartmentDescriptor.scopes[packageName];
        }
      }
    }

    const { maybeReadSync, isAbsolute } = readPowers;

    /** @type {ImportNowHook} */
    const importNowHook = moduleSpecifier => {
      if (isAbsolute(moduleSpecifier)) {
        let shouldCallExitModuleImportNowHook = true;
        for (const [someDescriptorName, someDescriptor] of entries(
          compartmentDescriptors,
        )) {
          if (someDescriptorName !== ATTENUATORS_COMPARTMENT) {
            const moduleSpecifierUrl = resolveLocation(
              moduleSpecifier,
              packageLocation,
            );
            if (
              !compartmentDescriptor.location.startsWith(moduleSpecifierUrl)
            ) {
              if (moduleSpecifierUrl.startsWith(someDescriptor.location)) {
                if (compartmentDescriptor.name in someDescriptor.modules) {
                  return {
                    specifier: moduleSpecifier,
                    compartment: compartments[someDescriptorName],
                  };
                } else if (compartmentDescriptor === someDescriptor) {
                  shouldCallExitModuleImportNowHook = false;
                }
              }
            }
          }
        }
        if (shouldCallExitModuleImportNowHook) {
          if (exitModuleImportNowHook) {
            // this hook is responsible for ensuring that the moduleSpecifier actually refers to an exit module
            const record = exitModuleImportNowHook(
              moduleSpecifier,
              packageLocation,
            );

            if (!record) {
              throw new Error(`Could not import module: ${q(moduleSpecifier)}`);
            }

            return record;
          }
          throw new Error(
            `Could not import module: ${q(moduleSpecifier)}; try providing an importNowHook`,
          );
        }
      }

      // Collate candidate locations for the moduleSpecifier,
      // to support Node.js conventions and similar.
      const candidates = [moduleSpecifier];
      if (!searchSuffixes.some(suffix => moduleSpecifier.endsWith(suffix))) {
        for (const candidateSuffix of searchSuffixes) {
          candidates.push(`${moduleSpecifier}${candidateSuffix}`);
        }
      }

      for (const candidateSpecifier of candidates) {
        const candidateModuleDescriptor = moduleDescriptors[candidateSpecifier];
        if (candidateModuleDescriptor !== undefined) {
          const { compartment: candidateCompartmentName = packageLocation } =
            candidateModuleDescriptor;
          const candidateCompartment = compartments[candidateCompartmentName];
          if (candidateCompartment === undefined) {
            throw Error(
              `compartment missing for candidate ${candidateSpecifier} in ${candidateCompartmentName}`,
            );
          }
          // modify compartmentMap to include this redirect
          const candidateCompartmentDescriptor =
            compartmentDescriptors[candidateCompartmentName];
          if (candidateCompartmentDescriptor === undefined) {
            throw Error(
              `compartmentDescriptor missing for candidate ${candidateSpecifier} in ${candidateCompartmentName}`,
            );
          }
          candidateCompartmentDescriptor.modules[moduleSpecifier] =
            candidateModuleDescriptor;
          // return a redirect
          /** @type {RedirectStaticModuleInterface} */
          const record = {
            specifier: candidateSpecifier,
            compartment: candidateCompartment,
          };
          return record;
        }

        // Using a specifier as a location.
        // This is not always valid.
        // But, for Node.js, when the specifier is relative and not a directory
        // name, they are usable as URL's.
        const moduleLocation = resolveLocation(
          candidateSpecifier,
          packageLocation,
        );

        const moduleBytes = maybeReadSync(moduleLocation);
        if (moduleBytes !== undefined) {
          /** @type {string | undefined} */
          let sourceMap;
          // eslint-disable-next-line no-await-in-loop
          const envelope = parse(
            moduleBytes,
            candidateSpecifier,
            moduleLocation,
            packageLocation,
            {
              compartmentDescriptor,
              readPowers,
              sourceMapHook:
                sourceMapHook &&
                (nextSourceMapObject => {
                  sourceMap = JSON.stringify(nextSourceMapObject);
                }),
            },
          );
          const {
            parser,
            bytes: transformedBytes,
            record: concreteRecord,
          } = envelope;

          // Facilitate a redirect if the returned record has a different
          // module specifier than the requested one.
          if (candidateSpecifier !== moduleSpecifier) {
            moduleDescriptors[moduleSpecifier] = {
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

            if (sourceMapHook !== undefined && sourceMap !== undefined) {
              sourceMapHook(sourceMap, {
                compartment: packageLocation,
                module: candidateSpecifier,
                location: moduleLocation,
                sha512,
              });
            }
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
          for (const importSpecifier of getImportsFromRecord(record)) {
            strictlyRequiredForCompartment(packageLocation).add(
              resolve(importSpecifier, moduleSpecifier),
            );
          }

          return record;
        }
      }

      if (exitModuleImportNowHook) {
        // this hook is responsible for ensuring that the moduleSpecifier actually refers to an exit module
        const record = exitModuleImportNowHook(
          moduleSpecifier,
          packageLocation,
        );

        if (!record) {
          throw new Error(`Could not import module: ${q(moduleSpecifier)}`);
        }

        return record;
      }

      throw new Error(
        `Could not import module: ${q(moduleSpecifier)}; try providing an importNowHook`,
      );
    };

    return importNowHook;
  };
  return makeImportNowHook;
}
