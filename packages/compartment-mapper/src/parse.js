// @ts-check
/// <reference types="ses" />

import { parseExtension } from './extension.js';
import * as json from './json.js';

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
export const parseMjs = (source, _specifier, location, _packageLocation) => {
  return {
    parser: 'mjs',
    record: new StaticModuleRecord(source, location),
  };
};

/** @type {ParseFn} */
export const parseJson = (source, _specifier, location, _packageLocation) => {
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
    record: freeze({ imports, execute }),
  };
};

/**
 * @param {Object<string, ParseFn>} extensions - maps a file extension to the
 * corresponding parse function.
 * @param {Object<string, string>} types - In a rare case, the type of a module
 * is implied by package.json and should not be inferred from its extension.
 * @returns {ParseFn}
 */
export const makeExtensionParser = (extensions, types) => {
  return (source, specifier, location, packageLocation) => {
    let extension;
    if (Object(types) === types && has(types, specifier)) {
      extension = types[specifier];
    } else {
      extension = parseExtension(location);
    }
    if (!has(extensions, extension)) {
      throw new Error(
        `Cannot parse module ${specifier} at ${location}, no parser configured for that extension`,
      );
    }
    const parse = extensions[extension];
    return parse(source, specifier, location, packageLocation);
  };
};

/** @type {Record<string, ParseFn>} */
export const parserForLanguage = {
  mjs: parseMjs,
  json: parseJson,
};

/**
 * @param {Object<string, ParserDescriptor>} parsers
 * @param {Object<string, string>} types - In a rare case, the type of a module
 * is implied by package.json and should not be inferred from its extension.
 * @returns {ParseFn}
 */
export const mapParsers = (parsers, types) => {
  const parserForExtension = [];
  const errors = [];
  for (const [extension, language] of entries(parsers)) {
    if (has(parserForLanguage, language)) {
      const parser = parserForLanguage[language];
      parserForExtension.push([extension, parser]);
    } else {
      errors.push(`${q(language)} for extension ${q(extension)}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`No parser available for language: ${errors.join(', ')}`);
  }
  return makeExtensionParser(fromEntries(parserForExtension), types);
};
