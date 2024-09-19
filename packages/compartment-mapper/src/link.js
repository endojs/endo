/* Provides the linking behavior shared by all Compartment Mapper workflows.
 * This involves creating and configuring compartments according to the
 * specifications in a compartment map, and is suitable for compartment maps
 * that just outline the locations of compartments and their inter-linkage and
 * also compartment maps that include every module descriptor in the transitive
 * dependencies of their entry module.
 */

// @ts-check

/** @import {ImportNowHook, ModuleMapHook} from 'ses' */
/**
 * @import {
 *   CompartmentDescriptor,
 *   CompartmentMapDescriptor,
 *   ImportNowHookMaker,
 *   ImportNowHookMakerParams,
 *   LanguageForExtension,
 *   LinkOptions,
 *   LinkResult,
 *   ModuleDescriptor,
 *   ModuleTransforms,
 *   ParseFn,
 *   ParseFnAsync,
 *   ParserForLanguage,
 *   ParserImplementation,
 *   ShouldDeferError,
 *   SyncModuleTransforms
 * } from './types.js'
 */
/** @import {ERef} from '@endo/eventual-send' */

import { mapParsers } from './map-parser.js';
import { resolve as resolveFallback } from './node-module-specifier.js';
import {
  ATTENUATORS_COMPARTMENT,
  attenuateGlobals,
  enforceModulePolicy,
  makeDeferredAttenuatorsProvider,
} from './policy.js';

const { assign, create, entries, freeze, keys } = Object;
const { hasOwnProperty } = Object.prototype;
const { apply } = Reflect;
const { allSettled } = Promise;

/**
 * @template T
 * @type {(iterable: Iterable<ERef<T>>) => Promise<Array<PromiseSettledResult<T>>>}
 */
const promiseAllSettled = allSettled.bind(Promise);

const defaultCompartment = Compartment;

// q, as in quote, for strings in error messages.
const q = JSON.stringify;

/**
 * @param {Record<string, unknown>} object
 * @param {string} key
 * @returns {boolean}
 */
const has = (object, key) => apply(hasOwnProperty, object, [key]);

/**
 * For a full, absolute module specifier like "dependency",
 * produce the module specifier in the dependency, like ".".
 * For a deeper path like "@org/dep/aux" and a prefix like "@org/dep", produce
 * "./aux".
 *
 * @param {string} moduleSpecifier
 * @param {string} prefix
 * @returns {string=}
 */
const trimModuleSpecifierPrefix = (moduleSpecifier, prefix) => {
  if (moduleSpecifier === prefix) {
    return '.';
  }
  if (moduleSpecifier.startsWith(`${prefix}/`)) {
    return `./${moduleSpecifier.slice(prefix.length + 1)}`;
  }
  return undefined;
};

/**
 * `makeModuleMapHook` generates a `moduleMapHook` for the `Compartment`
 * constructor, suitable for Node.js style packages where any module in the
 * package might be imported.
 * Since searching for all of these modules up front is either needlessly
 * costly (on a file system) or impossible (from a web service), we
 * let the import graph guide our search.
 * Any module specifier with an absolute prefix should be captured by
 * the `moduleMap` or `moduleMapHook`.
 *
 * @param {CompartmentDescriptor} compartmentDescriptor
 * @param {Record<string, Compartment>} compartments
 * @param {string} compartmentName
 * @param {Record<string, ModuleDescriptor>} moduleDescriptors
 * @param {Record<string, ModuleDescriptor>} scopeDescriptors
 * @returns {ModuleMapHook | undefined}
 */
