// @ts-check
/* global process */

import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  whereEndoState,
  whereEndoEphemeralState,
  whereEndoSock,
  whereEndoCache,
} from '@endo/where';

/**
 * @import { Config } from './src/types.js'
 */

const { username, homedir } = os.userInfo();
const temp = os.tmpdir();
const info = harden({
  user: username,
  home: homedir,
  temp,
});

/**
 * Returns the default config directory path following XDG conventions.
 *
 * @param {string} platform
 * @param {{[key: string]: string | undefined}} env
 * @param {{home: string}} platformInfo
 * @returns {string}
 */
const whereEndoConfigDir = (platform, env, platformInfo) => {
  if (env.XDG_CONFIG_HOME !== undefined) {
    return `${env.XDG_CONFIG_HOME}/endo`;
  } else if (platform === 'win32') {
    const appData = env.APPDATA || `${platformInfo.home}\\AppData\\Roaming`;
    return `${appData}\\Endo`;
  } else if (platform === 'darwin') {
    const home = env.HOME !== undefined ? env.HOME : platformInfo.home;
    return `${home}/Library/Preferences/Endo`;
  }
  const home = env.HOME !== undefined ? env.HOME : platformInfo.home;
  return `${home}/.config/endo`;
};
harden(whereEndoConfigDir);

/**
 * Computes the builtin default Config from platform and environment.
 *
 * @param {string} [platform]
 * @param {{[key: string]: string | undefined}} [env]
 * @returns {Config}
 */
const computeDefaultConfig = (platform = process.platform, env = process.env) => {
  return harden({
    statePath: whereEndoState(platform, env, info),
    ephemeralStatePath: whereEndoEphemeralState(platform, env, info),
    sockPath: whereEndoSock(platform, env, info),
    cachePath: whereEndoCache(platform, env, info),
  });
};
harden(computeDefaultConfig);

/** @type {Config} */
const defaultConfig = computeDefaultConfig();

/** @type {ReadonlyArray<keyof Config>} */
const configKeys = harden(['statePath', 'ephemeralStatePath', 'sockPath', 'cachePath']);

/**
 * Map from Config key to the corresponding `ENDO_*` environment variable name.
 *
 * @type {Readonly<Record<keyof Config, string>>}
 */
const configKeyToEnvName = harden({
  statePath: 'ENDO_STATE_PATH',
  ephemeralStatePath: 'ENDO_EPHEMERAL_STATE_PATH',
  sockPath: 'ENDO_SOCK_PATH',
  cachePath: 'ENDO_CACHE_PATH',
});

/**
 * Strip single-line (`//`) and multi-line comments from a JSONC string,
 * taking care not to mangle strings that happen to contain comment-like
 * sequences.
 *
 * @param {string} text
 * @returns {string}
 */
const stripJsoncComments = (text) => {
  let result = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // String literal — copy through including escapes
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') {
          j += 2; // skip escaped character
        } else if (text[j] === '"') {
          j += 1;
          break;
        } else {
          j += 1;
        }
      }
      result += text.slice(i, j);
      i = j;
      continue;
    }

    // Single-line comment
    if (ch === '/' && text[i + 1] === '/') {
      const eol = text.indexOf('\n', i);
      i = eol === -1 ? text.length : eol;
      continue;
    }

    // Multi-line comment
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      continue;
    }

    result += ch;
    i += 1;
  }
  return result;
};

/**
 * Parse a JSONC string (JSON with comments and optional trailing commas).
 *
 * @param {string} text
 * @returns {unknown}
 */
const parseJsonc = (text) => {
  const stripped = stripJsoncComments(text);
  // Remove trailing commas before } or ]
  const cleaned = stripped.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(cleaned);
};

// ---- Config file path ----

/**
 * Returns the path to the JSONC config file.
 *
 * Honors `$ENDO_CONFIG` if set, otherwise falls back to
 * `$XDG_CONFIG_HOME/endo/config.jsonc`.
 *
 * @param {{[key: string]: string | undefined}} [env]
 * @returns {string}
 */
const getConfigFilePath = (env = process.env) => {
  if (env.ENDO_CONFIG) {
    return env.ENDO_CONFIG;
  }
  const configDir = whereEndoConfigDir(process.platform, env, info);
  return path.join(configDir, 'config.jsonc');
};
harden(getConfigFilePath);

// ---- Read / Write ----

/**
 * Read and parse the JSONC config file, returning an empty object when the
 * file does not exist.
 *
 * @param {string} [configFilePath]
 * @returns {Promise<Partial<Config>>}
 */
const readConfigFile = async (configFilePath = getConfigFilePath()) => {
  try {
    const raw = await fs.promises.readFile(configFilePath, 'utf-8');
    const parsed = parseJsonc(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    /** @type {Partial<Config>} */
    const result = {};
    for (const key of configKeys) {
      if (key in parsed) {
        const value = /** @type {Record<string, unknown>} */ (parsed)[key];
        if (typeof value === 'string') {
          result[key] = value;
        }
      }
    }
    return result;
  } catch (/** @type {any} */ err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    throw err;
  }
};
harden(readConfigFile);

/**
 * Write Config entries to the JSONC config file.
 *
 * Reads the existing file (preserving unknown keys), applies the given
 * partial, and writes back with 2-space indentation.
 *
 * @param {Partial<Config>} updates
 * @param {string} [configFilePath]
 * @returns {Promise<void>}
 */
const writeConfigFile = async (updates, configFilePath = getConfigFilePath()) => {
  /** @type {Record<string, unknown>} */
  let existing = {};
  try {
    const raw = await fs.promises.readFile(configFilePath, 'utf-8');
    const parsed = parseJsonc(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      existing = /** @type {Record<string, unknown>} */ (parsed);
    }
  } catch (/** @type {any} */ err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  const merged = { ...existing, ...updates };
  const content = `${JSON.stringify(merged, null, 2)}\n`;

  await fs.promises.mkdir(path.dirname(configFilePath), { recursive: true });
  await fs.promises.writeFile(configFilePath, content, 'utf-8');
};
harden(writeConfigFile);

// ---- Resolve ----

/**
 * Resolve the effective Config by merging (highest to lowest priority):
 *
 * 1. `$ENDO_<KEY>` environment variable overrides
 * 2. Values from the JSONC config file
 * 3. Builtin defaults
 *
 * @param {{[key: string]: string | undefined}} [env]
 * @param {string} [configFilePath]
 * @returns {Promise<Config>}
 */
const resolveConfig = async (env = process.env, configFilePath = getConfigFilePath(env)) => {
  const fileConfig = await readConfigFile(configFilePath);

  /** @type {Config} */
  const resolved = { ...defaultConfig };
  for (const key of configKeys) {
    const envName = configKeyToEnvName[key];
    const envValue = env[envName];
    if (typeof envValue === 'string' && envValue !== '') {
      resolved[key] = envValue;
    } else if (fileConfig[key] !== undefined) {
      resolved[key] = /** @type {string} */ (fileConfig[key]);
    }
    // else: keep defaultConfig[key]
  }
  return harden(resolved);
};
harden(resolveConfig);

export {
  configKeys,
  configKeyToEnvName,
  defaultConfig,
  getConfigFilePath,
  parseJsonc,
  readConfigFile,
  resolveConfig,
  writeConfigFile,
};
