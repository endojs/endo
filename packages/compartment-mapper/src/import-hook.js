/**
 * @module Provides the implementation of each compartment's `importHook` when
 * using `import.js`, `import-lite.js`, `archive.js`, or `archive-lite.js`.
 * However, `import-archive.js` and `import-archive-lite.js` use their own
 * variant.
 *
 * For building archives, these import hooks create a table of all the modules
 * in a "working set" of transitive dependencies.
 */

// @ts-check

/**
 * @import {
 *   ImportHook,
 *   ImportNowHook,
 *   RedirectStaticModuleInterface,
 *   StaticModuleType
 * } from 'ses'
 * @import {
 *   CompartmentDescriptor,
 *   ChooseModuleDescriptorOperators,
 *   ChooseModuleDescriptorParams,
 *   ChooseModuleDescriptorYieldables,
 *   ExitModuleImportHook,
 *   FindRedirectParams,
 *   HashFn,
 *   ImportHookMaker,
 *   ImportNowHookMaker,
 *   MakeImportNowHookMakerOptions,
 *   ModuleDescriptor,
 *   ParseResult,
 *   ReadFn,
 *   ReadPowers,
 *   SourceMapHook,
 *   Sources,
 *   ReadNowPowers
 * } from './types.js'
 */

import { asyncTrampoline, syncTrampoline } from '@endo/trampoline';
import { resolve } from './node-module-specifier.js';
import {
  attenuateModuleHook,
  ATTENUATORS_COMPARTMENT,
  enforceModulePolicy,
} from './policy.js';
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
 * Given a module specifier which is an absolute path, attempt to match it with
 * an existing compartment; return a {@link RedirectStaticModuleInterface} if found.
 *
 * @throws If we determine `absoluteModuleSpecifier` is unknown
 * @param {FindRedirectParams} params Parameters
 * @returns {RedirectStaticModuleInterface|undefined} A redirect or nothing
 */
const findRedirect = ({
  compartmentDescriptor,
  compartmentDescriptors,
  compartments,
  absoluteModuleSpecifier,
  packageLocation,
}) => {
  const moduleSpecifierLocation = new URL(
    absoluteModuleSpecifier,
    packageLocation,
  ).href;

  // a file:// URL string
  let someLocation = new URL('./', moduleSpecifierLocation).href;

  // we are guaranteed an absolute path, so we can search "up" for the compartment
  // due to the structure of `node_modules`

  // n === count of path components to the fs root
  for (;;) {
    if (
      someLocation !== ATTENUATORS_COMPARTMENT &&
      someLocation in compartments
    ) {
      const location = someLocation;
      const someCompartmentDescriptor = compartmentDescriptors[location];
      if (compartmentDescriptor === someCompartmentDescriptor) {
        // this compartmentDescriptor wants to dynamically load its own module
        // using an absolute path
        return undefined;
      }

      // this tests the compartment referred to by the absolute path
      // is a dependency of the compartment descriptor
      if (compartmentDescriptor.compartments.has(location)) {
        return {
          specifier: absoluteModuleSpecifier,
          compartment: compartments[location],
        };
      }

      // this tests if the compartment descriptor is a dependency of the
      // compartment referred to by the absolute path.
      // it may be in scope, but disallowed by policy.
      if (
        someCompartmentDescriptor.compartments.has(
          compartmentDescriptor.location,
        )
      ) {
        enforceModulePolicy(
          compartmentDescriptor.name,
          someCompartmentDescriptor,
          {
            errorHint: `Blocked in import hook. ${q(absoluteModuleSpecifier)} is part of the compartment map and resolves to ${location}`,
          },
        );
        return {
          specifier: absoluteModuleSpecifier,
          compartment: compartments[location],
        };
      }

      throw new Error(`Could not import module: ${q(absoluteModuleSpecifier)}`);
    } else {
      // go up a directory
      const parentLocation = new URL('../', someLocation).href;

      // afaict this behavior is consistent across both windows and posix
      if (parentLocation === someLocation) {
        throw new Error(
          `Could not import unknown module: ${q(absoluteModuleSpecifier)}`,
        );
      }

      someLocation = parentLocation;
    }
  }
};

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
 * Expands a module specifier into a list of potential candidates based on
 * `searchSuffixes`.
 *
 * @param {string} moduleSpecifier Module specifier
 * @param {string[]} searchSuffixes Suffixes to search if the unmodified
 * specifier is not found
 * @returns {string[]} A list of potential candidates (including
 * `moduleSpecifier` itself)
 */
const nominateCandidates = (moduleSpecifier, searchSuffixes) => {
  // Collate candidate locations for the moduleSpecifier,
  // to support Node.js conventions and similar.
  const candidates = [moduleSpecifier];
  for (const candidateSuffix of searchSuffixes) {
    candidates.push(`${moduleSpecifier}${candidateSuffix}`);
  }
  return candidates;
};

