// @ts-check
/* global process */

import crypto from 'crypto';
import path from 'path';
import url from 'url';
import fs from 'fs';
import os from 'os';

import { mapNodeModules } from '@endo/compartment-mapper/node-modules.js';
import { makeAndHashArchiveFromMap } from '@endo/compartment-mapper/archive-lite.js';
import { encodeBase64 } from '@endo/base64';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

import { makeBundlingKit } from './endo.js';
import { makeBundleProfiler } from './profile.js';

/** @import {BundleZipBase64Options, BundlingKitIO, SharedPowers} from './types.js' */

const readPowers = makeReadPowers({ fs, url, crypto });
const DEFAULT_READ_CACHE_MAX_BYTES = 64 * 1024 * 1024;
const configuredReadCacheMaxBytes = Number.parseInt(
  process.env.ENDO_BUNDLE_SOURCE_READ_CACHE_MAX_BYTES ||
    `${DEFAULT_READ_CACHE_MAX_BYTES}`,
  10,
);
const readCacheMaxBytes =
  Number.isFinite(configuredReadCacheMaxBytes) && configuredReadCacheMaxBytes >= 0
    ? configuredReadCacheMaxBytes
    : DEFAULT_READ_CACHE_MAX_BYTES;
/** @type {Map<string, Uint8Array | undefined>} */
const cachedReads = new Map();
/** @type {Map<string, Promise<Uint8Array | undefined>>} */
const pendingReads = new Map();
let cachedReadBytes = 0;

/**
 * @param {string} location
 * @param {Uint8Array | undefined} bytes
 */
const cacheReadValue = (location, bytes) => {
  const prior = cachedReads.get(location);
  if (prior !== undefined) {
    cachedReadBytes -= prior.length;
  }

  cachedReads.set(location, bytes);
  if (bytes !== undefined) {
    cachedReadBytes += bytes.length;
  }

  while (cachedReadBytes > readCacheMaxBytes && cachedReads.size > 0) {
    const oldestKey = cachedReads.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    const value = cachedReads.get(oldestKey);
    cachedReads.delete(oldestKey);
    if (value !== undefined) {
      cachedReadBytes -= value.length;
    }
  }
};

/**
 * @param {string} startFilename
 * @param {BundleZipBase64Options} [options]
 * @param {SharedPowers} [grantedPowers]
 */
export async function bundleZipBase64(
  startFilename,
  options = {},
  grantedPowers = {},
) {
  const {
    dev = false,
    cacheSourceMaps = false,
    noTransforms = false,
    elideComments = false,
    conditions = [],
    commonDependencies,
    importHook,
    profile,
  } = options;
  const powers = /** @type {typeof readPowers & SharedPowers} */ ({
    ...readPowers,
    ...grantedPowers,
  });
  const {
    computeSha512,
    pathResolve = path.resolve,
    userInfo = os.userInfo,
    env = process.env,
    platform = process.platform,
  } = powers;

  const entry = url.pathToFileURL(pathResolve(startFilename));
  const profiler = makeBundleProfiler({
    moduleFormat: 'endoZipBase64',
    startFilename,
    env,
    profile,
  });

  let phaseStatus = 'ok';
  let phaseError;
  try {
    const maybeRead = async location => {
      if (readCacheMaxBytes === 0) {
        return powers.maybeRead(location);
      }
      const hit = cachedReads.has(location);
      if (hit) {
        const endCacheHit = profiler.startSpan('bundleSource.readCache.hit');
        try {
          return cachedReads.get(location);
        } finally {
          endCacheHit();
        }
      }

      let pending = pendingReads.get(location);
      if (pending !== undefined) {
        const endPending = profiler.startSpan('bundleSource.readCache.pending');
        try {
          return pending;
        } finally {
          endPending();
        }
      }

      const endCacheMiss = profiler.startSpan('bundleSource.readCache.miss');
      pending = powers.maybeRead(location).then(bytes => {
        cacheReadValue(location, bytes);
        pendingReads.delete(location);
        return bytes;
      }, error => {
        pendingReads.delete(location);
        throw error;
      });
      pendingReads.set(location, pending);
      try {
        return await pending;
      } finally {
        endCacheMiss({
          cacheEntries: cachedReads.size,
          cacheBytes: cachedReadBytes,
        });
      }
    };

    const cachedPowers = /** @type {typeof powers} */ ({
      ...powers,
      maybeRead,
    });

    const endMakeBundlingKit = profiler.startSpan('bundleSource.makeBundlingKit');
    const {
      sourceMapHook,
      sourceMapJobs,
      moduleTransforms,
      parserForLanguage,
      workspaceLanguageForExtension,
      workspaceCommonjsLanguageForExtension,
      workspaceModuleLanguageForExtension,
    } = (() => {
      try {
        return makeBundlingKit(
          /** @type {BundlingKitIO} */ ({
            pathResolve,
            userInfo,
            platform,
            env,
            computeSha512,
          }),
          {
            cacheSourceMaps,
            noTransforms,
            elideComments,
            commonDependencies,
            profiler,
          },
        );
      } finally {
        endMakeBundlingKit();
      }
    })();
    const importHookForArchive = importHook;

    const endMapNodeModules = profiler.startSpan('bundleSource.mapNodeModules');
    let compartmentMap;
    try {
      compartmentMap = await mapNodeModules(cachedPowers, entry.href, {
        dev,
        conditions: new Set(conditions),
        commonDependencies,
        profileStartSpan: profiler.startSpan,
        workspaceLanguageForExtension,
        workspaceCommonjsLanguageForExtension,
        workspaceModuleLanguageForExtension,
      });
    } finally {
      endMapNodeModules();
    }

    const endMakeArchive = profiler.startSpan('bundleSource.makeAndHashArchiveFromMap');
    let bytes;
    let sha512;
    try {
      ({ bytes, sha512 } = await makeAndHashArchiveFromMap(
        cachedPowers,
        compartmentMap,
        {
          parserForLanguage,
          moduleTransforms,
          sourceMapHook,
          importHook: importHookForArchive,
          profileStartSpan: profiler.startSpan,
        },
      ));
    } finally {
      endMakeArchive();
    }
    assert(sha512);

    const endSourceMapJobs = profiler.startSpan('bundleSource.sourceMapJobs');
    try {
      await Promise.all(sourceMapJobs);
    } finally {
      endSourceMapJobs();
    }

    const endEncodeBase64 = profiler.startSpan('bundleSource.encodeBase64');
    let endoZipBase64;
    try {
      endoZipBase64 = encodeBase64(bytes);
    } finally {
      endEncodeBase64({
        inputBytes: bytes.length,
        outputBytes: endoZipBase64?.length,
      });
    }
    return harden({
      moduleFormat: /** @type {const} */ ('endoZipBase64'),
      endoZipBase64,
      endoZipBase64Sha512: sha512,
    });
  } catch (error) {
    phaseStatus = 'error';
    phaseError =
      error instanceof Error ? `${error.name}: ${error.message}` : `${error}`;
    throw error;
  } finally {
    await profiler.flush(
      phaseError
        ? { status: phaseStatus, error: phaseError }
        : { status: phaseStatus },
    );
  }
}
