/**
 * Exports {@link mapParsers}, which matches a module to a parser based on reasons.
 *
 * @module
 */

// @ts-check

import { syncTrampoline, asyncTrampoline } from '@endo/trampoline';
import { parseExtension } from './extension.js';

/**
 * @import {
 *   LanguageForExtension,
 *   ModuleTransform,
 *   ModuleTransforms,
 *   ParseFn,
 *   ParseFnAsync,
 *   ParseResult,
 *   ParserForLanguage,
 *   SyncModuleTransform,
 *   SyncModuleTransforms
 * } from './types.js';
 */

const { entries, fromEntries, keys, hasOwnProperty } = Object;
const { apply } = Reflect;
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
 * Produces a `parser` that parses the content of a module according to the
 * corresponding module language, given the extension of the module specifier
 * and the configuration of the containing compartment. We do not yet support
 * import assertions and we do not have a mechanism for validating the MIME type
 * of the module content against the language implied by the extension or file
 * name.
 *
 * @param {boolean} preferSynchronous
 * @param {Record<string, string>} languageForExtension - maps a file extension
 * to the corresponding language.
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case,
 * the type of a module is implied by package.json and should not be inferred
 * from its extension.
 * @param {ParserForLanguage} parserForLanguage
 * @param {ModuleTransforms} moduleTransforms
 * @param {SyncModuleTransforms} syncModuleTransforms
 * @returns {ParseFnAsync|ParseFn}
 */
const makeExtensionParser = (
  preferSynchronous,
  languageForExtension,
  languageForModuleSpecifier,
  parserForLanguage,
  moduleTransforms,
  syncModuleTransforms,
) => {
  /** @type {Record<string, ModuleTransform | SyncModuleTransform>} */
  let transforms;

  /**
   * Function returning a generator which executes a parser for a module in either sync or async context.
   *
   * @param {Uint8Array} bytes
   * @param {string} specifier
   * @param {string} location
   * @param {string} packageLocation
   * @param {*} options
   * @returns {Generator<ReturnType<ModuleTransform>|ReturnType<SyncModuleTransform>, ParseResult, Awaited<ReturnType<ModuleTransform>|ReturnType<SyncModuleTransform>>>}
   */
  function* getParserGenerator(
    bytes,
    specifier,
    location,
    packageLocation,
    options,
  ) {
    /** @type {string} */
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

    /** @type {string|undefined} */
    let sourceMap;

    if (has(transforms, language)) {
      try {
        ({
          bytes,
          parser: language,
          sourceMap,
        } = yield transforms[language](
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
          `Error transforming ${q(language)} source in ${q(location)}: ${err.message}`,
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
  }

  /**
   * @type {ParseFn}
   */
  const syncParser = (bytes, specifier, location, packageLocation, options) => {
    const result = syncTrampoline(
      getParserGenerator,
      bytes,
      specifier,
      location,
      packageLocation,
      options,
    );
    if ('then' in result && typeof result.then === 'function') {
      throw new TypeError(
        'Sync parser cannot return a Thenable; ensure parser is actually synchronous',
      );
    }
    return result;
  };
  syncParser.isSyncParser = true;

  /**
   * @type {ParseFnAsync}
   */
  const asyncParser = async (
    bytes,
    specifier,
    location,
    packageLocation,
    options,
  ) => {
    return asyncTrampoline(
      getParserGenerator,
      bytes,
      specifier,
      location,
      packageLocation,
      options,
    );
  };

  // Unfortunately, typescript was not smart enough to figure out the return type depending on a boolean in arguments, so it has to be ParseFnAsync|ParseFn
  if (preferSynchronous) {
    transforms = syncModuleTransforms;
    return syncParser;
  } else {
    // we can fold syncModuleTransforms into moduleTransforms because
    // async supports sync, but not vice-versa
    transforms = {
      ...syncModuleTransforms,
      ...moduleTransforms,
    };

    return asyncParser;
  }
};


/**
 * @param {LanguageForExtension} languageForExtension
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case, the type of a module
 * is implied by package.json and should not be inferred from its extension.
 * @param {ParserForLanguage} parserForLanguage
 * @param {ModuleTransforms} [moduleTransforms]
 * @param {SyncModuleTransforms} [syncModuleTransforms]
 * @param {boolean} [preferSynchronous]
 * @returns {ParseFnAsync|ParseFn}
 */
export const mapParsers = (
  languageForExtension,
  languageForModuleSpecifier,
  parserForLanguage,
  moduleTransforms = {},
  syncModuleTransforms = {},
  preferSynchronous = false,
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
    preferSynchronous,
    fromEntries(languageForExtensionEntries),
    languageForModuleSpecifier,
    parserForLanguage,
    moduleTransforms,
    syncModuleTransforms,
  );
};

/**
 * Prepares a function to map parsers after verifying whether synchronous behavior is 
 * preferred. Synchronous behavior is selected if all parsers are synchronous and no
 * async transforms are provided.
 * 
 * @param {object} options
 * @param {ParserForLanguage} options.parserForLanguage
 * @param {ModuleTransforms} [options.moduleTransforms]
 * @param {SyncModuleTransforms} [options.syncModuleTransforms]
 * @returns {(languageForExtension: LanguageForExtension, languageForModuleSpecifier: Record<string, string>) => ParseFnAsync|ParseFn}
 */
export const makeMapParsers = ({
  parserForLanguage,
  moduleTransforms,
  syncModuleTransforms,
}) => {
  let preferSynchronous = true;
  if (moduleTransforms && keys(moduleTransforms).length > 0) {
    preferSynchronous = false;
  } else {
    for (const [_language, { synchronous }] of entries(parserForLanguage)) {
      if (!synchronous) {
        preferSynchronous = false;
        break;
      }
    }
  }
  return (languageForExtension, languageForModuleSpecifier) =>
    mapParsers(
      languageForExtension,
      languageForModuleSpecifier,
      parserForLanguage,
      moduleTransforms,
      syncModuleTransforms,
      preferSynchronous,
    );
};
