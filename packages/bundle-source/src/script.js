// @ts-check
/* global process */

import crypto from 'crypto';
import path from 'path';
import url from 'url';
import fs from 'fs';
import os from 'os';

import { makeFunctor } from '@endo/compartment-mapper/functor.js';
import { makeReadPowers } from '@endo/compartment-mapper/node-powers.js';

import { makeBundlingKit } from './endo.js';
import { makeBundleProfiler } from './profile.js';

/** @import {BundleScriptModuleFormat, BundleScriptOptions, BundlingKitIO, SharedPowers} from './types.js' */

const readPowers = makeReadPowers({ fs, url, crypto });

/**
 * @param {string} startFilename
 * @param {BundleScriptModuleFormat} moduleFormat
 * @param {BundleScriptOptions} [options]
 * @param {SharedPowers} [grantedPowers]
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
    moduleFormat,
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
            dev,
            profiler,
          },
        );
      } finally {
        endMakeBundlingKit();
      }
    })();
    const parserForLanguageForFunctor = parserForLanguage;

    const endMakeFunctor = profiler.startSpan('bundleSource.makeFunctor');
    let source;
    try {
      source = await makeFunctor(powers, entry.href, {
        // For backward-compatibility, the nestedEvaluate and getExport formats
        // may implicitly include devDependencies of the entry module's package,
        // but this courtesy will not be extended to any future bundle formats.
        dev:
          dev ||
          moduleFormat === 'nestedEvaluate' ||
          moduleFormat === 'getExport',
        conditions: new Set(conditions),
        commonDependencies,
        parserForLanguage: parserForLanguageForFunctor,
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
    } finally {
      endMakeFunctor();
    }

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

    const endSourceMapJobs = profiler.startSpan('bundleSource.sourceMapJobs');
    try {
      await Promise.all(sourceMapJobs);
    } finally {
      endSourceMapJobs();
    }

    return harden({
      moduleFormat,
      source,
      // TODO
      sourceMap: '',
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
