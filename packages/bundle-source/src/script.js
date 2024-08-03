// @ts-nocheck
/* global process */

import crypto from 'crypto';
import path from 'path';
import url from 'url';
import fs from 'fs';
import os from 'os';

import { makeBundle } from '@endo/compartment-mapper/bundle.js';
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
export async function bundleScript(
  startFilename,
  options = {},
  grantedPowers = {},
) {
  const {
    dev = false,
    cacheSourceMaps = false,
    noTransforms = false,
    conditions = [],
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

  const source = await makeBundle(powers, entry, {
    dev,
    conditions,
    commonDependencies,
    parserForLanguage,
    moduleTransforms,
    sourceMapHook,
  });

  await Promise.all(sourceMapJobs);

  return harden({
    moduleFormat: /** @type {const} */ ('endoScript'),
    source,
    // TODO sourceMap
  });
}
