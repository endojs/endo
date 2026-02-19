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
  const { sourceMap, sourceMapHook, profileStartSpan } = options;
  const source = textDecoder.decode(bytes);
  const endModuleSource = profileStartSpan?.(
    'compartmentMapper.parseArchiveMjs.moduleSource',
  );
  const record = new ModuleSource(source, {
    sourceMap,
    sourceMapUrl: sourceUrl,
    sourceMapHook,
    profileStartSpan,
  });
  endModuleSource?.();
  const endStringify = profileStartSpan?.(
    'compartmentMapper.parseArchiveMjs.stringifyRecord',
  );
  const pre = textEncoder.encode(JSON.stringify(record));
  endStringify?.();
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
