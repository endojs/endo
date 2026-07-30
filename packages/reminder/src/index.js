// @ts-check

/**
 * `@endo/reminder` - an unconfined Endo plugin that schedules messages.
 *
 * The plugin module exports the standard unconfined-caplet maker,
 * `make(powers, context, { env })`, provisioned through the daemon's generic
 * pathway:
 *
 * ```
 * E(host).makeUnconfined(workerName, '@endo/reminder', { powersName, resultName })
 * ```
 *
 * `powers` is agent-shaped (typically a dedicated guest). The plugin resolves
 * everything it needs by name through it and holds no ambient authority beyond
 * the Node worker it runs in:
 *
 * - `E(powers).lookup('reminder-store')` -> a writable virtual-file-system
 *   directory backing the durable store (`./store.js`). The backing may be a
 *   host directory, an in-memory tree, a daemon mount, or a database.
 * - `E(powers).lookup('reminder-recipient')` -> the subscriber capability the
 *   service is bound to. Phase 2 delivers each reminder message by eventual-send
 *   to `E(recipient).notify(message)`, carrying the one-shot `ReminderResponse`
 *   as an argument. Because the capability is re-resolved by name on every
 *   `make()`, it is re-obtained on restart rather than held only in memory, so
 *   nothing durable passes through a mailbox - which is why the Phase 2 baseline
 *   needs no SturdyRef modelling.
 *
 * Initial `maxActive` / `minPeriodMs` (and an optional initial `paused`) arrive
 * via the `env` option of `makeUnconfined`; thereafter `ReminderControl` adjusts
 * them and the durable store persists them, so the store - not `env` - is
 * authoritative across restarts.
 *
 * Wake-on-restart is integration-owned retention of a live reference: the
 * provisioning integration pins the service (`resultName: ['@pins', 'reminder']`
 * for the reference host), so `revivePins()` provides its identifier at boot,
 * the worker incarnates the plugin, and `make()` runs recovery. See the README.
 */

import { E } from '@endo/eventual-send';
import { makeReminderStore } from './store.js';
import { makeReminderService } from './scheduler.js';

export { makeReminderService } from './scheduler.js';
export { makeReminderStore } from './store.js';
export { ReminderResponseInterface } from './interfaces.js';
export {
  computeBackoffDelay,
  resolveBackoff,
  defaultBackoff,
} from './backoff.js';

/**
 * Generate a 128-bit random-hex identifier. Reminder ids and durable-store
 * temporary-file suffixes both draw from this; a random id gives unique filenames
 * without a content-address round-trip, matching the daemon's random-hex id
 * discipline (design open question 1).
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
 * Parse a non-negative integer from a formula-env string, or `undefined` if the
 * key is absent. Throws on a present-but-invalid value so a misconfigured
 * provisioning fails loudly rather than silently defaulting.
 *
 * @param {string | undefined} value
 * @param {string} name
 * @returns {number | undefined}
 */
const parseOptionalInteger = (value, name) => {
  if (value === undefined) {
    return undefined;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw Error(`@endo/reminder: env.${name} must be a non-negative integer`);
  }
  return n;
};

/**
 * Unconfined-caplet entry point. Builds the reminder service over the VFS store
 * and the subscriber-capability delivery path, runs startup recovery, and
 * returns the `ReminderService` exo.
 *
 * @param {any} powers - agent-shaped powers granted at provisioning.
 * @param {any} [context] - caplet lifecycle context; its cancellation tears
 *   down the service's timers.
 * @param {{ env?: Record<string, string> }} [options]
 * @returns {Promise<import('./types.js').ReminderServiceExo>}
 */
export const make = async (powers, context, { env = {} } = {}) => {
  const storeDirectory = await E(powers).lookup('reminder-store');
  const recipient = await E(powers).lookup('reminder-recipient');
  const store = await makeReminderStore(storeDirectory, makeRandomHexId);

  const maxActive = parseOptionalInteger(env.maxActive, 'maxActive');
  const minPeriodMs = parseOptionalInteger(env.minPeriodMs, 'minPeriodMs');
  const paused = env.paused === 'true' ? true : undefined;

  const { service, stop } = await makeReminderService({
    store,
    makeId: makeRandomHexId,
    // Phase 2 delivery baseline: eventual-send to the subscriber capability,
    // carrying the one-shot ReminderResponse on the message. Retains no durable
    // capability, so no SturdyRef gate.
    onMessage: message => E(recipient).notify(message),
    ...(maxActive !== undefined ? { maxActive } : {}),
    ...(minPeriodMs !== undefined ? { minPeriodMs } : {}),
    ...(paused !== undefined ? { paused } : {}),
  });

  // Tear down live timers when the caplet is cancelled/GC'd, so a recipient
  // still holding a delivered ReminderResponse cannot resurrect a timer.
  if (context !== undefined) {
    E(context)
      .whenCancelled()
      .catch(() => {})
      .then(() => stop());
  }

  return service;
};
harden(make);
