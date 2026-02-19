// @ts-check

import fs from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';

/** @import {BundleProfilingOptions} from './types.js' */

let nextTraceFileId = 0;

const truthy = new Set(['1', 'true', 'yes', 'on']);

/**
 * @param {string | undefined} value
 * @returns {boolean}
 */
const parseBoolean = value => {
  if (value === undefined) {
    return false;
  }
  return truthy.has(value.toLowerCase());
};

/**
 * @param {string} moduleFormat
 * @returns {'script' | 'zip'}
 */
const classifyModuleFormat = moduleFormat =>
  moduleFormat === 'endoZipBase64' ? 'zip' : 'script';

/**
 * @param {object} options
 * @param {string} options.moduleFormat
 * @param {string} options.startFilename
 * @param {number} [options.pid]
 * @param {Record<string, string | undefined>} [options.env]
 * @param {BundleProfilingOptions | undefined} [options.profile]
 */
export const makeBundleProfiler = ({
  moduleFormat,
  startFilename,
  pid = process.pid,
  env = process.env,
  profile = undefined,
}) => {
  const enabled =
    profile?.enabled !== undefined
      ? profile.enabled
      : parseBoolean(env.ENDO_BUNDLE_SOURCE_PROFILE);
  const logToStderr = parseBoolean(env.ENDO_BUNDLE_SOURCE_PROFILE_STDERR);

  if (!enabled) {
    const noop = () => {};
    return {
      enabled,
      startSpan: (_name, _args = undefined) => noop,
      async flush(_args = undefined) {},
    };
  }

  const traceFile =
    profile?.traceFile || env.ENDO_BUNDLE_SOURCE_PROFILE_FILE || undefined;
  const traceDir =
    profile?.traceDir ||
    env.ENDO_BUNDLE_SOURCE_PROFILE_DIR ||
    path.join(os.tmpdir(), 'endo-bundle-source-profiles');
  const phase = classifyModuleFormat(moduleFormat);

  const tracePath =
    traceFile ||
    path.join(
      traceDir,
      `bundle-source-${phase}-${pid}-${Date.now()}-${nextTraceFileId++}.trace.json`,
    );

  /** @type {Array<Record<string, unknown>>} */
  const traceEvents = [];
  const zeroMs = performance.now();

  /**
   * @param {number} ms
   * @returns {number}
   */
  const toMicros = ms => Math.round(ms * 1000);

  /**
   * @param {string} name
   * @param {Record<string, unknown> | undefined} args
   */
  const startSpan = (name, args = undefined) => {
    const startMs = performance.now() - zeroMs;
    return extraArgs => {
      const endMs = performance.now() - zeroMs;
      const payload = extraArgs ? { ...args, ...extraArgs } : args;
      traceEvents.push(
        payload
          ? {
              name,
              cat: 'bundle-source',
              ph: 'X',
              ts: toMicros(startMs),
              dur: toMicros(endMs - startMs),
              pid,
              tid: 0,
              args: payload,
            }
          : {
              name,
              cat: 'bundle-source',
              ph: 'X',
              ts: toMicros(startMs),
              dur: toMicros(endMs - startMs),
              pid,
              tid: 0,
            },
      );
    };
  };

  const bundleStart = startSpan('bundleSource.total', {
    moduleFormat,
    startFilename,
  });

  return {
    enabled,
    startSpan,
    /**
     * @param {Record<string, unknown> | undefined} [result]
     */
    async flush(result = undefined) {
      bundleStart(result);
      await fs.promises.mkdir(path.dirname(tracePath), { recursive: true });
      const trace = {
        traceEvents,
        displayTimeUnit: 'ms',
      };
      await fs.promises.writeFile(tracePath, JSON.stringify(trace, null, 2));
      if (logToStderr) {
        process.stderr.write(`bundle-source profile trace: ${tracePath}\n`);
      }
    },
  };
};
