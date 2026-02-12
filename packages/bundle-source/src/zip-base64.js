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

  const {
    sourceMapHook,
    sourceMapJobs,
    moduleTransforms,
    parserForLanguage,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
  } = makeBundlingKit(
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
    },
  );
  const importHookForArchive = /** @type {any} */ (importHook);

  const compartmentMap = await mapNodeModules(powers, entry.href, {
    dev,
    conditions: new Set(conditions),
    commonDependencies,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
  });

  const { bytes, sha512 } = await makeAndHashArchiveFromMap(
    powers,
    compartmentMap,
    {
      parserForLanguage,
      moduleTransforms,
      sourceMapHook,
      importHook: importHookForArchive,
    },
  );
  assert(sha512);
  await Promise.all(sourceMapJobs);
  const endoZipBase64 = encodeBase64(bytes);
  return harden({
    moduleFormat: /** @type {const} */ ('endoZipBase64'),
    endoZipBase64,
    endoZipBase64Sha512: sha512,
  });
}
