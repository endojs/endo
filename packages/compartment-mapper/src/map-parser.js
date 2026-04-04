/**
 * Exports {@link makeMapParsers}, which creates a function which matches a
 * module to a parser based on reasons.
 *
 * @module
 */

/**
 * @import {
 *   LanguageForExtension,
 *   LanguageForModuleSpecifier,
 *   MakeMapParsersOptions,
 *   MapParsersFn,
 *   ModuleTransform,
 *   ModuleTransforms,
 *   ParseFn,
 *   AsyncParseFn,
 *   ParseResult,
 *   ParserForLanguage,
 *   SyncParserForLanguage,
 *   ParserImplementation,
 *   AsyncParserImplementation,
 *   SyncModuleTransform,
 *   SyncModuleTransforms
 * } from './types.js';
 * @import {
 *   EReturn
 * } from '@endo/eventual-send';
 */

import { syncTrampoline, asyncTrampoline } from '@endo/trampoline';
import { parseExtension } from './extension.js';

const { entries, fromEntries, keys, hasOwnProperty, values } = Object;
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
 * Resolves the module language from its specifier and location, then applies
 * any matching transform. Shared logic between sync and async generators.
 *
 * @param {string} specifier
 * @param {string} location
 * @param {Record<string, string>} languageForExtension
 * @param {Record<string, string>} languageForModuleSpecifier
 * @returns {string} The resolved language.
 */
const resolveLanguage = (
  specifier,
  location,
  languageForExtension,
  languageForModuleSpecifier,
) => {
  const extension = parseExtension(location);
  if (
    !extensionImpliesLanguage(extension) &&
    has(languageForModuleSpecifier, specifier)
  ) {
    return languageForModuleSpecifier[specifier];
  }
  return languageForExtension[extension] || extension;
};

/**
 * Produces a sync `ParseFn` for use when all parsers and transforms are
 * synchronous.
 *
 * @param {Record<string, string>} languageForExtension
 * @param {Record<string, string>} languageForModuleSpecifier
 * @param {SyncParserForLanguage} parsers
 * @param {SyncModuleTransforms} transforms
 * @returns {ParseFn}
 */
const makeSyncExtensionParser = (
  languageForExtension,
  languageForModuleSpecifier,
  parsers,
  transforms,
) => {
  /**
   * @param {Uint8Array} bytes
   * @param {string} specifier
   * @param {string} location
   * @param {string} packageLocation
   * @param {*} options
   * @returns {Generator<ReturnType<SyncModuleTransform>, ParseResult, ReturnType<SyncModuleTransform>>}
   */
  function* getParserGenerator(
    bytes,
    specifier,
    location,
    packageLocation,
    options,
  ) {
    let language = resolveLanguage(
      specifier,
      location,
      languageForExtension,
      languageForModuleSpecifier,
    );

    /** @type {string | undefined} */
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
    if (!has(parsers, language)) {
      throw Error(
        `Cannot parse module ${specifier} at ${location}, no parser configured for the language ${language}`,
      );
    }
    const { parse } = parsers[language];
    return parse(bytes, specifier, location, packageLocation, {
      sourceMap,
      ...options,
    });
  }

  /** @type {ParseFn} */
  const syncParser = (bytes, specifier, location, packageLocation, options) =>
    syncTrampoline(
      getParserGenerator,
      bytes,
      specifier,
      location,
      packageLocation,
      options,
    );
  syncParser.isSyncParser = true;
  return syncParser;
};

/**
 * Produces an async `AsyncParseFn` for use when any parser or transform may
 * be asynchronous.
 *
 * @param {Record<string, string>} languageForExtension
 * @param {Record<string, string>} languageForModuleSpecifier
 * @param {ParserForLanguage} parsers
 * @param {ModuleTransforms} moduleTransforms
 * @param {SyncModuleTransforms} syncModuleTransforms
 * @returns {AsyncParseFn}
 */
