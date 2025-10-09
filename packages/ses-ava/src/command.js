/* global process */
/* eslint-disable no-await-in-loop, no-continue */

/* The ses-ava command allows a single package to run the same test suite with
 * multiple configurations named in package.json under `avaConfigs`.
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
  const { ava = undefined, avaConfigs = {} } = descriptor;
  if (ava) avaConfigs['default'] = undefined;
  const keys = Object.keys(avaConfigs);
  const all = new Set(keys);
  const noFlags = new Map(keys.map(key => [`--no-${key}`, key]));
  const onlyFlags = new Map(keys.map(key => [`--only-${key}`, key]));
  const args = [];
  const no = new Set();
  const only = new Set();
  const argsIterator = process.argv.slice(2)[Symbol.iterator]();

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

  for (const config of only.size > 0 ? only : all) {
    if (no.has(config)) {
      continue;
    }
    const avaArgs = [
      ...(avaConfigs[config] ? ['--config', avaConfigs[config]] : []),
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
