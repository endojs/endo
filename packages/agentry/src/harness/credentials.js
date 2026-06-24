// @ts-check
/// <reference types="ses"/>

/* global globalThis */

/**
 * Read the ambient process environment as a plain record. This is the single
 * spot in the harness that reaches for `globalThis.process.env`; every other
 * module goes through a credentials provider (see {@link makeEnvCredentials})
 * so the env dependency stays isolated to one seam.
 *
 * @returns {Record<string, string | undefined>}
 */
export const getAmbientEnv = () =>
  /** @type {{ process?: { env?: Record<string, string | undefined> } }} */ (
    globalThis
  ).process?.env || {};
harden(getAmbientEnv);

/**
 * @param {string | undefined} value
 * @returns {string | undefined}
 */
const nonEmptyString = value =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * @typedef {object} Credentials
 * @property {(name: string) => string | undefined} get Resolve a named secret
 *   (an environment-variable name today) to its value, or `undefined` when it
 *   is unset or empty.
 */

/**
 * Build an environment-backed credentials provider — the harness's one choke
 * point for reading secrets. `get(name)` resolves a key out of the supplied
 * `env` (the ambient process environment by default); a non-string or empty
 * value reads as `undefined`.
 *
 * TODO(secure): swap this env-backed provider for a capability-scoped secret
 * store. Every caller resolves secrets through `.get()`, so that swap is local
 * to this module — a `sandbox()` or a powered stage can inject a different
 * provider without touching call sites.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {Credentials}
 */
export const makeEnvCredentials = (env = getAmbientEnv()) =>
  harden({
    get: name => nonEmptyString(env[name]),
  });
harden(makeEnvCredentials);
