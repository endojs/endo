/** @module Provides language behavior (a parser) for importing ESM. */

/** @import {ParseFn} from './types.js' */

import { ModuleSource } from '@endo/module-source';

const textDecoder = new TextDecoder();

/** @type {ParseFn} */
export const parseMjs = (
  bytes,
  _specifier,
  sourceUrl,
  _packageLocation,
  options = {},
) => {
  const { sourceMap, sourceMapHook, archiveOnly = false } = options;
  const source = textDecoder.decode(bytes);
  const record = new ModuleSource(source, {
    sourceUrl: archiveOnly ? undefined : sourceUrl,
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
  synchronous: true,
};
