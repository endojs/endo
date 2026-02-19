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
/** @type {Map<string, Map<string, ReturnType<ParseFn>>>} */
const parseArchiveMjsCache = new Map();
const MAX_PARSE_ARCHIVE_MJS_CACHE_ENTRIES = 20_000;
let parseArchiveMjsCacheEntries = 0;

/** @type {ParseFn} */
export const parseArchiveMjs = (
  bytes,
  _specifier,
  sourceUrl,
  _packageLocation,
  options = {},
) => {
  const { sourceMap, sourceMapHook, profileStartSpan } = options;
  const canUseCache = sourceMapHook === undefined;
  const source = textDecoder.decode(bytes);
  const sourceMapKey =
    sourceMap === undefined
      ? ''
      : typeof sourceMap === 'string'
        ? sourceMap
        : JSON.stringify(sourceMap);
  const cacheKey = `${source}\n//# sourceMappingURL=${sourceMapKey}`;
  if (canUseCache) {
    const byLocation = parseArchiveMjsCache.get(sourceUrl);
    const cached = byLocation?.get(cacheKey);
    if (cached !== undefined) {
      profileStartSpan?.('compartmentMapper.parseArchiveMjs.cache.hit')?.();
      return cached;
    }
    profileStartSpan?.('compartmentMapper.parseArchiveMjs.cache.miss')?.();
  } else {
    profileStartSpan?.('compartmentMapper.parseArchiveMjs.cache.bypass')?.({
      hasSourceMap: sourceMap !== undefined,
      hasSourceMapHook: sourceMapHook !== undefined,
    });
  }
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
  const result = {
    parser: 'pre-mjs-json',
    bytes: pre,
    record,
  };
  if (canUseCache) {
    let byLocation = parseArchiveMjsCache.get(sourceUrl);
    if (byLocation === undefined) {
      byLocation = new Map();
      parseArchiveMjsCache.set(sourceUrl, byLocation);
    }
    if (!byLocation.has(cacheKey)) {
      parseArchiveMjsCacheEntries += 1;
      if (parseArchiveMjsCacheEntries > MAX_PARSE_ARCHIVE_MJS_CACHE_ENTRIES) {
        parseArchiveMjsCache.clear();
        parseArchiveMjsCacheEntries = 0;
        byLocation = new Map();
        parseArchiveMjsCache.set(sourceUrl, byLocation);
      }
    }
    byLocation.set(cacheKey, result);
  }
  return result;
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseArchiveMjs,
  heuristicImports: false,
  synchronous: true,
};
