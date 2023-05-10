// @ts-check

/** @typedef {import('ses').ModuleMapHook} ModuleMapHook */
/** @typedef {import('ses').ResolveHook} ResolveHook */
/** @typedef {import('./types.js').ParseFn} ParseFn */
/** @typedef {import('./types.js').ParserImplementation} ParserImplementation */
/** @typedef {import('./types.js').ShouldDeferError} ShouldDeferError */
/** @typedef {import('./types.js').ModuleTransforms} ModuleTransforms */
/** @typedef {import('./types.js').Language} Language */
/** @typedef {import('./types.js').ModuleDescriptor} ModuleDescriptor */
/** @typedef {import('./types.js').CompartmentDescriptor} CompartmentDescriptor */
/** @typedef {import('./types.js').CompartmentMapDescriptor} CompartmentMapDescriptor */
/** @typedef {import('./types.js').DeferredAttenuatorsProvider} DeferredAttenuatorsProvider */
/** @typedef {import('./types.js').LinkOptions} LinkOptions */
/** @template T @typedef {import('@endo/eventual-send').ERef<T>} ERef */

import { resolve } from './node-module-specifier.js';
import { parseExtension } from './extension.js';
import {
  enforceModulePolicy,
  attenuateModuleHook,
  ATTENUATORS_COMPARTMENT,
  diagnoseMissingCompartmentError,
  attenuateGlobals,
  makeDeferredAttenuatorsProvider,
} from './policy.js';

const { entries, fromEntries } = Object;
const { hasOwnProperty } = Object.prototype;
const { apply } = Reflect;
const { allSettled } = Promise;

/**
 * @template T
 * @type {(iterable: Iterable<ERef<T>>) => Promise<Array<PromiseSettledResult<T>>>}
 */
const promiseAllSettled = allSettled.bind(Promise);

const inertStaticModuleRecord = {
  imports: [],
  exports: [],
  execute() {
    throw Error(
      `Assertion failed: compartment graphs built for archives cannot be initialized`,
    );
  },
};

const inertModuleNamespace = new Compartment(
  {},
  {},
  {
    resolveHook() {
      return '';
    },
    async importHook() {
      return inertStaticModuleRecord;
    },
  },
).module('');

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
 * Decide if extension is clearly indicating a parser/language for a file
 *
 * @param {string} extension
 * @returns {boolean}
 */
const extensionImpliesLanguage = extension => extension !== 'js';

/**
 * `makeExtensionParser` produces a `parser` that parses the content of a
 * module according to the corresponding module language, given the extension
 * of the module specifier and the configuration of the containing compartment.
 * We do not yet support import assertions and we do not have a mechanism
 * for validating the MIME type of the module content against the
 * language implied by the extension or file name.
 *
 * @param {Record<string, string>} languageForExtension - maps a file extension
 * to the corresponding language.
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case,
 * the type of a module is implied by package.json and should not be inferred
 * from its extension.
 * @param {Record<string, ParserImplementation>} parserForLanguage
 * @param {ModuleTransforms} moduleTransforms
 * @returns {ParseFn}
 */
const makeExtensionParser = (
  languageForExtension,
  languageForModuleSpecifier,
  parserForLanguage,
  moduleTransforms,
) => {
  return async (bytes, specifier, location, packageLocation, options) => {
    let language;
    const extension = parseExtension(location);

    if (
      !extensionImpliesLanguage(extension) &&
      has(languageForModuleSpecifier, specifier)
    ) {
      language = languageForModuleSpecifier[specifier];
    } else {
      language = languageForExtension[extension] || extension;
    }

    if (has(moduleTransforms, language)) {
      try {
        ({ bytes, parser: language } = await moduleTransforms[language](
          bytes,
          specifier,
          location,
          packageLocation,
        ));
      } catch (err) {
        throw Error(
          `Error transforming ${q(language)} source in ${q(location)}: ${
            err.message
          }`,
          { cause: err },
        );
      }
    }

    if (!has(parserForLanguage, language)) {
      throw Error(
        `Cannot parse module ${specifier} at ${location}, no parser configured for the language ${language}`,
      );
    }
    const { parse } = parserForLanguage[language];
    return parse(bytes, specifier, location, packageLocation, options);
  };
};

/**
 * @param {Record<string, Language>} languageForExtension
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case, the type of a module
 * is implied by package.json and should not be inferred from its extension.
 * @param {Record<string, ParserImplementation>} parserForLanguage
 * @param {ModuleTransforms} moduleTransforms
 * @returns {ParseFn}
 */
export const mapParsers = (
  languageForExtension,
  languageForModuleSpecifier,
  parserForLanguage,
  moduleTransforms = {},
) => {
  const languageForExtensionEntries = [];
  const problems = [];
  for (const [extension, language] of entries(languageForExtension)) {
    if (has(parserForLanguage, language)) {
      languageForExtensionEntries.push([extension, language]);
    } else {
      problems.push(`${q(language)} for extension ${q(extension)}`);
    }
  }
  if (problems.length > 0) {
    throw Error(`No parser available for language: ${problems.join(', ')}`);
  }
  return makeExtensionParser(
    fromEntries(languageForExtensionEntries),
    languageForModuleSpecifier,
    parserForLanguage,
    moduleTransforms,
  );
};

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
 * @param {Record<string, string>} exitModules
 * @param {DeferredAttenuatorsProvider} attenuators
 * @param {boolean} archiveOnly
 * @returns {ModuleMapHook | undefined}
 */
