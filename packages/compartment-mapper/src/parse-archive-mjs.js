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
/** @type {Map<string, Map<string, Map<string | undefined, ReturnType<ParseFn>>>>} */
const parseArchiveMjsCache = new Map();
const MAX_PARSE_ARCHIVE_MJS_CACHE_ENTRIES = 20_000;
let parseArchiveMjsCacheEntries = 0;

/**
 * @param {string | object | undefined} sourceMap
 * @returns {string | undefined}
 */
const getSourceMapCacheKey = sourceMap => {
  if (sourceMap === undefined) {
    return undefined;
  }
  if (typeof sourceMap === 'string') {
    return sourceMap;
  }
  return JSON.stringify(sourceMap);
};

const evictOldestParseArchiveMjsLocation = () => {
  const oldest = parseArchiveMjsCache.entries().next().value;
  if (oldest === undefined) {
    return;
  }
  const [sourceUrl, bySource] = oldest;
  let evictedEntries = 0;
  for (const bySourceMap of bySource.values()) {
    evictedEntries += bySourceMap.size;
  }
  parseArchiveMjsCache.delete(sourceUrl);
  parseArchiveMjsCacheEntries -= evictedEntries;
};

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
  const sourceMapKey = getSourceMapCacheKey(sourceMap);
  if (canUseCache) {
    const byLocation = parseArchiveMjsCache.get(sourceUrl);
    const cached = byLocation?.get(source)?.get(sourceMapKey);
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
    let bySource = byLocation.get(source);
    if (bySource === undefined) {
      bySource = new Map();
      byLocation.set(source, bySource);
    }
    if (!bySource.has(sourceMapKey)) {
      bySource.set(sourceMapKey, result);
      parseArchiveMjsCacheEntries += 1;
      if (parseArchiveMjsCacheEntries > MAX_PARSE_ARCHIVE_MJS_CACHE_ENTRIES) {
        evictOldestParseArchiveMjsLocation();
      }
    } else {
      bySource.set(sourceMapKey, result);
    }
  }
  return result;
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseArchiveMjs,
  heuristicImports: false,
  synchronous: true,
};
