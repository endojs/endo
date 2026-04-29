// @ts-check

import { makeBwrapDriver } from './drivers/bwrap.js';
import { makeSandboxFactory } from './factory.js';

/** @import { SandboxDriver, SandboxFactory, SandboxPowers } from './types.js' */

/**
 * `make-unconfined` entry point for the `@endo/sandbox` plugin.
 *
 * Phase 1 registers the `bwrap` driver. Driver registration is
 * probe-gated: a missing `bwrap` binary does NOT fail the daemon's
 * boot — it appears as `available: false` in `listBackends()`, and
 * `make()` rejects with a structured "no backend available" error.
 *
 * Mirrors `packages/lal/agent.js`'s entry-point shape.
 *
 * @param {SandboxPowers} powers - guest powers from the daemon
 * @param {unknown} _context - cancellation context (unused in Phase 1)
 * @param {{ env?: Record<string, string> }} [options]
 * @returns {Promise<SandboxFactory>}
 */
export const make = async (powers, _context, options = {}) => {
  /** @type {SandboxDriver[]} */
  const drivers = [];

  // bwrap (Linux). Construction never throws even when bwrap is
  // absent; `probe()` reports availability lazily on first
  // `listBackends()` call.
  try {
    drivers.push(makeBwrapDriver({ env: options.env ?? {} }));
  } catch (e) {
    // The bwrap driver factory does not currently throw, but be
    // defensive against future refactors so a misconfigured driver
    // never breaks the daemon's boot path.
    // eslint-disable-next-line no-console
    console.warn('@endo/sandbox: bwrap driver registration failed', e);
  }

  return makeSandboxFactory({
    drivers: harden(drivers),
    scratchProvider: powers,
  });
};
harden(make);
