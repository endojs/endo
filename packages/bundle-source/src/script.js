// @ts-nocheck
/* global process */

import crypto from 'crypto';
import path from 'path';
import url from 'url';
import fs from 'fs';
import os from 'os';

import { makeFunctor } from '@endo/compartment-mapper/functor.js';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

import { makeBundlingKit } from './endo.js';

const readPowers = makeReadPowers({ fs, url, crypto });

/**
 * @param {string} startFilename
 * @param {'endoScript' | 'nestedEvaluate' | 'getExport'} moduleFormat
 * @param {object} [options]
 * @param {boolean} [options.dev]
 * @param {boolean} [options.cacheSourceMaps]
 * @param {boolean} [options.noTransforms]
 * @param {boolean} [options.elideComments]
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
  moduleFormat,
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

  const {
    sourceMapHook,
    sourceMapJobs,
    moduleTransforms,
    parserForLanguage,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
  } = makeBundlingKit(
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
      elideComments,
      commonDependencies,
      dev,
    },
  );

  let source = await makeFunctor(powers, entry, {
    // For backward-compatibility, the nestedEvaluate and getExport formats
    // may implicitly include devDependencies of the entry module's package,
    // but this courtesy will not be extended to any future bundle formats.
    dev:
      dev || moduleFormat === 'nestedEvaluate' || moduleFormat === 'getExport',
    conditions,
    commonDependencies,
    parserForLanguage,
    workspaceLanguageForExtension,
    workspaceCommonjsLanguageForExtension,
    workspaceModuleLanguageForExtension,
    moduleTransforms,
    sourceMapHook,
    useEvaluate: moduleFormat === 'nestedEvaluate',
    sourceUrlPrefix: '/bundled-source/.../',
    // For backward-compatibility, the nestedEvaluate and getExport formats
    // also may implicitly reach for the require function in lexical context
    // to import CommonJS modules, as if they were CommonJS modules themselves.
    // This default will not extend to any future bundle formats, which will
    // be obliged to choose inject an exit import hook explicitly.
    format:
      moduleFormat === 'nestedEvaluate' || moduleFormat === 'getExport'
        ? 'cjs'
        : undefined,
  });

  if (moduleFormat === 'endoScript') {
    source = `(${source})()`;
  }
  if (moduleFormat === 'nestedEvaluate') {
    source = `\
(sourceUrlPrefix) => (${source})({
  sourceUrlPrefix,
  evaluate: typeof nestedEvaluate === 'function' ? nestedEvaluate : undefined,
  require: typeof require === 'function' ? require : undefined,
})
`;
  }

  await Promise.all(sourceMapJobs);

  return harden({
    moduleFormat,
    source,
    // TODO
    sourceMap: '',
  });
}
