// @ts-check
/**
 * Entry point for instantiating a `node:fs/promises`-backed
 * `Filesystem` as a formulated Endo caplet via
 * `host.makeUnconfined`.
 *
 * Symmetric with `in-memory-module.js`: it lets a HOST petstore
 * entry be a first-class formulated Filesystem cap that
 * reincarnates across daemon restart.
 *
 * Configuration is via environment variables passed through
 * `makeUnconfined({ env: [...] })`:
 *
 *   ENDO_FS_ROOT       absolute path to the directory to wrap
 *                      (required)
 *   ENDO_FS_READ_ONLY  if set to a truthy string ("1"/"true"),
 *                      the returned Filesystem is wrapped with
 *                      the `readOnly` attenuator
 *
 * Usage from the CLI:
 *
 *   endo make --UNCONFINED packages/endo-fs/src/node-fs-module.js \
 *     --name workspace \
 *     --workerName @node \
 *     --env ENDO_FS_ROOT=/path/to/dir
 *
 * The bin scripts `bin/attach.js` and `bin/mkmem.js` are thin
 * convenience wrappers around this and `in-memory-module.js`.
 */

/* global process */

import { makeNodeFilesystem } from './node-fs.js';
import { readOnly } from './readonly.js';

const isTruthy = v => v === '1' || v === 'true' || v === 'yes' || v === 'on';

/**
 * @param {unknown} _powers
 * @param {unknown} _context
 * @returns {object}
 */
export const make = (_powers, _context) => {
  const rootPath = process.env.ENDO_FS_ROOT;
  if (typeof rootPath !== 'string' || rootPath.length === 0) {
    throw new Error(
      'ENDO_FS_ROOT environment variable is required for node-fs-module',
    );
  }
  const fs = makeNodeFilesystem({ rootPath });
  if (isTruthy(process.env.ENDO_FS_READ_ONLY)) {
    return readOnly(fs);
  }
  return fs;
};
harden(make);
