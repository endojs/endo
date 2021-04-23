// @ts-check
/// <reference types="ses" />

import { StaticModuleRecord } from '@endo/static-module-record';
import { analyzeCommonJS } from '@endo/cjs-module-analyzer';
import { encodeSyrup, decodeSyrup } from '@endo/syrup';
import { parseExtension } from './extension.js';
import * as json from './json.js';

const textDecoder = new TextDecoder();

const { entries, freeze, fromEntries } = Object;

/**
 * @template {string | number} Key
 * @template Value
 * @param {Record<Key, Value>} object
 * @param {Key} key
 * @returns {boolean}
 */
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// q, as in quote, for enquoting strings in error messages.
const q = JSON.stringify;

// TODO: parsers should accept bytes and perhaps even content-type for
// verification.

/** @type {ParseFn} */
export const parseMjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);
  const record = new StaticModuleRecord(source, location);
  const pre = encodeSyrup(record);
  return {
    parser: 'pre',
    bytes: pre,
    record,
  };
};

/** @type {ParseFn} */
export const parsePre = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const record = decodeSyrup(bytes, { name: location });
  return {
    parser: 'pre',
    bytes,
    record,
  };
};

/** @type {ParseFn} */
export const parseJson = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);
  /** @type {Readonly<Array<string>>} */
  const imports = freeze([]);

  /**
   * @param {Object} exports
   */
  const execute = exports => {
    exports.default = json.parse(source, location);
  };
  return {
    parser: 'json',
    bytes,
    record: freeze({ imports, exports: freeze(['default']), execute }),
  };
};

/** @type {ParseFn} */
export const parseCjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);

  if (typeof location !== 'string') {
    throw new TypeError(
      `Cannot create CommonJS static module record, module location must be a string, got ${location}`,
    );
  }

  const { requires: imports, exports, reexports } = analyzeCommonJS(
    source,
    location,
  );

  /**
   * @param {Object} moduleExports
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = async (moduleExports, compartment, resolvedImports) => {
    const functor = compartment.evaluate(
      `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${location}`,
    );

    const module = freeze({
      get exports() {
        return moduleExports;
      },
      set exports(value) {
        moduleExports.default = value;
      },
    });

    const require = freeze(importSpecifier => {
      const namespace = compartment.importNow(resolvedImports[importSpecifier]);
      if (namespace.default !== undefined) {
        return namespace.default;
      }
      return namespace;
    });

    functor(
      require,
      moduleExports,
      module,
      location, // __filename
      new URL('./', location).toString(), // __dirname
    );
  };

  return {
    parser: 'cjs',
    bytes,
    record: freeze({ imports, exports, reexports, execute }),
  };
};

/** @type {Record<string, ParseFn>} */
export const parserForLanguage = {
  mjs: parseMjs,
  cjs: parseCjs,
  pre: parsePre,
  json: parseJson,
};

/**
 * @param {Record<string, string>} languageForExtension - maps a file extension
 * to the corresponding language.
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case,
 * the type of a module is implied by package.json and should not be inferred
 * from its extension.
 * @param {ModuleTransforms} transforms
 * @returns {ParseFn}
 */
export const makeExtensionParser = (
  languageForExtension,
  languageForModuleSpecifier,
  transforms,
) => {
  return async (bytes, specifier, location, packageLocation) => {
    let language;
    if (
      Object(languageForModuleSpecifier) === languageForModuleSpecifier &&
      has(languageForModuleSpecifier, specifier)
    ) {
      language = languageForModuleSpecifier[specifier];
    } else {
      const extension = parseExtension(location);
      if (!has(languageForExtension, extension)) {
        throw new Error(
          `Cannot parse module ${specifier} at ${location}, no parser configured for extension ${extension}`,
        );
      }
      language = languageForExtension[extension];
    }

    if (has(transforms, language)) {
      ({ bytes, parser: language } = await transforms[language](
        bytes,
        specifier,
        location,
        packageLocation,
      ));
    }

    if (!has(parserForLanguage, language)) {
      throw new Error(
        `Cannot parse module ${specifier} at ${location}, no parser configured for the language ${language}`,
      );
    }
    const parse = parserForLanguage[language];
    return parse(bytes, specifier, location, packageLocation);
  };
};

/**
 * @param {Record<string, ParserDescriptor>} parsers
 * @param {Record<string, string>} languageForModuleSpecifier - In a rare case, the type of a module
 * is implied by package.json and should not be inferred from its extension.
 * @param {ModuleTransforms} transforms
 * @returns {ParseFn}
 */
export const mapParsers = (
  parsers,
  languageForModuleSpecifier,
  transforms = {},
) => {
  const languageForExtension = [];
  const errors = [];
  for (const [extension, language] of entries(parsers)) {
    if (has(parserForLanguage, language)) {
      languageForExtension.push([extension, language]);
    } else {
      errors.push(`${q(language)} for extension ${q(extension)}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`No parser available for language: ${errors.join(', ')}`);
  }
  return makeExtensionParser(
    fromEntries(languageForExtension),
    languageForModuleSpecifier,
    transforms,
  );
};
