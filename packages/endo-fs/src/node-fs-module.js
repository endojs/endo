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

import { makeNodeFilesystem } from './node-fs.js';
import { readOnly } from './readonly.js';

const isTruthy = v => v === '1' || v === 'true' || v === 'yes' || v === 'on';

/**
 * @param {unknown} _powers  unused; node-fs needs no host powers.
 * @param {unknown} _context
 * @param {{ env?: Record<string, string> }} [opts]
 *   Per-formula env passed through `makeUnconfined({ env })`. The
 *   daemon worker invokes
 *   `namespace.make(powers, context, Object.freeze({ env }))`, so
 *   this is the canonical channel for caplet configuration —
 *   distinct from the daemon process's own `process.env`.
 * @returns {object}
 */
export const make = (_powers, _context, opts = {}) => {
  const env = opts.env || {};
  const rootPath = env.ENDO_FS_ROOT;
  if (typeof rootPath !== 'string' || rootPath.length === 0) {
    throw new Error(
      'node-fs-module: env.ENDO_FS_ROOT (absolute path to wrap) is required; pass it via makeUnconfined({ env: { ENDO_FS_ROOT: ... } })',
    );
  }
  const fs = makeNodeFilesystem({ rootPath });
  if (isTruthy(env.ENDO_FS_READ_ONLY)) {
    return readOnly(fs);
  }
  return fs;
};
harden(make);