const makeModuleMapHook = (
  compartmentDescriptor,
  compartments,
  compartmentName,
  moduleDescriptors,
  scopeDescriptors,
  exitModules,
  attenuators,
  archiveOnly,
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
        enforceModulePolicy(moduleSpecifier, compartmentDescriptor, {
          exit: true,
        });
        const module = exitModules[exit];
        if (module === undefined) {
          throw Error(
            `Cannot import missing external module ${q(
              exit,
            )}, may be missing from ${compartmentName} package.json`,
          );
        }
        if (archiveOnly) {
          return inertModuleNamespace;
        } else {
          return attenuateModuleHook(
            exit,
            module,
            compartmentDescriptor.policy,
            attenuators,
          );
        }
      }
      if (foreignModuleSpecifier !== undefined) {
        if (!moduleSpecifier.startsWith('./')) {
          // archive goes through foreignModuleSpecifier for local modules too
          enforceModulePolicy(moduleSpecifier, compartmentDescriptor, {
            exit: false,
          });
        }

        const foreignCompartment = compartments[foreignCompartmentName];
        if (foreignCompartment === undefined) {
          throw Error(
            `Cannot import from missing compartment ${q(
              foreignCompartmentName,
            )}${diagnoseMissingCompartmentError({
              moduleSpecifier,
              compartmentDescriptor,
              foreignModuleSpecifier,
              foreignCompartmentName,
            })}`,
          );
        }
        return foreignCompartment.module(foreignModuleSpecifier);
      }
    } else if (has(exitModules, moduleSpecifier)) {
      enforceModulePolicy(moduleSpecifier, compartmentDescriptor, {
        exit: true,
      });

      // When linking off the filesystem as with `importLocation`,
      // there isn't a module descriptor for every module.
      moduleDescriptors[moduleSpecifier] = { exit: moduleSpecifier };
      if (archiveOnly) {
        return inertModuleNamespace;
      } else {
        return attenuateModuleHook(
          moduleSpecifier,
          exitModules[moduleSpecifier],
          compartmentDescriptor.policy,
          attenuators,
        );
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
            )}${diagnoseMissingCompartmentError({
              moduleSpecifier,
              compartmentDescriptor,
              foreignModuleSpecifier,
              foreignCompartmentName,
            })}`,
          );
        }

        // Despite all non-exit modules not allowed by policy being dropped
        // while building the graph, this check is necessary because module
        // is written back to the compartment map below.
        enforceModulePolicy(scopePrefix, compartmentDescriptor, {
          exit: false,
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
        return foreignCompartment.module(foreignModuleSpecifier);
      }
    }

    // No entry in the module map.
    // Compartments will fall through to their `importHook`.
    return undefined;
  };

  return moduleMapHook;
};

/**
 * Assemble a DAG of compartments as declared in a compartment map starting at
 * the named compartment and building all compartments that it depends upon,
 * recursively threading the modules exported by one compartment into the
 * compartment that imports them.
 * Returns the root of the compartment DAG.
 * Does not load or execute any modules.
 * Uses makeImportHook with the given "location" string of each compartment in
 * the DAG.
 * Passes the given globals and external modules into the root compartment
 * only.
 *
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {LinkOptions} options
 */
export const link = (
  { entry, compartments: compartmentDescriptors },
  {
    makeImportHook,
    parserForLanguage,
    globals = {},
    transforms = [],
    moduleTransforms = {},
    __shimTransforms__ = [],
    modules: exitModules = {},
    archiveOnly = false,
    Compartment = defaultCompartment,
  },
) => {
  const { compartment: entryCompartmentName } = entry;

  /** @type {Record<string, Compartment>} */
  const compartments = Object.create(null);

  /**
   * @param {string} attenuatorSpecifier
   */
  const attenuators = makeDeferredAttenuatorsProvider(
    compartments,
    compartmentDescriptors,
  );

  /** @type {Record<string, ResolveHook>} */
  const resolvers = Object.create(null);

  const pendingJobs = [];

  for (const [compartmentName, compartmentDescriptor] of entries(
    compartmentDescriptors,
  )) {
    const {
      location,
      name,
      modules = Object.create(null),
      parsers: languageForExtension = Object.create(null),
      types: languageForModuleSpecifier = Object.create(null),
      scopes = Object.create(null),
    } = compartmentDescriptor;

    // Capture the default.
    // The `moduleMapHook` writes back to the compartment map.
    compartmentDescriptor.modules = modules;

    const parse = mapParsers(
      languageForExtension,
      languageForModuleSpecifier,
      parserForLanguage,
      moduleTransforms,
    );
    /** @type {ShouldDeferError} */
    const shouldDeferError = language => {
      if (language && has(parserForLanguage, language)) {
        return parserForLanguage[language].heuristicImports;
      } else {
        // If language is undefined or there's no parser, the error we could consider deferring is surely related to
        // that. Nothing to throw here.
        return false;
      }
    };

    const importHook = makeImportHook(
      location,
      name,
      parse,
      shouldDeferError,
      compartments,
    );
    const moduleMapHook = makeModuleMapHook(
      compartmentDescriptor,
      compartments,
      compartmentName,
      modules,
      scopes,
      exitModules,
      attenuators,
      archiveOnly,
    );
    const resolveHook = resolve;
    resolvers[compartmentName] = resolve;

    const compartment = new Compartment(Object.create(null), undefined, {
      resolveHook,
      importHook,
      moduleMapHook,
      transforms,
      __shimTransforms__,
      name: location,
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
    resolvers,
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
 */
export const assemble = (compartmentMap, options) =>
  link(compartmentMap, options).compartment;
