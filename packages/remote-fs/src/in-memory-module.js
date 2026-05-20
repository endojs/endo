// @ts-check
/**
 * Entry point for instantiating a remote-fs in-memory `Filesystem`
 * as a formulated Endo caplet via `host.makeUnconfined`.
 *
 * The `make()` factory pattern lets a HOST petstore entry be a
 * first-class formulated Filesystem cap (rather than a bare
 * Far reference, which `storeValue` won't marshal). The resulting
 * cap is what the ClaudeContainer factory's `filesystem` form
 * field accepts.
 *
 * Usage from a test:
 *
 *   const moduleUrl = new URL(
 *     '@endo/remote-fs/src/in-memory-module.js',
 *     import.meta.url,
 *   ).href;
 *   const fs = await E(host).makeUnconfined('@main', moduleUrl, {
 *     resultName: 'workspace-fs',
 *   });
 *   // `fs` is now a remote-fs Filesystem cap, addressable as a
 *   // formula on @host. Populate via E(fs).root() etc.
 */

import { makeInMemoryFilesystem } from './in-memory.js';

/**
 * @param {unknown} _powers
 * @param {unknown} _context
 * @returns {object}
 */
export const make = (_powers, _context) => {
  return makeInMemoryFilesystem();
};
harden(make);