const makeModuleMapHook = (
  compartmentDescriptor,
  compartments,
  compartmentName,
  moduleDescriptors,
  scopeDescriptors,
) => {
  /**
   * @param {string} moduleSpecifier
   * @returns {string | object | undefined}
   */
  const moduleMapHook = moduleSpecifier => {
    compartmentDescriptor.retained = true;

    const moduleDescriptor = moduleDescriptors[moduleSpecifier];
    if (moduleDescriptor !== undefined) {
      // "foreignCompartmentName" refers to the compartment which
      // may differ from the current compartment
      const {
        compartment: foreignCompartmentName = compartmentName,
        module: foreignModuleSpecifier,
        exit,
      } = moduleDescriptor;
      if (exit !== undefined) {
        return undefined; // fall through to import hook
      }
      if (foreignModuleSpecifier !== undefined) {
        // archive goes through foreignModuleSpecifier for local modules too
        if (!moduleSpecifier.startsWith('./')) {
          // This code path seems to only be reached on subsequent imports of the same specifier in the same compartment.
          // The check should be redundant and is only left here out of abundance of caution.
          enforceModulePolicy(moduleSpecifier, compartmentDescriptor, {
            exit: false,
            errorHint:
              'This check should not be reachable. If you see this error, please file an issue.',
          });
        }

        const foreignCompartment = compartments[foreignCompartmentName];
        if (foreignCompartment === undefined) {
          throw Error(
            `Cannot import from missing compartment ${q(
              foreignCompartmentName,
            )}}`,
          );
        }
        return {
          compartment: foreignCompartment,
          namespace: foreignModuleSpecifier,
        };
      }
    }

    // Search for a scope that shares a prefix with the requested module
    // specifier.
    // This might be better with a trie, but only a benchmark on real-world
    // data would tell us whether the additional complexity would translate to
    // better performance, so this is left readable and presumed slow for now.
    for (const [scopePrefix, scopeDescriptor] of entries(scopeDescriptors)) {
      const foreignModuleSpecifier = trimModuleSpecifierPrefix(
        moduleSpecifier,
        scopePrefix,
      );

      if (foreignModuleSpecifier !== undefined) {
        const { compartment: foreignCompartmentName } = scopeDescriptor;
        if (foreignCompartmentName === undefined) {
          throw Error(
            `Cannot import from scope ${scopePrefix} due to missing "compartment" property`,
          );
        }
        const foreignCompartment = compartments[foreignCompartmentName];
        if (foreignCompartment === undefined) {
          throw Error(
            `Cannot import from missing compartment ${q(
              foreignCompartmentName,
            )}`,
          );
        }

        enforceModulePolicy(scopePrefix, compartmentDescriptor, {
          exit: false,
          errorHint: `Blocked in linking. ${q(
            moduleSpecifier,
          )} is part of the compartment map and resolves to ${q(
            foreignCompartmentName,
          )}.`,
        });
        // The following line is weird.
        // Information is flowing backward.
        // This moduleMapHook writes back to the `modules` descriptor, from the
        // original compartment map.
        // So the compartment map that was used to create the compartment
        // assembly, can then be captured in an archive, obviating the need for
        // a moduleMapHook when we assemble compartments from the resulting
        // archive.
        moduleDescriptors[moduleSpecifier] = {
          compartment: foreignCompartmentName,
          module: foreignModuleSpecifier,
        };
        return {
          compartment: foreignCompartment,
          namespace: foreignModuleSpecifier,
        };
      }
    }

    // No entry in the module map.
    // Compartments will fall through to their `importHook`.
    return undefined;
  };

  return moduleMapHook;
};

/**
 * @type {ImportNowHookMaker}
 */
const impossibleImportNowHookMaker = () => {
  return function impossibleImportNowHook() {
    throw new Error('Provided read powers do not support dynamic requires');
  };
};

/**
 * Assemble a DAG of compartments as declared in a compartment map starting at
 * the named compartment and building all compartments that it depends upon,
 * recursively threading the modules exported by one compartment into the
 * compartment that imports them.
 *
 * - Returns the root of the compartment DAG.
 * - Does not load or execute any modules.
 * - Uses `makeImportHook` with the given "location" string of each compartment
 *   in the DAG.
 * - Passes the given globals and external modules into the root compartment
 *   only.
 *
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {LinkOptions} options
 * @returns {LinkResult} the root compartment of the compartment DAG
 */

/**
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {LinkOptions} options
 * @returns {LinkResult}
 */
