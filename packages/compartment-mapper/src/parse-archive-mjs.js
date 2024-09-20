/* Provides language behavior for analyzing, pre-compiling, and storing ESM
 * modules for an archive.
 */
// @ts-check

import { ModuleSource } from '@endo/module-source';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** @type {import('./types.js').ParseFn} */
export const parseArchiveMjs = (
  bytes,
  specifier,
  sourceUrl,
  packageLocation,
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
