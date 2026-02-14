/* global process */

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

/** @import { Context } from './types' */

const cliBin = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'bin',
);
const repoRoot = path.resolve(cliBin, '..', '..', '..');

/** @type {string | undefined} */
let testRoot;
/** @type {Record<string, string | undefined> | undefined} */
let prevEnv;

/**
 * Provides test setup and teardown hooks that purge the local endo
 * daemon. In the future, we should create isolated daemon instances
 * so that tests can be run in parallel.
 *
 * @type {Context}
 */
export const daemonContext = {
  setup: async execa => {
    const tmpRoot = path.join(repoRoot, '.tmp');
    await fs.mkdir(tmpRoot, { recursive: true });
    testRoot = await fs.mkdtemp(path.join(tmpRoot, 'endo-cli-test-'));
    prevEnv = {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      XDG_STATE_HOME: process.env.XDG_STATE_HOME,
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
      XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
      ENDO_SOCK: process.env.ENDO_SOCK,
    };

    const stateHome = path.join(testRoot, 'state');
    const cacheHome = path.join(testRoot, 'cache');
    const runtimeDir = path.join(testRoot, 'runtime');
    await Promise.all([
      fs.mkdir(stateHome, { recursive: true }),
      fs.mkdir(cacheHome, { recursive: true }),
      fs.mkdir(runtimeDir, { recursive: true }),
    ]);

    process.env.HOME = testRoot;
    process.env.PATH = `${cliBin}${path.delimiter}${process.env.PATH ?? ''}`;
    process.env.XDG_STATE_HOME = stateHome;
    process.env.XDG_CACHE_HOME = cacheHome;
    process.env.XDG_RUNTIME_DIR = runtimeDir;
    process.env.ENDO_SOCK = path.join(runtimeDir, 'endo.sock');

    await execa`endo purge -f`;
    await execa`endo start`;
  },
  teardown: async execa => {
    await execa`endo purge -f`;
    if (prevEnv) {
      process.env.HOME = prevEnv.HOME;
      process.env.PATH = prevEnv.PATH;
      process.env.XDG_STATE_HOME = prevEnv.XDG_STATE_HOME;
      process.env.XDG_CACHE_HOME = prevEnv.XDG_CACHE_HOME;
      process.env.XDG_RUNTIME_DIR = prevEnv.XDG_RUNTIME_DIR;
      process.env.ENDO_SOCK = prevEnv.ENDO_SOCK;
    }
    if (testRoot) {
      await fs.rm(testRoot, { recursive: true, force: true });
      testRoot = undefined;
    }
  },
};