export const link = (
  { entry, compartments: compartmentDescriptors },
  options,
) => {
  const {
    resolve = resolveFallback,
    makeImportHook,
    makeImportNowHook = impossibleImportNowHookMaker,
    parserForLanguage: parserForLanguageOption = {},
    languageForExtension: languageForExtensionOption = {},
    globals = {},
    transforms = [],
    moduleTransforms,
    syncModuleTransforms,
    __shimTransforms__ = [],
    archiveOnly = false,
    Compartment = defaultCompartment,
  } = options;

  const { compartment: entryCompartmentName } = entry;

  /** @type {Record<string, Compartment>} */
  const compartments = create(null);

  /**
   * @param {string} attenuatorSpecifier
   */
  const attenuators = makeDeferredAttenuatorsProvider(
    compartments,
    compartmentDescriptors,
  );

  const pendingJobs = [];

  /** @type {LanguageForExtension} */
  const defaultLanguageForExtension = freeze(
    assign(create(null), languageForExtensionOption),
  );
  /** @type {ParserForLanguage} */
  const parserForLanguage = freeze(
    assign(create(null), parserForLanguageOption),
  );

  for (const [compartmentName, compartmentDescriptor] of entries(
    compartmentDescriptors,
  )) {
    const {
      location,
      name,
      parsers: languageForExtensionOverrides = {},
      types: languageForModuleSpecifierOverrides = {},
    } = compartmentDescriptor;

    // this is for retaining the correct type inference about these values
    // without use of `let`
    const { scopes: _scopes, modules: _modules } = compartmentDescriptor;
    const modules = _modules || create(null);
    const scopes = _scopes || create(null);

    // Capture the default.
    // The `moduleMapHook` writes back to the compartment map.
    compartmentDescriptor.modules = modules;

    /** @type {Record<string, string>} */
    const languageForModuleSpecifier = freeze(
      assign(create(null), languageForModuleSpecifierOverrides),
    );
    /** @type {LanguageForExtension} */
    const languageForExtension = freeze(
      assign(
        create(null),
        defaultLanguageForExtension,
        languageForExtensionOverrides,
      ),
    );

    // TS is kind of dumb about this, so we can use a type assertion to avoid a
    // pointless ternary.
    const parse = /** @type {ParseFn|ParseFnAsync} */ (
      mapParsers(
        languageForExtension,
        languageForModuleSpecifier,
        parserForLanguage,
        moduleTransforms,
        syncModuleTransforms,
      )
    );

    /** @type {ShouldDeferError} */
    const shouldDeferError = language => {
      if (language && has(parserForLanguage, language)) {
        return /** @type {ParserImplementation} */ (parserForLanguage[language])
          .heuristicImports;
      } else {
        // If language is undefined or there's no parser, the error we could consider deferring is surely related to
        // that. Nothing to throw here.
        return false;
      }
    };

    // If we ever need an alternate resolution algorithm, it should be
    // indicated in the compartment descriptor and a behavior selected here.
    const resolveHook = resolve;
    const importHook = makeImportHook({
      packageLocation: location,
      packageName: name,
      attenuators,
      parse,
      shouldDeferError,
      compartments,
    });

    const importNowHook = makeImportNowHook({
      packageLocation: location,
      packageName: name,
      parse,
      compartments,
    });

    const moduleMapHook = makeModuleMapHook(
      compartmentDescriptor,
      compartments,
      compartmentName,
      modules,
      scopes,
    );

    const compartment = new Compartment({
      name: location,
      resolveHook,
      importHook,
      importNowHook,
      moduleMapHook,
      transforms,
      __shimTransforms__,
      __options__: true,
    });

    if (!archiveOnly) {
      attenuateGlobals(
        compartment.globalThis,
        globals,
        compartmentDescriptor.policy,
        attenuators,
        pendingJobs,
        compartmentDescriptor.name,
      );
    }

    compartments[compartmentName] = compartment;
  }

  const compartment = compartments[entryCompartmentName];
  if (compartment === undefined) {
    throw Error(
      `Cannot assemble compartment graph because the root compartment named ${q(
        entryCompartmentName,
      )} is missing from the compartment map`,
    );
  }
  const attenuatorsCompartment = compartments[ATTENUATORS_COMPARTMENT];

  return {
    compartment,
    compartments,
    attenuatorsCompartment,
    pendingJobsPromise: promiseAllSettled(pendingJobs).then(
      /** @param {PromiseSettledResult<unknown>[]} results */ results => {
        const errors = results
          .filter(result => result.status === 'rejected')
          .map(
            /** @param {PromiseRejectedResult} result */ result =>
              result.reason,
          );
        if (errors.length > 0) {
          throw Error(
            `Globals attenuation errors: ${errors
              .map(error => error.message)
              .join(', ')}`,
          );
        }
      },
    ),
  };
};

/**
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {LinkOptions} options
 * @deprecated Use {@link link}.
 */
export const assemble = (compartmentMap, options) =>
  link(compartmentMap, options).compartment;
