// @ts-check

import { makeBwrapDriver } from './drivers/bwrap.js';
import { makePodmanDriver } from './drivers/podman.js';
import { makeSandboxFactory } from './factory.js';

/** @import { SandboxDriver, SandboxFactory, SandboxPowers } from './types.js' */

/**
 * `make-unconfined` entry point for the `@endo/sandbox` plugin.
 *
 * Registers every driver shipped with the package.  Driver
 * registration is probe-gated: a missing external tool (e.g. `bwrap`,
 * `podman`) does NOT fail the daemon's boot — the driver appears as
 * `available: false` in `listBackends()`, and `make()` rejects with a
 * structured "no backend available" error.
 *
 * Phase 1 ships the `bwrap` driver; Phase 2 adds `podman` (rootless,
 * Linux-only).  The factory's `'auto'` selector picks the first
 * available driver in the order they appear here, so the bwrap driver
 * remains the default when both are present — callers asking for OCI
 * rootfs must opt in via `backend: 'podman'`.
 *
 * Mirrors `packages/lal/agent.js`'s entry-point shape.
 *
 * @param {SandboxPowers} powers - guest powers from the daemon
 * @param {unknown} _context - cancellation context (unused in v1)
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

  // podman (Linux, Phase 2).  Same probe-gated pattern as bwrap: a
  // missing podman binary or rootful-only install reports
  // `available: false` rather than failing daemon boot.
  try {
    drivers.push(makePodmanDriver({ env: options.env ?? {} }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('@endo/sandbox: podman driver registration failed', e);
  }

  return makeSandboxFactory({
    drivers: harden(drivers),
    scratchProvider: powers,
  });
};
harden(make);
