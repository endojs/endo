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

const syncParsers = new WeakSet()

/**
 * Produces a `parser` that parses the content of a module according to the
 * corresponding module language, given the extension of the module specifier
 * and the configuration of the containing compartment. We do not yet support
 * import assertions and we do not have a mechanism for validating the MIME type
 * of the module content against the language implied by the extension or file
 * name.
 *
 * @overload
 * @param {Record<string, string>} languageForExtension - maps a file extension
 * to the corresponding language.
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case,
 * the type of a module is implied by package.json and should not be inferred
 * from its extension.
 * @param {ParserForLanguage} parserForLanguage
 * @param {never} [moduleTransforms]
 * @param {SyncModuleTransforms} [syncModuleTransforms]
 * @returns {ParseFn}
 */

/**
 * Produces a `parser` that parses the content of a module according to the
 * corresponding module language, given the extension of the module specifier
 * and the configuration of the containing compartment. We do not yet support
 * import assertions and we do not have a mechanism for validating the MIME type
 * of the module content against the language implied by the extension or file
 * name.
 * @overload
 * @param {Record<string, string>} languageForExtension - maps a file extension
 * to the corresponding language.
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case,
 * the type of a module is implied by package.json and should not be inferred
 * from its extension.
 * @param {ParserForLanguage} parserForLanguage
 * @param {ModuleTransforms|SyncModuleTransforms} [moduleTransforms]
 * @param {SyncModuleTransforms} [syncModuleTransforms]
 * @returns {ParseFnAsync}
 */

/**
 * Produces a `parser` that parses the content of a module according to the
 * corresponding module language, given the extension of the module specifier
 * and the configuration of the containing compartment. We do not yet support
 * import assertions and we do not have a mechanism for validating the MIME type
 * of the module content against the language implied by the extension or file
 * name.
 *
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
   * @param {Uint8Array} bytes
   * @param {string} specifier
   * @param {string} location
   * @param {string} packageLocation
   * @param {*} options
   * @returns {ParseResult}
   */
  const syncParser = (bytes, specifier, location, packageLocation, options) => {
    return syncTrampoline(
      getParserGenerator,
      bytes,
      specifier,
      location,
      packageLocation,
      options,
    );
  };

  /**
   * @param {Uint8Array} bytes
   * @param {string} specifier
   * @param {string} location
   * @param {string} packageLocation
   * @param {*} options
   * @returns {Promise<ParseResult>}
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

  // if we have nothing in the moduleTransforms object, then we can use the syncParser.
  if (keys(moduleTransforms).length === 0) {
    transforms = syncModuleTransforms;
    syncParsers.add(syncParser);
    return syncParser;
  }


  // we can fold syncModuleTransforms into moduleTransforms because
  // async supports sync, but not vice-versa
  transforms = ({
    ...syncModuleTransforms,
    ...moduleTransforms,
  });


  return asyncParser;
};

export const isSyncParser = (parser) => syncParsers.has(parser);

/**
 * @overload
 * @param {LanguageForExtension} languageForExtension
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case, the type of a module
 * is implied by package.json and should not be inferred from its extension.
 * @param {ParserForLanguage} parserForLanguage
 * @param {undefined} [moduleTransforms]
 * @param {SyncModuleTransforms} [syncModuleTransforms]
 * @returns {ParseFn}
 */

/**
 * @overload
 * @param {LanguageForExtension} languageForExtension
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case, the type of a module
 * is implied by package.json and should not be inferred from its extension.
 * @param {ParserForLanguage} parserForLanguage
 * @param {ModuleTransforms|SyncModuleTransforms} [moduleTransforms]
 * @param {SyncModuleTransforms} [syncModuleTransforms]
 * @returns {ParseFnAsync}
 */

/**
 * @param {LanguageForExtension} languageForExtension
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case, the type of a module
 * is implied by package.json and should not be inferred from its extension.
 * @param {ParserForLanguage} parserForLanguage
 * @param {ModuleTransforms|SyncModuleTransforms} [moduleTransforms]
 * @param {SyncModuleTransforms} [syncModuleTransforms]
 * @returns {ParseFnAsync|ParseFn}
 */
export const mapParsers = (
  languageForExtension,
  languageForModuleSpecifier,
  parserForLanguage,
  moduleTransforms = {},
  syncModuleTransforms = {},
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
    syncModuleTransforms,
  );
};
