// @ts-check

/**
 * TypeScript cannot be relied upon to deal with the nuances of Readonly, so we
 * borrow the pass-through type definition of harden here.
 *
 * @type {import('ses').Harden}
 */
const freeze = Object.freeze;

const textDecoder = new TextDecoder();

/** @type {import('./types.js').ParseFn} */
export const parseText = async (
  bytes,
  _specifier,
  _location,
  _packageLocation,
) => {
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
};
