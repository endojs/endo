// @ts-check

/**
 * Reschedule backoff for the reminder scheduler. The parameters are named and
 * persisted per reminder (rather than carried by reference from the superseded
 * `endoclaw-timer` design) so backoff state survives a restart:
 *
 * - `initialMs` - the first retry's base delay.
 * - `maxMs` - the ceiling the exponential growth is clamped to.
 * - `multiplier` - the exponential base (2 reproduces the superseded design).
 * - `jitterFraction` - the width of the full-jitter band as a fraction of the
 *   computed delay. A retry samples uniformly within
 *   `[raw * (1 - jitterFraction), raw]`, de-synchronising retries when several
 *   reminders co-fail against one downstream and would otherwise realign their
 *   backoff on restart (AWS, "Exponential Backoff and Jitter"). A zero fraction
 *   disables jitter, reproducing the superseded design's exact timing.
 *
 * `consecutiveFailures` is persisted alongside these on each reminder so a
 * reschedule after a restart continues from where it left off rather than
 * restarting the exponent at zero.
 */

/** @import { ReminderBackoff } from './types.js' */

/** Default full-jitter band width (10% of the computed delay). */
export const DEFAULT_JITTER_FRACTION = 0.1;

/** Default exponential base. */
export const DEFAULT_BACKOFF_MULTIPLIER = 2;

/**
 * The default backoff parameters for a reminder. Reproduces the superseded
 * `endoclaw-timer` schedule of `min(1000, periodMs / 10) * 2 ** n` clamped to
 * the message timeout, with a nonzero jitter fraction added.
 *
 * @param {number} periodMs
 * @param {number} messageTimeoutMs
 * @returns {ReminderBackoff}
 */
export const defaultBackoff = (periodMs, messageTimeoutMs) =>
  harden({
    initialMs: Math.min(1000, periodMs / 10),
    maxMs: messageTimeoutMs,
    multiplier: DEFAULT_BACKOFF_MULTIPLIER,
    jitterFraction: DEFAULT_JITTER_FRACTION,
  });
harden(defaultBackoff);

const { isFinite } = Number;

/**
 * Validate and normalise a partial backoff override against the defaults for a
 * given period / message timeout. Any field omitted (or `undefined`) falls back
 * to its default; a present but out-of-range field throws so a reminder cannot
 * be created with a backoff that never makes progress or grows without bound.
 *
 * @param {Partial<ReminderBackoff> | undefined} override
 * @param {number} periodMs
 * @param {number} messageTimeoutMs
 * @param {string} context
 * @returns {ReminderBackoff}
 */
export const resolveBackoff = (
  override,
  periodMs,
  messageTimeoutMs,
  context,
) => {
  const base = defaultBackoff(periodMs, messageTimeoutMs);
  const merged = { ...base, ...(override || {}) };
  const { initialMs, maxMs, multiplier, jitterFraction } = merged;
  if (typeof initialMs !== 'number' || !isFinite(initialMs) || initialMs <= 0) {
    throw RangeError(
      `${context}: backoff.initialMs must be a positive finite number`,
    );
  }
  if (typeof maxMs !== 'number' || !isFinite(maxMs) || maxMs < initialMs) {
    throw RangeError(
      `${context}: backoff.maxMs must be a finite number not below initialMs`,
    );
  }
  if (
    typeof multiplier !== 'number' ||
    !isFinite(multiplier) ||
    multiplier < 1
  ) {
    throw RangeError(
      `${context}: backoff.multiplier must be a finite number >= 1`,
    );
  }
  if (
    typeof jitterFraction !== 'number' ||
    !isFinite(jitterFraction) ||
    jitterFraction < 0 ||
    jitterFraction > 1
  ) {
    throw RangeError(
      `${context}: backoff.jitterFraction must be between 0 and 1`,
    );
  }
  return harden({ initialMs, maxMs, multiplier, jitterFraction });
};
harden(resolveBackoff);

/**
 * Compute the delay before the Nth consecutive retry of a reminder message.
 * The raw exponential delay is `initialMs * multiplier ** (n - 1)` clamped to
 * `maxMs`; full jitter then subtracts up to `jitterFraction` of that.
 *
 * @param {number} consecutiveFailures - 1 for the first retry, 2 for the next...
 * @param {ReminderBackoff} backoff
 * @param {() => number} random - uniform [0, 1); injectable for deterministic tests
 * @returns {number}
 */
export const computeBackoffDelay = (consecutiveFailures, backoff, random) => {
  const { initialMs, maxMs, multiplier, jitterFraction } = backoff;
  const exponent = Math.max(0, consecutiveFailures - 1);
  const raw = Math.min(maxMs, initialMs * multiplier ** exponent);
  const jitter = raw * jitterFraction * random();
  return Math.max(0, raw - jitter);
};
harden(computeBackoffDelay);
