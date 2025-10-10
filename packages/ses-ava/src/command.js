/* global process */
/* eslint-disable no-await-in-loop, no-continue */

/* The ses-ava command allows a single package to run the same test suite with
 * multiple configurations named in package.json under `sesAvaConfigs`.
 * Each of these configurations requires a separate Ava config file like
 * test/_ava.special.config.js and a name.
 * The ses-ava command will by default run all tests in every mode but allows
 * the user to pass --only-* and --no-* at any argument position for any of
 * the named configurations to filter.
 * Consequently, the "test" script for a package using ses-ava can simply be
 * "ses-ava" and preserves the filtering behaviors of the underlying "ava"
 * sessions if run like `yarn test -m file`.
 */

import popen from 'node:child_process';
import fs from 'node:fs';

export const main = async () => {
  const descriptorText = await fs.promises.readFile('package.json', 'utf8');
  const descriptor = JSON.parse(descriptorText);
  const { ava = undefined, sesAvaConfigs = {} } = descriptor;
  if (ava) sesAvaConfigs.default = undefined;
  const keys = Object.keys(sesAvaConfigs);
  const all = new Set(keys);
  const noFlags = new Map(keys.map(key => [`--ses-ava-no-${key}`, key]));
  const onlyFlags = new Map(keys.map(key => [`--ses-ava-only-${key}`, key]));
  const args = [];
  const no = new Set();
  const only = new Set();
  const argsIterator = process.argv.slice(2)[Symbol.iterator]();

  // Parse arguments.
  for (const arg of argsIterator) {
    if (arg === '--') {
      args.push(...argsIterator);
      break;
    }
    const noKey = noFlags.get(arg);
    const onlyKey = onlyFlags.get(arg);
    if (noKey) {
      no.add(noKey);
    } else if (onlyKey) {
      only.add(onlyKey);
    } else {
      args.push(arg);
    }
  }

  // Select configurations.
  const configs = new Set();
  for (const config of no) {
    if (only.has(config)) {
      // Ask not the advice of wizards, for they will say both --no-config- and
      // --only-config-.
      throw new Error(
        `ses-ava cannot respect both --no-config-${config} and --only-config-${config}`,
      );
    }
  }
  for (const config of all) {
    if (!no.has(config)) {
      configs.add(config);
    }
  }
  if (configs.size === 0) {
    throw new Error(
      `ses-ava requires at least one Ava configuration, either "ava" or "sesAvaConfigs" in package.json`,
    );
  }

  for (const config of configs) {
    // Ava silently proceeds with default configuration if the given --config
    // file does not exist.
    // I know, right?
    const configFile = sesAvaConfigs[config];
    if (configFile !== undefined && !fs.existsSync(configFile)) {
      throw new Error(
        `ses-ava config ${config} file does not exist: ${sesAvaConfigs[config]}`,
      );
    }
  }

  // Execute configurations serially.
  for (const config of configs) {
    const avaArgs = [
      ...(sesAvaConfigs[config] ? ['--config', sesAvaConfigs[config]] : []),
      ...args,
    ];
    const child = popen.spawn('ava', avaArgs, {
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    await new Promise((resolve, reject) => {
      child.on('exit', code => {
        process.exitCode ||= typeof code === 'number' ? code : 1;
        resolve(undefined);
      });
      child.on('error', error => {
        reject(error);
      });
    });
  }
};