const makeAsyncExtensionParser = (
  languageForExtension,
  languageForModuleSpecifier,
  parsers,
  moduleTransforms,
  syncModuleTransforms,
) => {
  /** @type {Record<string, ModuleTransform | SyncModuleTransform>} */
  const transforms = {
    ...syncModuleTransforms,
    ...moduleTransforms,
  };

  /**
   * @param {Uint8Array} bytes
   * @param {string} specifier
   * @param {string} location
   * @param {string} packageLocation
   * @param {*} options
   * @returns {Generator<ReturnType<ModuleTransform> | ReturnType<SyncModuleTransform>, ParseResult | Promise<ParseResult>, any>}
   */
  function* getParserGenerator(
    bytes,
    specifier,
    location,
    packageLocation,
    options,
  ) {
    let language = resolveLanguage(
      specifier,
      location,
      languageForExtension,
      languageForModuleSpecifier,
    );

    /** @type {string | undefined} */
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
    if (!has(parsers, language)) {
      throw Error(
        `Cannot parse module ${specifier} at ${location}, no parser configured for the language ${language}`,
      );
    }
    const { parse } = parsers[language];
    return parse(bytes, specifier, location, packageLocation, {
      sourceMap,
      ...options,
    });
  }

  /** @type {AsyncParseFn} */
  const asyncParser = async (
    bytes,
    specifier,
    location,
    packageLocation,
    options,
  ) =>
    asyncTrampoline(
      getParserGenerator,
      bytes,
      specifier,
      location,
      packageLocation,
      options,
    );
  return asyncParser;
};

/**
 * Validates the language-for-extension mapping against the parser-for-language
 * map, filtering to only valid entries.
 *
 * @param {LanguageForExtension} languageForExtension
 * @param {ParserForLanguage} parserForLanguage
 * @returns {Record<string, string>} Filtered extension-to-language mapping.
 */
const validateLanguageForExtension = (
  languageForExtension,
  parserForLanguage,
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
  return fromEntries(languageForExtensionEntries);
};

/**
 * Type guard that narrows {@link ParserForLanguage} to
 * {@link SyncParserForLanguage} by checking that every parser has
 * `synchronous: true`.
 *
 * @param {ParserForLanguage} pfl
 * @returns {pfl is SyncParserForLanguage}
 */
const isSyncParserForLanguage = pfl =>
  values(pfl).every(({ synchronous }) => synchronous);

/**
 * Prepares a function to map parsers after verifying whether synchronous
 * behavior is preferred. Synchronous behavior is selected if all parsers are
 * synchronous and no async transforms are provided.
 *
 * @param {MakeMapParsersOptions} options
 * @returns {MapParsersFn}
 */
export const makeMapParsers = ({
  parserForLanguage,
  moduleTransforms,
  syncModuleTransforms,
}) => {
  const hasAsyncTransforms =
    moduleTransforms != null && keys(moduleTransforms).length > 0;

  if (!hasAsyncTransforms && isSyncParserForLanguage(parserForLanguage)) {
    /**
     * Synchronous `mapParsers()` function; returned when all parsers are
     * synchronous and `moduleTransforms` is empty.
     *
     * @type {MapParsersFn<ParseFn>}
     */
    return (languageForExtension, languageForModuleSpecifier) => {
      const validExtensions = validateLanguageForExtension(
        languageForExtension,
        parserForLanguage,
      );
      return makeSyncExtensionParser(
        validExtensions,
        languageForModuleSpecifier,
        parserForLanguage,
        syncModuleTransforms || {},
      );
    };
  }

  /**
   * Async `mapParsers()` function; returned when a non-synchronous parser is
   * present _or_ when `moduleTransforms` is non-empty.
   *
   * @type {MapParsersFn<AsyncParseFn>}
   */
  return (languageForExtension, languageForModuleSpecifier) => {
    const validExtensions = validateLanguageForExtension(
      languageForExtension,
      parserForLanguage,
    );
    return makeAsyncExtensionParser(
      validExtensions,
      languageForModuleSpecifier,
      parserForLanguage,
      moduleTransforms || {},
      syncModuleTransforms || {},
    );
  };
};
