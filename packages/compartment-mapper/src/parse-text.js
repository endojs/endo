/* Provides language-behaviors for importing a module as a document that
 * exports itself as a string based on a UTF-8 interpretation of the module's
 * text.
 */

// @ts-check

/** @import {ParseFn} from './types.js' */

/**
 * TypeScript cannot be relied upon to deal with the nuances of Readonly, so we
 * borrow the pass-through type definition of harden here.
 *
 * @type {import('ses').Harden}
 */
const freeze = Object.freeze;

const textDecoder = new TextDecoder();

/** @type {ParseFn} */
export const parseText = (bytes, _specifier, _location, _packageLocation) => {
  const text = textDecoder.decode(bytes);

  /** @type {Array<string>} */
  const imports = freeze([]);

  /**
   * @param {object} exports
   */
  const execute = exports => {
    exports.default = text;
  };

  return {
    parser: 'text',
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
  parse: parseText,
  heuristicImports: false,
  synchronous: true,
};
