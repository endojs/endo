/* global process */

import os from 'os';
import path from 'path';
import url from 'url';

/** @import { Context } from './types' */

const dirname = url.fileURLToPath(new URL('.', import.meta.url)).toString();
const testRoot = path.join(dirname, 'tmp', 'endo');
const endoEnv = {
  XDG_STATE_HOME: path.join(testRoot, 'state'),
  XDG_RUNTIME_DIR: path.join(testRoot, 'run'),
  XDG_CACHE_HOME: path.join(testRoot, 'cache'),
  ENDO_SOCK: path.join(os.tmpdir(), `endo-cli-${process.pid}.sock`),
};

for (const [key, value] of Object.entries(endoEnv)) {
  process.env[key] = value;
}

/**
 * Provides test setup and teardown hooks that purge the local endo
 * daemon. In the future, we should create isolated daemon instances
 * so that tests can be run in parallel.
 *
 * @type {Context}
 */
export const daemonContext = {
  setup: async execa => {
    await execa`endo purge -f`;
    await execa`endo start`;
  },
  teardown: async execa => {
    await execa`endo purge -f`;
  },
};
