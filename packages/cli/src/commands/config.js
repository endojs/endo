// @ts-nocheck
/* global process */

/**
 * `endo config` command implementations.
 *
 * - `endo config`             — list all effective settings
 * - `endo config <key>`       — get a single setting
 * - `endo config <key> <val>` — set a single setting in the config file
 */

import {
  configKeys,
  defaultConfig,
  getConfigFilePath,
  readConfigFile,
  resolveConfig,
  writeConfigFile,
} from '@endo/daemon/config.js';

/**
 * List all effective settings, showing where each value comes from.
 *
 * @param {object} options
 * @param {boolean} [options.json]
 * @returns {Promise<void>}
 */
export const listConfig = async ({ json = false } = {}) => {
  const resolved = await resolveConfig();
  if (json) {
    process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`);
  } else {
    for (const key of configKeys) {
      process.stdout.write(`${key}: ${resolved[key]}\n`);
    }
  }
};

/**
 * Get a single config value.
 *
 * @param {object} options
 * @param {string} options.key
 * @returns {Promise<void>}
 */
export const getConfig = async ({ key }) => {
  if (!configKeys.includes(key)) {
    const validKeys = configKeys.join(', ');
    throw new Error(
      `Unknown config key: ${JSON.stringify(key)}. Valid keys: ${validKeys}`,
    );
  }
  const resolved = await resolveConfig();
  process.stdout.write(`${resolved[key]}\n`);
};

/**
 * Set a single config value in the config file.
 *
 * @param {object} options
 * @param {string} options.key
 * @param {string} options.value
 * @returns {Promise<void>}
 */
export const setConfig = async ({ key, value }) => {
  if (!configKeys.includes(key)) {
    const validKeys = configKeys.join(', ');
    throw new Error(
      `Unknown config key: ${JSON.stringify(key)}. Valid keys: ${validKeys}`,
    );
  }
  await writeConfigFile({ [key]: value });
  const configFilePath = getConfigFilePath();
  process.stdout.write(`Set ${key} = ${value} in ${configFilePath}\n`);
};

/**
 * Show where the config file lives and what it contains.
 *
 * @returns {Promise<void>}
 */
export const showConfigFile = async () => {
  const configFilePath = getConfigFilePath();
  const fileConfig = await readConfigFile(configFilePath);
  process.stdout.write(`Config file: ${configFilePath}\n`);
  const fileKeys = Object.keys(fileConfig);
  if (fileKeys.length === 0) {
    process.stdout.write('(no config file settings)\n');
  } else {
    for (const key of configKeys) {
      if (key in fileConfig) {
        process.stdout.write(`  ${key}: ${fileConfig[key]}\n`);
      }
    }
  }

  process.stdout.write('\nDefaults:\n');
  for (const key of configKeys) {
    process.stdout.write(`  ${key}: ${defaultConfig[key]}\n`);
  }
};
