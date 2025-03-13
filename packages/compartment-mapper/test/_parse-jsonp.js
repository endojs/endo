/** @module Provides joke language support for importing JSONP modules. */

/**
 * @import {ParseFn, ParserImplementation} from '../src/types.js'
 */

const textDecoder = new TextDecoder();

/** @type {ParseFn} */
export const parseJsonp = (bytes, _specifier, _location, _packageLocation) => {
  // Presumes that all JSONP module bytes are retrieved with ?callback=exports.
  const source = textDecoder.decode(bytes);
  const imports = harden([]);

  /**
   * @param {object} exports
   */
  const execute = exports => {
    const compartment = new Compartment({
      __options__: true,
      globals: harden({
        exports(value) {
          exports.default = value;
        },
      }),
    });
    compartment.evaluate(source);
  };
  return {
    parser: 'jsonp',
    bytes,
    record: harden({
      imports,
      exports: ['default'],
      execute,
    }),
  };
};

/** @type {ParserImplementation} */
export default {
  parse: parseJsonp,
  heuristicImports: false,
  synchronous: true,
};
