// @ts-check

/**
 * `@endo/fetch` - an unconfined Endo plugin that provisions confined outbound
 * HTTP.
 *
 * The plugin module exports the standard unconfined-caplet maker,
 * `make(powers, context, { env })`, provisioned through the daemon's generic
 * pathway:
 *
 * ```
 * E(host).makeUnconfined(workerName, '@endo/fetch', { powersName, resultName })
 * ```
 *
 * `powers` is agent-shaped (typically a dedicated guest). The plugin resolves
 * everything it needs by name through it and holds no ambient authority beyond
 * the Node worker it runs in (which is where the real `fetch` power lives - the
 * plugin is unconfined; the capability it mints is confined):
 *
 * - `E(powers).lookup('fetch-store')` -> a writable virtual-file-system
 *   directory backing the durable policy store (`./store.js`). The backing may
 *   be a host directory, an in-memory tree, a daemon mount, or a database.
 * - `E(powers).lookup('fetch-policy-authority')` (optional) -> the referral
 *   target for trust-on-first-bind decisions, passed through as
 *   `makeHttpClientAndControl`'s `policyAuthority`. When the lookup fails the
 *   plugin runs without one: `tofu-prompt` / `tofu-attenuator` modes are
 *   unavailable and unknown origins fail closed (strict behavior). It is
 *   resolved once at `make()`, mirroring endo-reminder's recipient resolution
 *   (design open question 2).
 *
 * Initial `allowedOrigins` (comma-separated), `maxRequestsPerMinute`,
 * `maxResponseBytes`, and `policyMode` arrive via the `env` option of
 * `makeUnconfined`; thereafter `HttpClientControl` adjusts them and the durable
 * store persists them, so the store - not `env` - is authoritative across
 * restarts.
 *
 * Wake-on-restart is integration-owned retention of a live reference: the
 * provisioning integration pins the service (`resultName: ['@pins', 'fetch']`
 * for the reference host), so `revivePins()` provides its identifier at boot,
 * the worker incarnates the plugin, and `make()` reconstitutes the pair from the
 * store with identical policy and pins. See the README.
 */

import { E } from '@endo/eventual-send';
import { makeFetchStore } from './store.js';
import { makeFetchService } from './service.js';

export { makeFetchService } from './service.js';
export { makeFetchStore } from './store.js';

/**
 * Generate a 128-bit random-hex identifier, used for the durable store's
 * temporary-file suffixes. A random id gives unique temp filenames without a
 * content-address round-trip, matching the daemon's random-hex id discipline.
 *
 * @returns {Promise<string>}
 */
const makeRandomHexId = async () => {
  let hex = '';
  while (hex.length < 32) {
    hex += Math.floor(Math.random() * 0x1_0000)
      .toString(16)
      .padStart(4, '0');
  }
  return hex.slice(0, 32);
};

/**
 * Parse a positive integer from a formula-env string, or `undefined` if the key
 * is absent. Throws on a present-but-invalid value so a misconfigured
 * provisioning fails loudly rather than silently defaulting.
 *
 * @param {string | undefined} value
 * @param {string} name
 * @returns {number | undefined}
 */
const parseOptionalPositiveInteger = (value, name) => {
  if (value === undefined) {
    return undefined;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw Error(`@endo/fetch: env.${name} must be a positive integer`);
  }
  return n;
};

/**
 * Parse a comma-separated allowlist into an array of origins, or `undefined`
 * when the key is absent. Blank entries are dropped; validation of the origin
 * shape happens in `makeHttpClientAndControl`.
 *
 * @param {string | undefined} value
 * @returns {string[] | undefined}
 */
const parseOptionalOriginList = value => {
  if (value === undefined) {
    return undefined;
  }
  return value
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
};

/**
 * Resolve an optional power by name, returning `undefined` when it is absent
 * rather than throwing, so the plugin degrades to strict behavior when no
 * policy authority is granted.
 *
 * @param {any} powers
 * @param {string} name
 * @returns {Promise<any>}
 */
const lookupOptional = async (powers, name) => {
  await null;
  try {
    return await E(powers).lookup(name);
  } catch (_error) {
    return undefined;
  }
};

/**
 * Unconfined-caplet entry point. Builds the fetch service over the VFS store and
 * the merged HttpClient/HttpClientControl pair, reconstitutes persisted policy
 * and pins, and returns the `FetchService` exo.
 *
 * @param {any} powers - agent-shaped powers granted at provisioning.
 * @param {any} [_context] - caplet lifecycle context. Unused: the minted client
 *   is a stateless request/response capability with no live timers, so caplet
 *   collapse alone tears it down (see `./service.js`).
 * @param {{
 *   env?: Record<string, string>,
 *   fetch?: import('@endo/exo-http-client').FetchLike,
 *   now?: () => number,
 * }} [options] - `env` carries first-run policy initials; `fetch` / `now` are
 *   test seams the production `makeUnconfined` pathway never passes (it supplies
 *   only `env`), so the plugin defaults to the worker's ambient `fetch` / clock.
 * @returns {Promise<import('./types.js').FetchServiceExo>}
 */
export const make = async (powers, _context, { env = {}, fetch, now } = {}) => {
  const storeDirectory = await E(powers).lookup('fetch-store');
  const policyAuthority = await lookupOptional(
    powers,
    'fetch-policy-authority',
  );
  const store = await makeFetchStore(storeDirectory, makeRandomHexId);

  const allowedOrigins = parseOptionalOriginList(env.allowedOrigins);
  const maxRequestsPerMinute = parseOptionalPositiveInteger(
    env.maxRequestsPerMinute,
    'maxRequestsPerMinute',
  );
  const maxResponseBytes = parseOptionalPositiveInteger(
    env.maxResponseBytes,
    'maxResponseBytes',
  );
  /** @type {import("@endo/exo-http-client").PolicyMode | undefined} */
  const policyMode = /** @type {unknown} */ (env.policyMode);

  // @ts-expect-error: spread inference widens policyMode from PolicyMode to string
  const _makeOpts = /** @type {any} */ ({
    store,
    ...(fetch !== undefined ? { fetch } : {}),
    ...(now !== undefined ? { now } : {}),
    ...(allowedOrigins !== undefined ? { allowedOrigins } : {}),
    ...(maxRequestsPerMinute !== undefined ? { maxRequestsPerMinute } : {}),
    ...(maxResponseBytes !== undefined ? { maxResponseBytes } : {}),
    ...(policyMode !== undefined ? { policyMode } : {}),
    ...(policyAuthority !== undefined ? { policyAuthority } : {}),
  });

  const { service } = await makeFetchService(_makeOpts);

  return service;
};
harden(make);
