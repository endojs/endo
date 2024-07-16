/* Provides language behavior (a parser) for importing ESM. */

// @ts-check

import { ModuleSource } from '@endo/module-source';

const textDecoder = new TextDecoder();

/** @type {import('./types.js').ParseFn} */
export const parseMjs = async (
  bytes,
  _specifier,
  sourceUrl,
  _packageLocation,
  options = {},
) => {
  const { sourceMap, sourceMapHook } = options;
  const source = textDecoder.decode(bytes);
  const record = new ModuleSource(source, {
    sourceUrl,
    sourceMap,
    sourceMapUrl: sourceUrl,
    sourceMapHook,
  });
  return {
    parser: 'mjs',
    bytes,
    record,
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseMjs,
  heuristicImports: false,
};
