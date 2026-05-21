// Shared helper for the endo-fs bin scripts. Spawns
// `endo make --UNCONFINED <module> --workerName @node --name <name>`
// with extra env vars for module configuration.
//
// Bin scripts run before SES lockdown, so this file deliberately
// avoids @ts-check / harden / @endo/* imports — plain Node ESM only.

/* global process */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);

// Resolve the `endo` executable. We first try `@endo/cli/bin/endo`
// via the local node_modules layout; fall back to PATH if that
// doesn't work.
const resolveEndoBin = () => {
  try {
    const pkgPath = req.resolve('@endo/cli/package.json');
    return resolve(dirname(pkgPath), 'bin', 'endo');
  } catch {
    return 'endo';
  }
};

// Resolve a module specifier (file path) inside this package's
// `src/` directory, expressed as a `file://` URL — the form
// `endo make --UNCONFINED` expects.
export const localModuleSpecifier = relName => {
  const abs = resolve(HERE, '..', 'src', relName);
  return new URL(`file://${abs}`).href;
};

// Invoke `endo make` with the supplied arguments. Streams stdout
// and stderr to the parent. Exits the process with the same code
// `endo` returned.
export const runEndoMake = ({
  moduleSpecifier,
  name,
  workerName = '@node',
  env = [],
}) => {
  const endoBin = resolveEndoBin();
  const argv = [
    'make',
    '--UNCONFINED',
    moduleSpecifier,
    '--name',
    name,
    '--workerName',
    workerName,
  ];
  for (const e of env) {
    argv.push('--env', e);
  }
  const result = spawnSync(endoBin, argv, { stdio: 'inherit' });
  if (result.error) {
    // eslint-disable-next-line no-console
    console.error('endo:', result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
};
