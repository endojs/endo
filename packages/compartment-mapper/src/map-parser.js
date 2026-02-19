/**
 * Exports {@link makeMapParsers}, which creates a function which matches a
 * module to a parser based on reasons.
 *
 * @module
 */

/**
 * @import {
 *   LanguageForExtension,
 *   MakeMapParsersOptions,
 *   MapParsersFn,
 *   ModuleTransform,
 *   ParseFn,
 *   AsyncParseFn,
 *   ParseResult,
 *   ParserForLanguage,
 *   SyncParserForLanguage,
 *   SyncModuleTransform,
 *   SyncModuleTransforms,
 *   ParserGeneratorConfig
 * } from './types.js';
 */

import { syncTrampoline, asyncTrampoline } from '@endo/trampoline';
import { parseExtension } from './extension.js';

const { assign, create, entries, fromEntries, keys, hasOwnProperty, values } =
  Object;
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
 * Resolves the module language from its specifier and location.
 *
 * Shared logic between sync and async generators.
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
  if (has(languageForExtension, extension)) {
    return languageForExtension[extension];
  }
  return extension;
};

/**
 * The single shared generator that drives the module parsing pipeline:
 * resolve language, apply any matching transform, then delegate to the
 * appropriate parser.
 *
 * Both the sync and async wrappers feed this exact function to their
 * respective trampolines from {@link @endo/trampoline} — that is the entire
 * point of using trampolines, and the reason this function takes its
 * configuration as a parameter rather than closing over it.
 *
 * Yield/return types are intentionally permissive (async) so
 * `asyncTrampoline` can `await` yielded values; `syncTrampoline` passes them
 * through unchanged, which is safe as long as no async transforms or parsers
 * are wired up for the sync path (the caller enforces this via the outer
 * narrowing in {@link makeMapParsers}, plus a runtime thenable guard).
 *
 * @param {ParserGeneratorConfig} config
 * @param {Uint8Array} bytes
 * @param {string} specifier
 * @param {string} location
 * @param {string} packageLocation
 * @param {*} options
 * @returns {Generator<ReturnType<ModuleTransform> | ReturnType<SyncModuleTransform>, ParseResult | Promise<ParseResult>, any>}
 */
function* getParserGenerator(
  config,
  bytes,
  specifier,
  location,
  packageLocation,
  options,
) {
  const {
    languageForExtension,
    languageForModuleSpecifier,
    parserForLanguage,
    transforms,
  } = config;

  const { profileStartSpan = undefined } = options || {};
  let language = '';
  const extension = parseExtension(location);
  const endLanguageSelect = profileStartSpan?.(
    'compartmentMapper.parseModule.selectLanguage',
    { specifier, location, extension },
  );
  try {
    language = resolveLanguage(
      specifier,
      location,
      languageForExtension,
      languageForModuleSpecifier,
    );
  } finally {
    endLanguageSelect?.({ selectedLanguage: language });
  }

  /** @type {string | undefined} */
  let sourceMap;

  if (has(transforms, language)) {
    const endTransform = profileStartSpan?.(
      'compartmentMapper.parseModule.transform',
      { specifier, location, language },
    );
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
      endTransform?.({
        parser: language,
        outputBytes: bytes.length,
        hasSourceMap: sourceMap !== undefined,
      });
    } catch (err) {
      endTransform?.();
      throw Error(
        `Error transforming ${q(language)} source in ${q(location)}: ${/** @type {Error} */ (err).message}`,
        { cause: err },
      );
    }
  }
  const endParserLookup = profileStartSpan?.(
    'compartmentMapper.parseModule.lookupParser',
    { specifier, location, language },
  );
  if (!has(parserForLanguage, language)) {
    endParserLookup?.();
    throw Error(
      `Cannot parse module ${specifier} at ${location}, no parser configured for the language ${language}`,
    );
  }
  const { parse } = parserForLanguage[language];
  endParserLookup?.();

  const endParserExecute = profileStartSpan?.(
    'compartmentMapper.parseModule.executeParser',
    {
      specifier,
      location,
      language,
      inputBytes: bytes.length,
    },
  );
  try {
    return parse(bytes, specifier, location, packageLocation, {
      sourceMap,
      ...options,
    });
  } finally {
    endParserExecute?.({ parser: language });
  }
}

/**
 * Type guard that narrows a `ParseResult | Promise<ParseResult>` to
 * `Promise<ParseResult>` by checking that the result has a `then` method.
 *
 * @param {ParseResult | Promise<ParseResult>} result
 * @returns {result is Promise<ParseResult>}
 */
const isAsyncParseResult = result =>
  'then' in result && typeof result.then === 'function';

/**
 * Produces a sync `ParseFn` for use when all parsers and transforms are
 * synchronous.
 *
 * The `ParseFn` parses the content of a module according to the corresponding
 * module language, given the extension of the module specifier and the
 * configuration of the containing compartment. We do not yet support import
 * assertions and we do not have a mechanism for validating the MIME type of the
 * module content against the language implied by the extension or file name.
 *
 * @param {Record<string, string>} languageForExtension
 * @param {Record<string, string>} languageForModuleSpecifier
 * @param {SyncParserForLanguage} parserForLanguage
 * @param {SyncModuleTransforms} transforms
 * @returns {ParseFn}
 */
const makeSyncParserForExtension = (
  languageForExtension,
  languageForModuleSpecifier,
  parserForLanguage,
  transforms,
) => {
  /** @type {ParserGeneratorConfig} */
  const config = {
    languageForExtension,
    languageForModuleSpecifier,
    parserForLanguage,
    transforms,
  };

  /** @type {ParseFn} */
  const syncParser = (bytes, specifier, location, packageLocation, options) => {
    const result = syncTrampoline(
      getParserGenerator,
      config,
      bytes,
      specifier,
      location,
      packageLocation,
      options,
    );
    if (isAsyncParseResult(result)) {
      throw new TypeError(
        'Sync parser cannot return a Thenable; ensure parser is actually synchronous',
      );
    }
    return result;
  };
  syncParser.isSyncParser = true;
  return syncParser;
};

/**
 * Produces an async `AsyncParseFn` for use when any parser or transform may
 * be asynchronous.
 *
 * The `AsyncParseFn` parses the content of a module according to the corresponding
 * module language, given the extension of the module specifier and the
 * configuration of the containing compartment. We do not yet support import
 * assertions and we do not have a mechanism for validating the MIME type of the
 * module content against the language implied by the extension or file name.
 *
 * @param {Record<string, string>} languageForExtension
 * @param {Record<string, string>} languageForModuleSpecifier
 * @param {ParserForLanguage} parserForLanguage
 * @param {Record<string, ModuleTransform>} moduleTransforms
 * @param {Record<string, SyncModuleTransform>} syncModuleTransforms
 * @returns {AsyncParseFn}
 */
const makeAsyncParserForExtension = (
  languageForExtension,
  languageForModuleSpecifier,
  parserForLanguage,
  moduleTransforms,
  syncModuleTransforms,
) => {
  /** @type {ParserGeneratorConfig} */
  const config = {
    languageForExtension,
    languageForModuleSpecifier,
    parserForLanguage,
    transforms: {
      ...syncModuleTransforms,
      ...moduleTransforms,
    },
  };

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
      config,
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
  return assign(create(null), fromEntries(languageForExtensionEntries));
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
      return makeSyncParserForExtension(
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
    return makeAsyncParserForExtension(
      validExtensions,
      languageForModuleSpecifier,
      parserForLanguage,
      moduleTransforms || {},
      syncModuleTransforms || {},
    );
  };
};
