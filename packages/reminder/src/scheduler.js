// @ts-check
/* global setTimeout, clearTimeout */

/**
 * The `@endo/reminder` message scheduler core. A reminder service produces
 * messages on start-to-start periods and nothing else; policy about what to do
 * on a schedule belongs to the recipient. It carries the behavioral mechanism
 * of the superseded `endoclaw-timer` / interval-scheduler design - the
 * caretaker facet pair, the one-shot per-message response capability,
 * start-to-start timing, resolve/reschedule with jittered exponential backoff,
 * message-timeout auto-resolve, host-controlled limits, pause/resume/revoke,
 * and startup recovery with missed-message coalescing - repackaged as an
 * unconfined plugin. Compared to the daemon formula it superseded, this core:
 *
 * - persists through a virtual-file-system store (`./store.js`,
 *   `@endo/platform/fs/extended`) rather than daemon `filePowers` / `node:fs`,
 *   so the backing may be a directory, a database, or memory;
 * - delivers each reminder message through the injected `onMessage` callback,
 *   which the plugin wires to an eventual-send to the subscriber capability
 *   resolved by name through `powers` (Phase 2 baseline);
 * - takes injectable `setTimeout` / `clearTimeout` / `now` / `random` seams so
 *   tests can drive a deterministic clock and backoff.
 */

import { Far } from '@endo/pass-style';
import { makeExo } from '@endo/exo';
import { ReminderResponseInterface } from './interfaces.js';
import { computeBackoffDelay, resolveBackoff } from './backoff.js';

/** @import { ReminderEntry, ReminderAnnotation, ReminderServicePowers, ReminderService } from './types.js' */

const { isFinite } = Number;

/** Default maximum number of active reminders per service. */
export const DEFAULT_MAX_ACTIVE = 5;

/** Default minimum period in milliseconds. */
export const DEFAULT_MIN_PERIOD_MS = 30_000;

/** Absolute minimum period floor (1 second). */
export const ABSOLUTE_MIN_PERIOD_MS = 1000;

/** Maximum allowed active reminders. */
export const MAX_ACTIVE_CEILING = 100;

/** Maximum allowed period (24 hours). */
export const MAX_PERIOD_MS = 86_400_000;

/**
 * Upper bound on the number of missed firings a single coalesced catch-up
 * delivery stands in for on recovery. It caps the `count`/`timestamps`
 * annotation so a corrupt or pathological far-past `nextTickAt` in the store
 * cannot make recovery build an unbounded array and exhaust worker memory; the
 * schedule still realigns to the true next tick regardless of this cap.
 */
export const MAX_COALESCED_MESSAGES = 10_000;

/**
 * A persisted reminder id becomes a store filename (`<id>.json`), so it must be
 * a single safe path segment. Ids minted by `makeId` are hex; this rejects a
 * corrupt store entry whose `id` carries path separators or traversal (`..`)
 * before it is ever used to name a file.
 */
const SAFE_ID = /^[0-9A-Za-z_-]+$/;

/** The catch-up policies a reminder may carry. */
export const CATCH_UP_POLICIES = ['coalesce', 'skip'];

/** The annotation modes a coalesced message may carry. */
export const ANNOTATION_MODES = ['count', 'timestamps'];

/**
 * Create a reminder service capability pair. Returns
 * `{ service, scheduler, control, stop }`: `service` is the exo the plugin
 * returns (it hands out the two caretaker facets), `scheduler` is the
 * agent-facing `ReminderScheduler` facet, `control` is the integration-facing
 * `ReminderControl` facet, and `stop` is the in-memory teardown for the
 * plugin's cancellation hook.
 *
 * @param {ReminderServicePowers} powers
 * @returns {Promise<ReminderService>}
 */
