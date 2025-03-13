/** @module Provides language support for importing JSON modules. */

/**
 * @import {Harden} from 'ses'
 * @import {ParseFn, ParserImplementation} from './types.js'
 */

import { parseLocatedJson } from './json.js';

/**
 * TypeScript cannot be relied upon to deal with the nuances of Readonly, so we
 * borrow the pass-through type definition of harden here.
 *
 * @type {Harden}
 */
const freeze = Object.freeze;

const textDecoder = new TextDecoder();

/** @type {ParseFn} */
export const parseJson = (bytes, _specifier, location, _packageLocation) => {
  const source = textDecoder.decode(bytes);
  /** @type {Array<string>} */
  const imports = freeze([]);

  /**
   * @param {object} exports
   */
  const execute = exports => {
    exports.default = parseLocatedJson(source, location);
  };
  return {
    parser: 'json',
    bytes,
    record: freeze({
      imports,
      exports: freeze(['default']),
      execute: freeze(execute),
    }),
  };
};

/** @type {ParserImplementation} */
export default {
  parse: parseJson,
  heuristicImports: false,
  synchronous: true,
};
