// @ts-check

import { makeError, q, X } from '@endo/errors';
import { makeExo } from '@endo/exo';

import { SandboxFactoryInterface } from './interfaces.js';

/** @import { MakeSandboxFactoryInput, SandboxFactory, SandboxMakeOpts, SandboxDriver, BackendProbe } from './types.js' */

const FACTORY_HELP = `\
SandboxFactory — root capability of the @endo/sandbox plugin.

Mints confined POSIX slices via a registered backend driver
(bwrap, podman, lima, …). Phase 0 ships no drivers, so make() always
fails with "no backend available" until Phase 1 lands.

Methods:
  help([methodName])    Documentation for the factory or a method.
  listBackends()        Probe every registered driver and return the
                        list of { name, available, reason?, version? }.
  make(opts)            Mint a new sandbox slice. See SandboxMakeOpts.
`;

const METHOD_HELP = harden({
  help: 'help([methodName]) — return documentation for the factory or a specific method.',
  listBackends:
    'listBackends() — probe every registered driver. Returns Array<BackendProbe>.',
  make:
    'make(opts) — mint a new SandboxHandle. opts.rootfs is required; ' +
    'opts.network defaults to "none"; opts.backend defaults to "auto".',
});

/**
 * Stub factory for Phase 0.
 *
 * - `listBackends()` reports the probe result of every registered driver.
 *   Phase 0 ships zero drivers, so this returns an empty array.
 * - `make()` rejects every request with a structured "no backend
 *   available" error until Phase 1 lands a real driver.
 *
 * @param {MakeSandboxFactoryInput} input
 * @returns {SandboxFactory}
 */
export const makeSandboxFactory = ({ drivers, scratchProvider: _scratch }) => {
  const driverList = harden([...drivers]);

  /**
   * Probe each registered driver. Driver `probe()` failures are caught
   * and reported as `available: false` with the failure message in
   * `reason`, so a misbehaving driver never breaks `listBackends()`.
   *
   * @returns {Promise<BackendProbe[]>}
   */
  const listBackends = async () => {
    /** @type {BackendProbe[]} */
    const probes = [];
    for (const driver of driverList) {
      // eslint-disable-next-line no-await-in-loop, @jessie.js/safe-await-separator
      const result = await driver.probe().then(
        r => harden({ ok: /** @type {const} */ (true), value: r }),
        e => harden({ ok: /** @type {const} */ (false), error: e }),
      );
      if (result.ok) {
        probes.push(harden({ name: driver.name, ...result.value }));
      } else {
        const reason =
          /** @type {Error} */ (result.error).message || String(result.error);
        probes.push(harden({ name: driver.name, available: false, reason }));
      }
    }
    return harden(probes);
  };

  /**
   * Pick the driver matching the caller's `backend` selector.
   *
   * @param {SandboxMakeOpts['backend']} selector
   * @returns {SandboxDriver | undefined}
   */
  const pickDriver = selector => {
    if (driverList.length === 0) return undefined;
    if (selector === undefined || selector === 'auto') {
      return driverList[0];
    }
    return driverList.find(d => d.name === selector);
  };

  /**
   * Phase 0 stub: there are no drivers, so every `make()` call reports
   * a structured "no backend available" error.
   *
   * @param {SandboxMakeOpts} opts
   * @returns {Promise<never>}
   */
  const make = async opts => {
    const selector = opts.backend ?? 'auto';
    const driver = pickDriver(selector);
    if (driver === undefined) {
      throw makeError(X`no backend available: ${q(selector)}`);
    }
    // Drivers are not landing in Phase 0 — bail with a structured error
    // until Phase 1 fills in the spawn / mount / process plumbing.
    throw makeError(
      X`sandbox driver ${q(driver.name)} is registered but not yet implemented`,
    );
  };

  /**
   * @param {string} [methodName]
   * @returns {string}
   */
  const help = methodName => {
    if (methodName === undefined) return FACTORY_HELP;
    const text =
      METHOD_HELP[/** @type {keyof typeof METHOD_HELP} */ (methodName)];
    if (text === undefined) {
      return `No documentation for method ${q(methodName)}.`;
    }
    return text;
  };

  return /** @type {SandboxFactory} */ (
    /** @type {unknown} */ (
      makeExo('SandboxFactory', SandboxFactoryInterface, {
        help,
        listBackends,
        make,
      })
    )
  );
};
harden(makeSandboxFactory);
