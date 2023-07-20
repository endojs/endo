// @ts-check

import { StaticModuleRecord } from '@endo/static-module-record';

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
  const record = new StaticModuleRecord(source, {
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
