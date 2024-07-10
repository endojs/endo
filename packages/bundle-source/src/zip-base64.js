// @ts-nocheck
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

const readPowers = makeReadPowers({ fs, url, crypto });

/**
 * @param {string} startFilename
 * @param {object} [options]
 * @param {boolean} [options.dev]
 * @param {boolean} [options.cacheSourceMaps]
 * @param {boolean} [options.noTransforms]
 * @param {Record<string, string>} [options.commonDependencies]
 * @param {object} [grantedPowers]
 * @param {(bytes: string | Uint8Array) => string} [grantedPowers.computeSha512]
 * @param {typeof import('path)['resolve']} [grantedPowers.pathResolve]
 * @param {typeof import('os')['userInfo']} [grantedPowers.userInfo]
 * @param {typeof process['env']} [grantedPowers.env]
 * @param {typeof process['platform']} [grantedPowers.platform]
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
    commonDependencies,
  } = options;
  const powers = { ...readPowers, ...grantedPowers };
  const {
    computeSha512,
    pathResolve = path.resolve,
    userInfo = os.userInfo,
    env = process.env,
    platform = process.platform,
  } = powers;

  const entry = url.pathToFileURL(pathResolve(startFilename));

  const { sourceMapHook, sourceMapJobs, moduleTransforms, parserForLanguage } =
    makeBundlingKit(
      {
        pathResolve,
        userInfo,
        platform,
        env,
        computeSha512,
      },
      {
        cacheSourceMaps,
        noTransforms,
        commonDependencies,
        dev,
      },
    );

  const compartmentMap = await mapNodeModules(powers, entry, {
    dev,
    commonDependencies,
  });

  const { bytes, sha512 } = await makeAndHashArchiveFromMap(
    powers,
    compartmentMap,
    {
      parserForLanguage,
      moduleTransforms,
      sourceMapHook,
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
