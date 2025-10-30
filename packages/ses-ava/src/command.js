/* global process */
/* eslint-disable no-await-in-loop, no-continue, no-labels, no-unreachable-loop */

/* The ses-ava command allows a single package to run the same test suite with
 * multiple configurations named in package.json under `sesAvaConfigs`.
 * Each of these configurations requires a separate AVA config file like
 * test/_ava.special.config.js and a name.
 * The ses-ava command will by default run all tests in every mode but allows
 * the user to pass --only <name> and --exclude <name> (or shorthands -o <name>
 * and -x <name>) at any argument position for any of the named configurations
 * to filter.
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

  // Parse arguments.
  const passThroughArgs = [];
  const noConfigNames = new Set();
  const onlyConfigNames = new Set();
  let failFast = false;
  let firstArg = true;
  const argsIterator = process.argv.slice(2)[Symbol.iterator]();
  for (const rawArg of argsIterator) {
    if (rawArg === '--') {
      passThroughArgs.push(...argsIterator);
      break;
    }
    const charsBeforeOptArg = rawArg.startsWith('--') ? rawArg.indexOf('=') : 2;
    const arg =
      charsBeforeOptArg !== -1 ? rawArg.slice(0, charsBeforeOptArg) : rawArg;
    const getOptArg = () => {
      if (charsBeforeOptArg !== -1) {
        if (rawArg.startsWith('--')) return rawArg.slice(charsBeforeOptArg + 1);
        if (rawArg.length > 2) return rawArg.slice(2);
      }
      const { value, done } = argsIterator.next();
      if (done) {
        throw new Error(`Expected argument after ${arg}`);
      }
      return value;
    };
    if (passThroughFlags.has(arg)) {
      passThroughArgs.push(rawArg);
    } else if (passThroughArgOptions.has(arg)) {
      if (arg !== rawArg) {
        passThroughArgs.push(rawArg);
      } else {
        passThroughArgs.push(arg, getOptArg());
      }
    } else if (rawArg === '--fail-fast') {
      // Pass-through too
      passThroughArgs.push(rawArg);
      failFast = true;
    } else if (arg === 'reset-cache' && firstArg) {
      passThroughArgs.push(rawArg);
    } else if (arg === '--exclude' || arg === '-x') {
      noConfigNames.add(getOptArg());
    } else if (arg === '--only' || arg === '-o') {
      onlyConfigNames.add(getOptArg());
    } else if (arg.startsWith('-')) {
      throw new Error(
        `Unknown flag ${arg}. If this is an ava flag, pass through after --.`,
      );
    } else {
      passThroughArgs.push(rawArg);
    }
    firstArg = false;
  }

  // Select configurations.
  const configs = new Set();
  for (const config of noConfigNames) {
    if (onlyConfigNames.has(config)) {
      // Ask not the advice of wizards, for they will say both --include and
      // --exclude.
      throw new Error(`ses-ava cannot both include and exclude ${config}`);
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
