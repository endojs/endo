/* Provides language support for importing JSON modules. */

// @ts-check

import { parseLocatedJson } from './json.js';

/**
 * TypeScript cannot be relied upon to deal with the nuances of Readonly, so we
 * borrow the pass-through type definition of harden here.
 *
 * @type {import('ses').Harden}
 */
const freeze = Object.freeze;

const textDecoder = new TextDecoder();

/** @type {import('./types.js').ParseFn} */
export const parseJson = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);
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

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseJson,
  heuristicImports: false,
};