export const makeReminderService = async powers => {
  const {
    store,
    makeId,
    onMessage,
    onReminderCancel,
    maxActive: envMaxActive = DEFAULT_MAX_ACTIVE,
    minPeriodMs: envMinPeriodMs = DEFAULT_MIN_PERIOD_MS,
    paused: envPaused = false,
    setTimeout:
      setTimer = /** @type {(cb: () => void, ms: number) => unknown} */ (
        setTimeout
      ),
    clearTimeout: clearTimer = /** @type {(handle: unknown) => void} */ (
      clearTimeout
    ),
    now = () => Date.now(),
    random = Math.random,
  } = powers;

  // The durable store is authoritative across restarts; the env-supplied limits
  // are only the initial values at first provisioning. Adopt persisted config
  // when present, otherwise seed the store with the env initials.
  const persistedConfig =
    /** @type {{ maxActive?: number, minPeriodMs?: number, paused?: boolean } | undefined} */ (
      await store.readConfig()
    );
  let maxActive =
    persistedConfig && typeof persistedConfig.maxActive === 'number'
      ? persistedConfig.maxActive
      : envMaxActive;
  let minPeriodMs =
    persistedConfig && typeof persistedConfig.minPeriodMs === 'number'
      ? persistedConfig.minPeriodMs
      : envMinPeriodMs;
  let paused =
    persistedConfig && typeof persistedConfig.paused === 'boolean'
      ? persistedConfig.paused
      : envPaused;
  let revoked = false;

  // Validate the effective initial limits through the same bounds the control
  // setters enforce, so a service cannot come up in a state the setters would
  // reject (e.g. `maxActive: 0`, which would make the `activeCount >= maxActive`
  // check always throw and brick the service).
  if (
    typeof maxActive !== 'number' ||
    !isFinite(maxActive) ||
    maxActive < 1 ||
    maxActive > MAX_ACTIVE_CEILING
  ) {
    throw RangeError(
      `reminder: maxActive must be between 1 and ${MAX_ACTIVE_CEILING}`,
    );
  }
  if (
    typeof minPeriodMs !== 'number' ||
    !isFinite(minPeriodMs) ||
    minPeriodMs < ABSOLUTE_MIN_PERIOD_MS ||
    minPeriodMs > MAX_PERIOD_MS
  ) {
    throw RangeError(
      `reminder: minPeriodMs must be between ${ABSOLUTE_MIN_PERIOD_MS} and ${MAX_PERIOD_MS}`,
    );
  }

  // Mutable state
  /** @type {Map<string, ReminderEntry>} In-memory cache of entries. */
  const entries = new Map();
  /** @type {Map<string, unknown>} Active period timeouts (opaque timer handles). */
  const activeTimeouts = new Map();
  /** @type {Map<string, unknown>} Active message-deadline timeouts. */
  const messageDeadlines = new Map();

  /** Persist the service config (`{ maxActive, minPeriodMs, paused }`). */
  const persistConfig = () =>
    store.writeConfig(harden({ maxActive, minPeriodMs, paused }));

  // Serialize config writes so overlapping control operations (e.g. a rapid
  // pause() then resume()) cannot let their write-then-move races land in the
  // wrong order and persist a stale flag. Each write runs after the prior one
  // settles and reads the latest in-memory values, so the final state wins.
  let configWriteChain = Promise.resolve();
  const persistConfigBackground = () => {
    configWriteChain = configWriteChain
      .then(persistConfig)
      .catch(error =>
        console.error('[reminder] failed to persist config:', error),
      );
    return configWriteChain;
  };

  // Seed config.json on first provisioning so a restart reads it back.
  if (persistedConfig === undefined) {
    await persistConfig();
  }

  /**
   * Persist a reminder entry to the store.
   *
   * @param {ReminderEntry} entry
   */
  const persist = entry => store.writeReminder(entry);

  // Forward declarations for the mutually-recursive message lifecycle.
  /** @type {(entryId: string) => Promise<void>} */
  let onReminderFire;
  /** @type {(entry: ReminderEntry) => void} */
  let onMessageResolved;
  /** @type {(entry: ReminderEntry) => void} */
  let onMessageRescheduled;

  /**
   * Disarm all timeouts for a given entry.
   *
   * @param {string} entryId
   */
  const disarmReminder = entryId => {
    const handle = activeTimeouts.get(entryId);
    if (handle !== undefined) {
      clearTimer(handle);
      activeTimeouts.delete(entryId);
    }
    const deadlineHandle = messageDeadlines.get(entryId);
    if (deadlineHandle !== undefined) {
      clearTimer(deadlineHandle);
      messageDeadlines.delete(entryId);
    }
  };

  /** Disarm every reminder. */
  const disarmAll = () => {
    for (const [id] of activeTimeouts) {
      disarmReminder(id);
    }
    for (const [, handle] of messageDeadlines) {
      clearTimer(handle);
    }
    messageDeadlines.clear();
  };

  /**
   * Arm (or re-arm) a timer for the given entry.
   *
   * @param {ReminderEntry} entry
   */
  const armReminder = entry => {
    disarmReminder(entry.id);
    if (entry.status !== 'active' || paused || revoked) {
      return;
    }
    const delayMs = Math.max(0, entry.nextTickAt - now());
    const handle = setTimer(() => {
      onReminderFire(entry.id).catch(error =>
        console.error(`[reminder] fire error for ${entry.label}:`, error),
      );
    }, delayMs);
    activeTimeouts.set(entry.id, handle);
  };

  /**
   * Compute the annotation payload for a delivered message. For a coalesced
   * catch-up the annotation says what the single message stands in for: a count
   * (`missedMessages` + 1 firings, the default) or the list of scheduled
   * timestamps it represents.
   *
   * @param {ReminderEntry} entry
   * @param {number} scheduledAt
   * @param {number} missedMessages
   * @returns {ReminderAnnotation}
   */
  const computeAnnotation = (entry, scheduledAt, missedMessages) => {
    if (entry.annotation === 'timestamps') {
      /** @type {number[]} */
      const scheduledTimes = [];
      for (let k = missedMessages; k >= 0; k -= 1) {
        scheduledTimes.push(scheduledAt - k * entry.periodMs);
      }
      return harden({ kind: 'timestamps', scheduledTimes });
    }
    return harden({ kind: 'count', count: missedMessages + 1 });
  };

  /**
   * Build and deliver a `reminder-message` for the given entry, arming the
   * per-message deadline timeout.
   *
   * @param {ReminderEntry} entry
   * @param {number} actualAt - actual fire time
   * @param {number} [missedMessages]
   */
  const deliverMessage = (entry, actualAt, missedMessages = 0) => {
    // One-shot ReminderResponse capability. `responded` is a per-DELIVERY latch
    // shared by resolve(), reschedule(), and the message-deadline auto-resolve
    // below: whichever fires first consumes the delivery and every later call  -
    // including a late call after the deadline already auto-resolved - is inert.
    // A reschedule() re-delivers as a fresh response with its own latch, so the
    // retry loop still works, while a stale already-consumed response can never
    // re-enter and force a duplicate message. Because the latch lives with the
    // delivery, no cross-message bookkeeping map is needed.
    let responded = false;
    const consume = () => {
      if (responded) {
        return false;
      }
      responded = true;
      return true;
    };
    const reminderResponse = makeExo(
      'ReminderResponse',
      ReminderResponseInterface,
      {
        resolve() {
          if (consume()) {
            onMessageResolved(entry);
          }
        },
        reschedule() {
          if (consume()) {
            entry.consecutiveFailures += 1;
            onMessageRescheduled(entry);
          }
        },
      },
    );

    const scheduledAt = entry.nextTickAt - entry.periodMs;
    const message = harden({
      type: /** @type {const} */ ('reminder-message'),
      reminderId: entry.id,
      label: entry.label,
      periodMs: entry.periodMs,
      messageNumber: entry.messageCount,
      scheduledAt,
      actualAt,
      missedMessages,
      annotation: computeAnnotation(entry, scheduledAt, missedMessages),
      reminderResponse,
    });

    // Arm the message-deadline timeout (auto-resolve on no response). It
    // consumes the same latch, so a late response on a timed-out message is
    // inert.
    const deadlineHandle = setTimer(() => {
      if (consume()) {
        console.warn(
          `Reminder ${entry.label} message ${entry.messageCount} timed out after ${entry.messageTimeoutMs}ms`,
        );
        onMessageResolved(entry);
      }
    }, entry.messageTimeoutMs);
    messageDeadlines.set(entry.id, deadlineHandle);

    if (onMessage !== undefined) {
      // onMessage may be synchronous (the unit tests) or asynchronous (the
      // eventual-send delivery in the plugin); in either case a failure to
      // deliver must not throw into the timer callback. Keep the `try` tight
      // around the sink call so a SYNCHRONOUS throw is attributed as a callback
      // error, and attach the async handler OUTSIDE it so an ASYNCHRONOUS
      // rejection is attributed distinctly as a delivery error.
      let delivered;
      try {
        delivered = /** @type {unknown} */ (onMessage(message));
      } catch (error) {
        console.error(
          `[reminder] onMessage callback error for ${entry.label}:`,
          error,
        );
      }
      if (
        delivered != null &&
        typeof (/** @type {any} */ (delivered).then) === 'function'
      ) {
        /** @type {Promise<unknown>} */ (delivered).then(undefined, error =>
          console.error(
            `[reminder] onMessage delivery error for ${entry.label}:`,
            error,
          ),
        );
      }
    }
  };

  onReminderFire = async entryId => {
    const entry = entries.get(entryId);
    if (!entry || entry.status !== 'active' || paused || revoked) {
      return;
    }
    const actualAt = now();
    entry.messageCount += 1;
    // Advance nextTickAt to the next period boundary (start-to-start).
    const scheduledAt = entry.nextTickAt;
    entry.nextTickAt = scheduledAt + entry.periodMs;
    await persist(entry);
    // Re-check after the async persist: pause()/cancel()/revoke() may have
    // landed during the await. Delivering now would arm a message-deadline
    // timer that the sweep those paths already ran can no longer clear, and
    // would deliver a message for a reminder that is no longer live.
    if (entry.status !== 'active' || paused || revoked) {
      return;
    }
    deliverMessage(entry, actualAt);
  };

  onMessageResolved = entry => {
    const deadlineHandle = messageDeadlines.get(entry.id);
    if (deadlineHandle !== undefined) {
      clearTimer(deadlineHandle);
      messageDeadlines.delete(entry.id);
    }
    // A resolved message clears the backoff streak.
    entry.consecutiveFailures = 0;
    // If nextTickAt is already past, this arms immediately.
    armReminder(entry);
    persist(entry).catch(error =>
      console.error(
        `[reminder] failed to persist entry ${entry.label}:`,
        error,
      ),
    );
  };

  onMessageRescheduled = entry => {
    const deadlineHandle = messageDeadlines.get(entry.id);
    if (deadlineHandle !== undefined) {
      clearTimer(deadlineHandle);
      messageDeadlines.delete(entry.id);
    }
    // Do not re-arm a retry for a reminder that is no longer live (paused,
    // cancelled, or revoked). Its timers were already disarmed by
    // pause()/cancel()/revoke()/stop(); arming a new one here would leak an
    // orphan timer those paths can no longer clear.
    if (entry.status !== 'active' || paused || revoked) {
      entry.consecutiveFailures = 0;
      return;
    }
    const backoffDelay = computeBackoffDelay(
      entry.consecutiveFailures,
      entry.backoff,
      random,
    );
    const retryAt = now() + backoffDelay;
    // The deadline is measured from the ORIGINAL scheduled time and must stay
    // fixed across retries. onReminderFire advanced nextTickAt by one period
    // when it delivered this message, so `nextTickAt - periodMs` is the original
    // scheduled time here; we restore nextTickAt below before re-delivering so
    // this identity - and thus the deadline - holds on every retry.
    const deadline = entry.nextTickAt - entry.periodMs + entry.messageTimeoutMs;
    if (retryAt >= deadline) {
      onMessageResolved(entry);
      return;
    }
    // Persist the incremented failure streak so backoff survives a restart.
    persist(entry).catch(error =>
      console.error(
        `[reminder] failed to persist backoff for ${entry.label}:`,
        error,
      ),
    );
    // Re-arm - reuse onReminderFire, which re-delivers with the same
    // messageNumber and re-advances nextTickAt by one period. Restore BOTH the
    // message count and nextTickAt so the retry nets out: the message number is
    // unchanged and the schedule does not drift one period forward per retry
    // (which would also let the deadline recede faster than retryAt grows,
    // defeating the give-up bound and rescheduling forever).
    entry.messageCount -= 1;
    entry.nextTickAt -= entry.periodMs;
    // Clear any prior armed handle before overwriting the slot, so a stale
    // timer cannot survive as an orphan.
    const priorHandle = activeTimeouts.get(entry.id);
    if (priorHandle !== undefined) {
      clearTimer(priorHandle);
    }
    const handle = setTimer(() => {
      onReminderFire(entry.id).catch(error =>
        console.error(`[reminder] retry error for ${entry.label}:`, error),
      );
    }, backoffDelay);
    activeTimeouts.set(entry.id, handle);
  };

  /**
   * Normalise an entry read from the store, filling any field a prior schema
   * version omitted with its default. Returns `undefined` for an entry too
   * malformed to arm safely (corruption or schema drift) so recovery skips it
   * rather than arming a runaway timer.
   *
   * @param {any} entry
   * @returns {ReminderEntry | undefined}
   */
  const normaliseEntry = entry => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof entry.id !== 'string' ||
      !SAFE_ID.test(entry.id) ||
      typeof entry.periodMs !== 'number' ||
      !isFinite(entry.periodMs) ||
      // Enforce the same period bounds the create path enforces. A corrupt
      // entry with a sub-floor period would otherwise arm a near-0ms timer that
      // fires in a tight loop; an over-ceiling one exceeds the host timer range.
      /** @type {number} */ (entry.periodMs) < ABSOLUTE_MIN_PERIOD_MS ||
      /** @type {number} */ (entry.periodMs) > MAX_PERIOD_MS ||
      typeof entry.nextTickAt !== 'number' ||
      !isFinite(entry.nextTickAt)
    ) {
      return undefined;
    }
    const messageTimeoutMs =
      typeof entry.messageTimeoutMs === 'number' &&
      isFinite(entry.messageTimeoutMs) &&
      /** @type {number} */ (entry.messageTimeoutMs) > 0
        ? entry.messageTimeoutMs
        : entry.periodMs / 2;
    const catchUpPolicy = CATCH_UP_POLICIES.includes(entry.catchUpPolicy)
      ? entry.catchUpPolicy
      : 'coalesce';
    const annotation = ANNOTATION_MODES.includes(entry.annotation)
      ? entry.annotation
      : 'count';
    let backoff;
    try {
      backoff = resolveBackoff(
        entry.backoff,
        entry.periodMs,
        messageTimeoutMs,
        'recover',
      );
    } catch {
      backoff = resolveBackoff(
        undefined,
        entry.periodMs,
        messageTimeoutMs,
        'recover',
      );
    }
    return /** @type {ReminderEntry} */ ({
      ...entry,
      messageTimeoutMs,
      catchUpPolicy,
      annotation,
      backoff,
      messageCount:
        typeof entry.messageCount === 'number' ? entry.messageCount : 0,
      consecutiveFailures:
        typeof entry.consecutiveFailures === 'number'
          ? entry.consecutiveFailures
          : 0,
      status: entry.status || 'active',
    });
  };

  // Startup recovery
  const recover = async () => {
    const diskEntries = await store.readAllReminders();
    const currentTime = now();
    for (const raw of diskEntries) {
      const entry = normaliseEntry(raw);
      if (entry === undefined) {
        console.warn('[reminder] skipping malformed persisted entry:', raw);
        // eslint-disable-next-line no-continue
        continue;
      }
      entries.set(entry.id, entry);
      // Only active entries are (re-)armed; when paused, entries remain active
      // on disk but stay unarmed until resume().
      if (entry.status === 'active' && !paused) {
        if (entry.nextTickAt <= currentTime) {
          const missedMessages = Math.max(
            0,
            Math.floor((currentTime - entry.nextTickAt) / entry.periodMs),
          );
          // Advance past the missed boundaries to the next future tick.
          entry.nextTickAt += (missedMessages + 1) * entry.periodMs;
          if (entry.catchUpPolicy === 'skip') {
            // Drop the missed messages entirely - the right choice for a
            // "still alive?" heartbeat that gains nothing from replaying the
            // past. No delivery, no message-count bump.
            // eslint-disable-next-line no-await-in-loop
            await persist(entry);
            armReminder(entry);
          } else {
            // Coalesce the missed messages into one catch-up delivery. Cap the
            // coalesced count so a corrupt or pathological far-past nextTickAt
            // cannot make computeAnnotation build an unbounded timestamps array
            // (an OOM on boot from an untrusted store); the schedule already
            // realigned to the true next tick above.
            const coalesced = Math.min(missedMessages, MAX_COALESCED_MESSAGES);
            entry.messageCount += 1;
            // eslint-disable-next-line no-await-in-loop
            await persist(entry);
            // deliverMessage arms the per-message deadline; the next-period
            // timer is armed when this catch-up is resolved/auto-resolved (via
            // onMessageResolved -> armReminder), exactly like a live delivery.
            // Do NOT arm here: armReminder would disarm the deadline just set
            // and arm a period timer concurrent with the outstanding catch-up,
            // breaking the one-shot response latch on every restart-with-downtime.
            deliverMessage(entry, currentTime, coalesced);
          }
        } else {
          armReminder(entry);
        }
      }
    }
  };

  // Validation helpers
  /** @param {string} context */
  const assertNotRevoked = context => {
    if (revoked) {
      throw Error(`Reminder service has been revoked (in ${context})`);
    }
  };

  /**
   * @param {number} periodMs
   * @param {string} context
   */
  const assertValidPeriod = (periodMs, context) => {
    if (typeof periodMs !== 'number' || !isFinite(periodMs)) {
      throw TypeError(`${context}: periodMs must be a finite number`);
    }
    if (periodMs < minPeriodMs) {
      throw RangeError(
        `${context}: periodMs ${periodMs} is below the minimum of ${minPeriodMs}ms`,
      );
    }
    if (periodMs > MAX_PERIOD_MS) {
      throw RangeError(
        `${context}: periodMs ${periodMs} exceeds maximum of ${MAX_PERIOD_MS}ms`,
      );
    }
  };

  /**
   * @param {ReminderEntry} entry
   */
  const makeReminderHandle = entry =>
    Far('Reminder', {
      label: () => entry.label,
      period: () => entry.periodMs,
      async setPeriod(periodMs) {
        assertNotRevoked('Reminder.setPeriod');
        assertValidPeriod(periodMs, 'Reminder.setPeriod');
        entry.periodMs = periodMs;
        entry.messageTimeoutMs = periodMs / 2;
        await persist(entry);
        // Re-arm at the new period only when no message is currently
        // outstanding; re-arming mid-delivery would disarm that message's live
        // deadline and race its still-open one-shot response. With a message
        // outstanding, the new period takes effect on the next arm (after the
        // response resolves).
        if (entry.status === 'active' && !messageDeadlines.has(entry.id)) {
          armReminder(entry);
        }
      },
      async cancel() {
        if (entry.status === 'cancelled') {
          return;
        }
        disarmReminder(entry.id);
        entry.status = 'cancelled';
        // Release any response the recipient issued for this reminder's last
        // outstanding message. A per-reminder cancel has no successor message to
        // supersede that response, so without this hook it lingers pinned until
        // the whole service is collected - a slow leak on a long-lived service
        // with create/cancel churn. The service-wide stop()/revoke() teardown
        // covers the all-at-once case; this covers the one-reminder case.
        if (onReminderCancel !== undefined) {
          onReminderCancel(entry.id);
        }
        await persist(entry);
      },
      info: () => harden({ ...entry }),
      help: () =>
        `Reminder "${entry.label}" (${entry.periodMs}ms period, status: ${entry.status})`,
    });

  // Scheduler facet (agent-facing)
  const scheduler = Far('ReminderScheduler', {
    /**
     * @param {string} label
     * @param {number} periodMs
     * @param {{
     *   firstDelayMs?: number,
     *   messageTimeoutMs?: number,
     *   catchUpPolicy?: 'coalesce' | 'skip',
     *   annotation?: 'count' | 'timestamps',
     *   backoff?: Partial<import('./types.js').ReminderBackoff>,
     * }} [opts]
     */
    async makeReminder(label, periodMs, opts = {}) {
      assertNotRevoked('makeReminder');
      assertValidPeriod(periodMs, 'makeReminder');
      if (typeof label !== 'string' || label.length === 0) {
        throw TypeError('makeReminder: label must be a non-empty string');
      }
      const activeCount = [...entries.values()].filter(
        e => e.status === 'active',
      ).length;
      if (activeCount >= maxActive) {
        throw Error(
          `makeReminder: active reminder limit reached (${maxActive})`,
        );
      }
      const {
        firstDelayMs = 0,
        messageTimeoutMs = periodMs / 2,
        catchUpPolicy = 'coalesce',
        annotation = 'count',
        backoff: backoffOpt,
      } = opts;
      // Validate the timing options the same way periodMs is validated: an
      // unbounded firstDelayMs above the setTimeout ceiling (~24.8 days) would
      // be clamped by the host timer and fire almost immediately instead of
      // after the intended delay, and a non-positive/non-finite messageTimeoutMs
      // would arm the message-deadline at ~0ms and auto-resolve before any
      // recipient could respond.
      if (
        typeof firstDelayMs !== 'number' ||
        !isFinite(firstDelayMs) ||
        firstDelayMs < 0 ||
        firstDelayMs > MAX_PERIOD_MS
      ) {
        throw RangeError(
          `makeReminder: firstDelayMs must be a finite number between 0 and ${MAX_PERIOD_MS}`,
        );
      }
      if (
        typeof messageTimeoutMs !== 'number' ||
        !isFinite(messageTimeoutMs) ||
        messageTimeoutMs <= 0 ||
        messageTimeoutMs > MAX_PERIOD_MS
      ) {
        throw RangeError(
          `makeReminder: messageTimeoutMs must be a finite positive number not exceeding ${MAX_PERIOD_MS}`,
        );
      }
      if (!CATCH_UP_POLICIES.includes(catchUpPolicy)) {
        throw RangeError(
          `makeReminder: catchUpPolicy must be one of ${CATCH_UP_POLICIES.join(', ')}`,
        );
      }
      if (!ANNOTATION_MODES.includes(annotation)) {
        throw RangeError(
          `makeReminder: annotation must be one of ${ANNOTATION_MODES.join(', ')}`,
        );
      }
      const backoff = resolveBackoff(
        backoffOpt,
        periodMs,
        messageTimeoutMs,
        'makeReminder',
      );
      const createdAt = now();
      const id = await makeId();
      /** @type {ReminderEntry} */
      const entry = {
        id,
        label,
        periodMs,
        firstDelayMs,
        messageTimeoutMs,
        nextTickAt: createdAt + firstDelayMs,
        createdAt,
        messageCount: 0,
        status: 'active',
        catchUpPolicy,
        annotation,
        backoff,
        consecutiveFailures: 0,
      };
      entries.set(id, entry);
      await persist(entry);
      armReminder(entry);
      return makeReminderHandle(entry);
    },

    async list() {
      assertNotRevoked('list');
      return harden(
        [...entries.values()]
          .filter(e => e.status !== 'cancelled')
          .map(e => harden({ ...e })),
      );
    },

    help: () =>
      [
        'ReminderScheduler - create and manage periodic reminder messages.',
        '',
        '  makeReminder(label, periodMs, opts?) -> Reminder',
        '    Create a reminder that produces a message every periodMs ms.',
        '    opts.firstDelayMs      - delay before the first message (default 0)',
        '    opts.messageTimeoutMs  - deadline per message (default periodMs/2)',
        '    opts.catchUpPolicy     - coalesce (default) | skip',
        '    opts.annotation        - count (default) | timestamps',
        '    opts.backoff           - { initialMs, maxMs, multiplier, jitterFraction }',
        '',
        '  list() -> ReminderEntry[]',
        '    List all non-cancelled reminders.',
        '',
        `  Limits: maxActive=${maxActive}, minPeriodMs=${minPeriodMs}`,
      ].join('\n'),
  });

  // Control facet (integration-facing)
  const control = Far('ReminderControl', {
    /** @param {number} n */
    setMaxActive(n) {
      if (typeof n !== 'number' || n < 1 || n > MAX_ACTIVE_CEILING) {
        throw RangeError(
          `setMaxActive: n must be between 1 and ${MAX_ACTIVE_CEILING}`,
        );
      }
      maxActive = n;
      persistConfigBackground();
    },

    /** @param {number} ms */
    setMinPeriodMs(ms) {
      if (
        typeof ms !== 'number' ||
        ms < ABSOLUTE_MIN_PERIOD_MS ||
        ms > MAX_PERIOD_MS
      ) {
        throw RangeError(
          `setMinPeriodMs: ms must be between ${ABSOLUTE_MIN_PERIOD_MS} and ${MAX_PERIOD_MS}`,
        );
      }
      minPeriodMs = ms;
      persistConfigBackground();
    },

    pause() {
      if (paused) {
        return;
      }
      paused = true;
      disarmAll();
      persistConfigBackground();
    },

    resume() {
      if (!paused) {
        return;
      }
      paused = false;
      const currentTime = now();
      for (const entry of entries.values()) {
        if (entry.status === 'active') {
          if (entry.nextTickAt <= currentTime) {
            entry.nextTickAt = currentTime;
          }
          armReminder(entry);
        }
      }
      persistConfigBackground();
    },

    revoke() {
      if (revoked) {
        return Promise.resolve();
      }
      revoked = true;
      disarmAll();
      const persistPromises = [];
      for (const entry of entries.values()) {
        if (entry.status !== 'cancelled') {
          entry.status = 'cancelled';
          persistPromises.push(persist(entry));
        }
      }
      return Promise.all(persistPromises).then(
        () => undefined,
        error =>
          console.error('[reminder] failed to persist revocation:', error),
      );
    },

    async listAll() {
      return harden([...entries.values()].map(e => harden({ ...e })));
    },

    help: () =>
      [
        'ReminderControl - integration-side management of a reminder service.',
        '',
        '  setMaxActive(n)     - set maximum active reminders (1-100)',
        `  setMinPeriodMs(ms)  - set minimum period floor (${ABSOLUTE_MIN_PERIOD_MS}-${MAX_PERIOD_MS}ms)`,
        '  pause()             - pause all reminders (disarm timers)',
        '  resume()            - resume all reminders (re-arm timers)',
        '  revoke()            - permanently revoke the service',
        '  listAll()           - list all reminders including cancelled',
      ].join('\n'),
  });

  await recover();

  // Permanent, in-memory teardown for the plugin's cancellation hook. Unlike
  // the bare `disarmAll` (a one-shot sweep), `stop` sets the terminal `revoked`
  // flag so armReminder's guard blocks any re-arm - otherwise a recipient still
  // holding a delivered reminderResponse could call resolve() after the plugin
  // is cancelled/GC'd and resurrect a live recurring timer. It does not persist
  // (the caplet is being collected), unlike the integration-facing revoke().
  const stop = () => {
    revoked = true;
    disarmAll();
  };

  // The service exo hands out the two caretaker facets. It is what the plugin
  // returns and what an integration pins into `@pins` for wake-on-restart.
  const service = Far('ReminderService', {
    scheduler: () => scheduler,
    control: () => control,
    help: () =>
      [
        'ReminderService - a message scheduler.',
        '',
        '  scheduler() -> ReminderScheduler   (agent-facing)',
        '  control()   -> ReminderControl     (integration-facing)',
      ].join('\n'),
  });

  return harden({ service, scheduler, control, stop });
};
harden(makeReminderService);
