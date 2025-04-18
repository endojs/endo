/**
 * Provides language behavior for analyzing, pre-compiling, and storing ESM
 * modules for an archive.
 *
 * @module
 */

/** @import {ParseFn} from './types.js' */

import { ModuleSource } from '@endo/module-source';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** @type {ParseFn} */
export const parseArchiveMjs = (
  bytes,
  _specifier,
  sourceUrl,
  _packageLocation,
  options = {},
) => {
  const { sourceMap, sourceMapHook } = options;
  const source = textDecoder.decode(bytes);
  const record = new ModuleSource(source, {
    sourceMap,
    sourceMapUrl: sourceUrl,
    sourceMapHook,
  });
  const pre = textEncoder.encode(JSON.stringify(record));
  return {
    parser: 'pre-mjs-json',
    bytes: pre,
    record,
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseArchiveMjs,
  heuristicImports: false,
  synchronous: true,
};
