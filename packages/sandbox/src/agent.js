// @ts-check

import { makeSandboxFactory } from './factory.js';

/** @import { SandboxFactory, SandboxPowers } from './types.js' */

/**
 * `make-unconfined` entry point for the `@endo/sandbox` plugin.
 *
 * Phase 0 ships no drivers and no production logic — calling `make()`
 * on the returned factory always raises a structured "no backend
 * available" error. The plugin still loads cleanly and answers
 * `listBackends()` with an empty list, giving Phase 1 a stable typed
 * surface to fill in.
 *
 * Mirrors `packages/lal/agent.js`'s entry-point shape.
 *
 * @param {SandboxPowers} powers - guest powers from the daemon
 * @param {unknown} _context - cancellation context (unused in Phase 0)
 * @param {{ env?: Record<string, string> }} [_options]
 * @returns {Promise<SandboxFactory>}
 */
export const make = async (powers, _context, _options = {}) => {
  // Phase 0: register no drivers. Phase 1 will load the bwrap driver
  // here, gated on a `bwrap --version` probe. Phase 2+ will append
  // podman, lima, etc.
  return makeSandboxFactory({
    drivers: harden([]),
    scratchProvider: powers,
  });
};
harden(make);