/**
 * Returns a generator which applies {@link ChooseModuleDescriptorOperators} in
 * `operators` using the options in options to ultimately result in a
 * {@link StaticModuleType} for a particular {@link CompartmentDescriptor} (or
 * `undefined`).
 *
 * Supports both {@link SyncChooseModuleDescriptorOperators sync} and
 * {@link AsyncChooseModuleDescriptorOperators async} operators.
 *
 * Used by both {@link makeImportNowHookMaker} and {@link makeImportHookMaker}.
 *
 * @template {ChooseModuleDescriptorOperators} Operators Type of operators (sync
 * or async)
 * @param {ChooseModuleDescriptorParams} options Options/context
 * @param {Operators} operators Operators
 * @returns {Generator<ChooseModuleDescriptorYieldables,
 * StaticModuleType|undefined, Awaited<ChooseModuleDescriptorYieldables>>}
 * Generator
 */
function* chooseModuleDescriptor(
  {
    candidates,
    compartmentDescriptor,
    compartmentDescriptors,
    compartments,
    computeSha512,
    moduleDescriptors,
    moduleSpecifier,
    packageLocation,
    packageSources,
    readPowers,
    sourceMapHook,
    strictlyRequiredForCompartment,
  },
  { maybeRead, parse, shouldDeferError = () => false },
) {
  for (const candidateSpecifier of candidates) {
    const candidateModuleDescriptor = moduleDescriptors[candidateSpecifier];
    if (candidateModuleDescriptor !== undefined) {
      candidateModuleDescriptor.retained = true;
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
    const moduleLocation = resolveLocation(candidateSpecifier, packageLocation);

    // "next" values must have type assertions for narrowing because we have
    // multiple yielded types
    const moduleBytes = /** @type {Uint8Array|undefined} */ (
      yield maybeRead(moduleLocation)
    );

    if (moduleBytes !== undefined) {
      /** @type {string | undefined} */
      let sourceMap;
      // must be narrowed
      const envelope = /** @type {ParseResult} */ (
        yield parse(
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
        )
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
          retained: true,
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
  return undefined;
}

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
      compartmentDescriptor.retained = true;

      // for lint rule
      await null;

      // All importHook errors must be deferred if coming from loading dependencies
      // identified by a parser that discovers imports heuristically.
      try {
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
          throw Error(
            `Cannot find external module ${q(
              moduleSpecifier,
            )} in package ${packageLocation}`,
          );
        }

        const { maybeRead } = unpackReadPowers(readPowers);

        const candidates = nominateCandidates(moduleSpecifier, searchSuffixes);

        const record = await asyncTrampoline(
          chooseModuleDescriptor,
          {
            candidates,
            compartmentDescriptor,
            compartmentDescriptors,
            compartments,
            computeSha512,
            moduleDescriptors,
            moduleSpecifier,
            packageLocation,
            packageSources,
            readPowers,
            sourceMapHook,
            strictlyRequiredForCompartment,
          },
          { maybeRead, parse, shouldDeferError },
        );

        if (record) {
          return record;
        }

        throw Error(
          `Cannot find file for internal module ${q(
            moduleSpecifier,
          )} (with candidates ${candidates
            .map(x => q(x))
            .join(', ')}) in package ${packageLocation}`,
        );
      } catch (error) {
        return deferError(moduleSpecifier, error);
      }
    };
    return importHook;
  };
  return makeImportHook;
};

/**
 * Synchronous import for dynamic requires.
 *
 * @param {ReadNowPowers} readPowers
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
    parse,
    compartments,
  }) => {
    if (!('isSyncParser' in parse)) {
      return function impossibleTransformImportNowHook() {
        throw new Error(
          'Dynamic requires are only possible with synchronous parsers and no asynchronous module transforms in options',
        );
      };
    }

    const compartmentDescriptor = compartmentDescriptors[packageLocation] || {};

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

    // Associates modules with compartment descriptors based on policy
    // in cases where the association was not made when building the
    // compartment map but is indicated by the policy.
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

    const { maybeReadNow, isAbsolute } = readPowers;

    /** @type {ImportNowHook} */
    const importNowHook = moduleSpecifier => {
      if (isAbsolute(moduleSpecifier)) {
        const record = findRedirect({
          compartmentDescriptor,
          compartmentDescriptors,
          compartments,
          absoluteModuleSpecifier: moduleSpecifier,
          packageLocation,
        });
        if (record) {
          return record;
        }
      }

      const candidates = nominateCandidates(moduleSpecifier, searchSuffixes);

      const record = syncTrampoline(
        chooseModuleDescriptor,
        {
          candidates,
          compartmentDescriptor,
          compartmentDescriptors,
          compartments,
          computeSha512,
          moduleDescriptors,
          moduleSpecifier,
          packageLocation,
          packageSources,
          readPowers,
          sourceMapHook,
          strictlyRequiredForCompartment,
        },
        {
          maybeRead: maybeReadNow,
          parse,
        },
      );

      if (record) {
        return record;
      }

      if (exitModuleImportNowHook) {
        // This hook is responsible for ensuring that the moduleSpecifier
        // actually refers to an exit module.
        const exitRecord = exitModuleImportNowHook(
          moduleSpecifier,
          packageLocation,
        );

        if (!exitRecord) {
          throw new Error(`Could not import module: ${q(moduleSpecifier)}`);
        }

        return exitRecord;
      }

      throw new Error(
        `Could not import module: ${q(
          moduleSpecifier,
        )}; try providing an importNowHook`,
      );
    };

    return importNowHook;
  };
  return makeImportNowHook;
}
