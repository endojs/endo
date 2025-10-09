/* global process */
/* eslint-disable no-await-in-loop, no-continue, no-labels, no-unreachable-loop */

/* The ses-ava command allows a single package to run the same test suite with
 * multiple configurations named in package.json under `sesAvaConfigs`.
 * Each of these configurations requires a separate AVA config file like
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

const passThroughFlags = new Set([
  ...['-s', '--serial'],
  ...['-t', '--tap'],
  ...['-T', '--timeout'],
  ...['-u', '--update-snapshots'],
  ...['-v', '--verbose'],
  '--no-worker-threads',
  '--verbose',
  '--no-verbose',
  // Specific to ava debug.
  'debug',
  '--break',
]);

const passThroughArgOptions = new Set([
  ...['-m', '--match'],
  '--node-arguments',
  // Specific to ava debug.
  '--host',
  '--port',
]);

export const main = async () => {
  // Parse configuration.
  const descriptorText = await fs.promises.readFile('package.json', 'utf8');
  const descriptor = JSON.parse(descriptorText);
  const { ava = undefined, sesAvaConfigs = {} } = descriptor;
  if (ava) sesAvaConfigs.default = undefined;
  const keys = Object.keys(sesAvaConfigs);
  const allConfigNames = new Set(keys);
  const noFlags = new Map(keys.map(key => [`--no-config-${key}`, key]));
  const onlyFlags = new Map(keys.map(key => [`--only-config-${key}`, key]));

  // Parse arguments.
  const passThroughArgs = [];
  const noConfigNames = new Set();
  const onlyConfigNames = new Set();
  let failFast = false;
  let firstArg = true;
  const argsIterator = process.argv.slice(2)[Symbol.iterator]();
  for (const arg of argsIterator) {
    if (arg === '--') {
      passThroughArgs.push(...argsIterator);
      break;
    }
    const noKey = noFlags.get(arg);
    const onlyKey = onlyFlags.get(arg);
    const equalsAt = arg.indexOf('=');
    if (passThroughFlags.has(arg)) {
      passThroughArgs.push(arg);
    } else if (arg.startsWith('--') && equalsAt !== -1) {
      const flag = arg.slice(0, equalsAt);
      if (!passThroughArgOptions.has(flag)) {
        throw new Error(`Unrecognized flag ${flag}`);
      }
      passThroughArgs.push(arg);
    } else if (passThroughArgOptions.has(arg)) {
      const { value: nextArg, done } = argsIterator.next();
      if (done) {
        throw new Error(`Expected argument after ${arg}`);
      }
      passThroughArgs.push(arg, nextArg);
    } else if (arg === '--fail-fast') {
      // Pass-through too
      passThroughArgs.push(arg);
      failFast = true;
    } else if (arg === 'reset-cache' && firstArg) {
      passThroughArgs.push(arg);
    } else if (noKey) {
      noConfigNames.add(noKey);
    } else if (onlyKey) {
      onlyConfigNames.add(onlyKey);
    } else if (arg.startsWith('-')) {
      throw new Error(
        `Unknown flag ${arg}. If this is an ava flag, pass through after --.`,
      );
    } else {
      passThroughArgs.push(arg);
    }
    firstArg = false;
  }

  // Select configurations.
  const configs = new Set();
  for (const config of noConfigNames) {
    if (onlyConfigNames.has(config)) {
      // Ask not the advice of wizards, for they will say both --no-config- and
      // --only-config-.
      throw new Error(
        `ses-ava cannot respect both --no-config-${config} and --only-config-${config}`,
      );
    }
  }
  for (const config of onlyConfigNames.size > 0
    ? onlyConfigNames
    : allConfigNames) {
    if (!noConfigNames.has(config)) {
      configs.add(config);
    }
  }
  if (configs.size === 0) {
    throw new Error(
      `ses-ava requires at least one AVA configuration, either "ava" or "sesAvaConfigs" in package.json`,
    );
  }

  for (const config of configs) {
    // AVA silently proceeds with default configuration if the given --config
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
    console.warn(`[ses-ava] config:`, config);
    const avaArgs = [
      ...(sesAvaConfigs[config] ? ['--config', sesAvaConfigs[config]] : []),
      ...passThroughArgs,
    ];
    const child = popen.spawn('ava', avaArgs, {
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    await new Promise((resolve, reject) => {
      child.on('exit', code => {
        process.exitCode ||= typeof code === 'number' ? code : 1;
        if (failFast && process.exitCode !== 0) {
          process.exit();
        }
        resolve(undefined);
      });
      child.on('error', error => {
        reject(error);
      });
    });
  }
};
