/* Provides language behavior (a parser) for importing ESM. */

// @ts-check

import { transform } from '@swc/wasm-typescript';
import { ModuleSource } from '@endo/module-source';

const textDecoder = new TextDecoder();

/** @type {import('./types.js').ParseFn} */
export const parseMts = async (
  bytes,
  _specifier,
  sourceUrl,
  _packageLocation,
  options = {},
) => {
  const { sourceMap, sourceMapHook } = options;
  const source = textDecoder.decode(bytes);
  const transformed = await transform(source, {
    filename: sourceUrl,
    mode: 'strip-only',
    module: true,
  });
  const record = new ModuleSource(transformed.code, {
    sourceUrl,
    // XXX use transformed source map?
    sourceMap,
    sourceMapUrl: sourceUrl,
    sourceMapHook,
  });
  return {
    parser: 'mts',
    bytes,
    record,
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseMts,
  heuristicImports: false,
};
