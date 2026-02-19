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
      compartmentMap = await mapNodeModules(powers, entry.href, {
        dev,
        conditions: new Set(conditions),
        commonDependencies,
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
        powers,
        compartmentMap,
        {
          parserForLanguage,
          moduleTransforms,
          sourceMapHook,
          importHook: importHookForArchive,
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
      endEncodeBase64();
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
