/* Provides rudimentary support for treating an arbitrary file as a module that
 * exports the bytes of that file.
 */

// @ts-check

/**
 * TypeScript cannot be relied upon to deal with the nuances of Readonly, so we
 * borrow the pass-through type definition of harden here.
 *
 * @type {import('ses').Harden}
 */
const freeze = Object.freeze;

/** @type {import('./types.js').ParseFn} */
export const parseBytes = (bytes, _specifier, _location, _packageLocation) => {
  // Snapshot ArrayBuffer
  const buffer = new ArrayBuffer(bytes.length);
  const bytesView = new Uint8Array(buffer);
  bytesView.set(bytes);

  /** @type {Array<string>} */
  const imports = freeze([]);

  /**
   * @param {object} exports
   */
  const execute = exports => {
    exports.default = buffer;
  };

  return {
    parser: 'bytes',
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
  parse: parseBytes,
  heuristicImports: false,
  synchronous: true,
};
