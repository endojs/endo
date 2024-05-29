// @ts-check

/** @import {ModuleMapHook} from 'ses' */
/** @import {ResolveHook} from 'ses' */
/** @import {ExtraImportOptions, ParseFn} from './types.js' */
/** @import {ParserImplementation} from './types.js' */
/** @import {ShouldDeferError} from './types.js' */
/** @import {ModuleTransforms} from './types.js' */
/** @import {Language} from './types.js' */
/** @import {ModuleDescriptor} from './types.js' */
/** @import {CompartmentDescriptor} from './types.js' */
/** @import {CompartmentMapDescriptor} from './types.js' */
/** @import {LinkOptions} from './types.js' */
/** @import {ERef} from '@endo/eventual-send' */

import { resolve as resolveFallback } from './node-module-specifier.js';
import { parseExtension } from './extension.js';
import {
  enforceModulePolicy,
  ATTENUATORS_COMPARTMENT,
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

    let sourceMap;

    if (has(moduleTransforms, language)) {
      try {
        ({
          bytes,
          parser: language,
          sourceMap,
        } = await moduleTransforms[language](
          bytes,
          specifier,
          location,
          packageLocation,
          {
            // At time of writing, sourceMap is always undefined, but keeping
            // it here is more resilient if the surrounding if block becomes a
            // loop for multi-step transforms.
            sourceMap,
          },
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
    return parse(bytes, specifier, location, packageLocation, {
      sourceMap,
      ...options,
    });
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
        return foreignCompartment.module(foreignModuleSpecifier);
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
 * @param {LinkOptions & ExtraImportOptions} options
 */
export const link = (
  { entry, compartments: compartmentDescriptors },
  {
    resolve = resolveFallback,
    makeImportHook,
    parserForLanguage,
    globals = {},
    transforms = [],
    moduleTransforms = {},
    __shimTransforms__ = [],
    archiveOnly = false,
    Compartment = defaultCompartment,
    parsers = [],
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

  const pendingJobs = [];

  /** @type {Record<string, Language>} */
  const customLanguageForExtension = Object.create(null);
  for (const { parser, extensions, language } of parsers) {
    if (
      language in parserForLanguage &&
      parserForLanguage[language] !== parser
    ) {
      throw new Error(`Parser for language ${q(language)} already defined`);
    }
    parserForLanguage[language] = parser;
    for (const extension of extensions) {
      if (
        extension in customLanguageForExtension &&
        customLanguageForExtension[extension] !== language
      ) {
        throw new Error(
          `Extension ${q(extension)} already assigned language ${q(customLanguageForExtension[extension])}`,
        );
      }
      customLanguageForExtension[extension] = language;
    }
  }

  for (const [compartmentName, compartmentDescriptor] of entries(
    compartmentDescriptors,
  )) {
    // TODO: The default assignments seem to break type inference
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

    for (const [extension, language] of entries(customLanguageForExtension)) {
      languageForExtension[extension] = language;
    }

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
    const moduleMapHook = makeModuleMapHook(
      compartmentDescriptor,
      compartments,
      compartmentName,
      modules,
      scopes,
    );

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
