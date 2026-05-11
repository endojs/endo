// @ts-check

/**
 * @module interval/scheduler
 *
 * Core interval scheduler implementing the EndoClaw timer design.
 * Provides start-to-start interval scheduling with tick delivery,
 * resolve/reschedule semantics, exponential backoff, and persistence.
 *
 * This is a first implementation inside @endo/genie. The interfaces
 * follow the design doc so the code can graduate to the daemon as
 * a proper exo with M.interface() guards.
 */

/** @import { IntervalEntry, IntervalHandle, TickResponseHandle, IntervalTickMessage, IntervalSchedulerFacet, IntervalControlFacet, IntervalSchedulerConfig } from './types.js' */

import harden from '@endo/harden';

import { clearTimeout, setTimeout } from 'node:timers';

import {
  DEFAULT_MAX_ACTIVE,
  DEFAULT_MIN_PERIOD_MS,
  ABSOLUTE_MIN_PERIOD_MS,
  MAX_ACTIVE_CEILING,
  MAX_PERIOD_MS,
} from './types.js';

import {
  randomHex,
  ensureDir,
  writeEntry,
  readAllEntries,
} from './persistence.js';

/**
 * Create an interval scheduler capability pair.
 *
 * Returns `{ scheduler, schedulerControl }` — the scheduler facet is
 * granted to the agent while the control facet is retained by the host.
 *
 * @param {IntervalSchedulerConfig} [config]
 * @returns {Promise<{ scheduler: IntervalSchedulerFacet, schedulerControl: IntervalControlFacet }>}
 */
const makeIntervalScheduler = async (config = {}) => {
  const {
    maxActive: initialMaxActive = DEFAULT_MAX_ACTIVE,
    minPeriodMs: initialMinPeriodMs = DEFAULT_MIN_PERIOD_MS,
    persistDir,
    onTick,
  } = config;

  // ── Mutable state ───────────────────────────────────────────────
  let maxActive = initialMaxActive;
  let minPeriodMs = initialMinPeriodMs;
  let paused = false;
  let revoked = false;

  /** @type {Map<string, IntervalEntry>} In-memory cache of entries. */
  const entries = new Map();

  /** @type {Map<string, ReturnType<typeof setTimeout>>} Active tick timeouts. */
  const activeTimeouts = new Map();

  /** @type {Map<string, ReturnType<typeof setTimeout>>} Active tick-deadline timeouts. */
  const tickDeadlines = new Map();

  /** @type {Map<string, number>} Per-tick reschedule counters keyed by `${id}:${tickCount}`. */
  const rescheduleCounts = new Map();

  /** @type {Map<string, boolean>} Tracks whether a tick response has been consumed. */
  const tickResponseConsumed = new Map();

  // ── Persistence helpers ─────────────────────────────────────────

  /** Directory for interval entry files, or `undefined` for in-memory only. */
  const intervalsDir = persistDir;

  /**
   * Persist an entry to disk if a persist directory is configured.
   *
   * @param {IntervalEntry} entry
   */
  const persist = async entry => {
    await Promise.resolve();
    if (intervalsDir) {
      await writeEntry(intervalsDir, entry);
    }
  };

  // ── Tick delivery ───────────────────────────────────────────────

  /**
   * Build and deliver an `interval-tick` message for the given entry.
   *
   * @param {IntervalEntry} entry
   * @param {number} now - actual fire time
   * @param {number} [missedTicks]
   */
  const deliverTick = (entry, now, missedTicks = 0) => {
    const tickKey = `${entry.id}:${entry.tickCount}`;

    // Create one-shot TickResponse capability.
    /** @type {TickResponseHandle} */
    const tickResponse = harden({
      resolve() {
        if (tickResponseConsumed.get(tickKey)) {
          return; // already consumed — no-op
        }
        tickResponseConsumed.set(tickKey, true);
        onTickResolved(entry);
      },
      reschedule() {
        if (tickResponseConsumed.get(tickKey)) {
          return; // already consumed — no-op
        }
        const count = (rescheduleCounts.get(tickKey) || 0) + 1;
        rescheduleCounts.set(tickKey, count);
        onTickRescheduled(entry, count);
      },
    });

    /** @type {IntervalTickMessage} */
    const message = harden({
      type: 'interval-tick',
      intervalId: entry.id,
      label: entry.label,
      periodMs: entry.periodMs,
      tickNumber: entry.tickCount,
      scheduledAt: entry.nextTickAt - entry.periodMs, // the tick we just fired
      actualAt: now,
      missedTicks,
      tickResponse,
    });

    // Arm tick-deadline timeout.
    const deadlineHandle = setTimeout(() => {
      if (!tickResponseConsumed.get(tickKey)) {
        tickResponseConsumed.set(tickKey, true);
        console.warn(
          `Interval ${entry.label} tick ${entry.tickCount} timed out after ${entry.tickTimeoutMs}ms`,
        );
        onTickResolved(entry);
      }
    }, entry.tickTimeoutMs);
    tickDeadlines.set(entry.id, deadlineHandle);

    // Deliver through callback.
    if (onTick) {
      try {
        onTick(message);
      } catch (err) {
        console.error(
          `[IntervalScheduler] onTick callback error for ${entry.label}:`,
          err,
        );
      }
    }
  };

  // ── Timer arming ────────────────────────────────────────────────

  /**
   * Arm (or re-arm) a setTimeout for the given entry.
   *
   * @param {IntervalEntry} entry
   */
  const armInterval = entry => {
    disarmInterval(entry.id);
    if (entry.status !== 'active' || paused || revoked) {
      return;
    }
    const now = Date.now();
    const delay = Math.max(0, entry.nextTickAt - now);
    const handle = setTimeout(() => onIntervalTick(entry.id), delay);
    activeTimeouts.set(entry.id, handle);
  };

  /**
   * Disarm all timeouts for a given entry.
   *
   * @param {string} entryId
   */
  const disarmInterval = entryId => {
    const handle = activeTimeouts.get(entryId);
    if (handle !== undefined) {
      clearTimeout(handle);
      activeTimeouts.delete(entryId);
    }
    const deadlineHandle = tickDeadlines.get(entryId);
    if (deadlineHandle !== undefined) {
      clearTimeout(deadlineHandle);
      tickDeadlines.delete(entryId);
    }
  };

  /** Disarm every interval. */
  const disarmAll = () => {
    for (const [id] of activeTimeouts) {
      disarmInterval(id);
    }
    // Also clear any remaining deadlines not covered above.
    for (const [, h] of tickDeadlines) {
      clearTimeout(h);
    }
    tickDeadlines.clear();
  };

  // ── Tick event handlers ─────────────────────────────────────────

  /**
   * Fired when a setTimeout for an interval elapses.
   *
   * @param {string} entryId
   */
  const onIntervalTick = async entryId => {
    const entry = entries.get(entryId);
    if (!entry || entry.status !== 'active' || paused || revoked) {
      return;
    }

    const now = Date.now();
    entry.tickCount += 1;

    // Advance nextTickAt to the next period boundary (start-to-start).
    const scheduledAt = entry.nextTickAt;
    entry.nextTickAt = scheduledAt + entry.periodMs;
    await persist(entry);

    deliverTick(entry, now);
  };

  /**
   * Called when the agent resolves a tick.
   *
   * @param {IntervalEntry} entry
   */
  const onTickResolved = entry => {
    // Cancel the deadline timeout.
    const deadlineHandle = tickDeadlines.get(entry.id);
    if (deadlineHandle !== undefined) {
      clearTimeout(deadlineHandle);
      tickDeadlines.delete(entry.id);
    }

    // Clean up reschedule state for this tick.
    const tickKey = `${entry.id}:${entry.tickCount}`;
    rescheduleCounts.delete(tickKey);

    // If nextTickAt is already past, fire immediately; otherwise arm.
    armInterval(entry);

    // Persist to capture updated tickCount / nextTickAt.
    persist(entry).catch(err =>
      console.error(
        `[IntervalScheduler] Failed to persist entry ${entry.label}:`,
        err,
      ),
    );
  };

  /**
   * Called when the agent reschedules a tick (transient failure).
   *
   * @param {IntervalEntry} entry
   * @param {number} rescheduleCount
   */
  const onTickRescheduled = (entry, rescheduleCount) => {
    // Cancel deadline timeout — a new one will be set on retry delivery.
    const deadlineHandle = tickDeadlines.get(entry.id);
    if (deadlineHandle !== undefined) {
      clearTimeout(deadlineHandle);
      tickDeadlines.delete(entry.id);
    }

    const baseBackoff = Math.min(1000, entry.periodMs / 10);
    const backoffDelay = Math.min(
      baseBackoff * 2 ** (rescheduleCount - 1),
      entry.tickTimeoutMs,
    );
    const now = Date.now();
    const retryAt = now + backoffDelay;
    // The deadline is measured from the original scheduled time.
    const deadline = entry.nextTickAt - entry.periodMs + entry.tickTimeoutMs;

    if (retryAt >= deadline) {
      // Backoff would exceed deadline; auto-resolve instead.
      onTickResolved(entry);
      return;
    }

    // Arm retry — reuse onIntervalTick which will deliver a fresh tick.
    // We decrement tickCount so the retry gets the same tickNumber.
    entry.tickCount -= 1;
    const handle = setTimeout(() => onIntervalTick(entry.id), backoffDelay);
    activeTimeouts.set(entry.id, handle);
  };

  // ── Startup recovery ───────────────────────────────────────────

  /**
   * Recover intervals from disk on startup.
   * Call this after construction if persistence is enabled.
   */
  const recover = async () => {
    await Promise.resolve();

    if (!intervalsDir) {
      return;
    }
    await ensureDir(intervalsDir);
    const diskEntries = await readAllEntries(intervalsDir);
    const now = Date.now();

    for await (const entry of diskEntries) {
      entries.set(entry.id, entry);

      if (entry.status !== 'active' || paused) {
        // Nothing to arm.
        // eslint-disable-next-line no-continue
        continue;
      }

      if (entry.nextTickAt <= now) {
        // Missed ticks during downtime.
        const missedTicks = Math.max(
          0,
          Math.floor((now - entry.nextTickAt) / entry.periodMs),
        );
        // Advance to next future boundary.
        entry.nextTickAt += (missedTicks + 1) * entry.periodMs;
        entry.tickCount += 1;
        await persist(entry);

        // Deliver a single catch-up tick.
        deliverTick(entry, now, missedTicks);
      }

      armInterval(entry);
    }
  };

  // ── Validation helpers ──────────────────────────────────────────

  /** @param {string} ctx */
  const assertNotRevoked = ctx => {
    if (revoked) {
      throw Error(`Interval scheduler has been revoked (in ${ctx})`);
    }
  };

  /**
   * @param {number} periodMs
   * @param {string} ctx
   */
  const assertValidPeriod = (periodMs, ctx) => {
    if (typeof periodMs !== 'number' || !Number.isFinite(periodMs)) {
      throw TypeError(`${ctx}: periodMs must be a finite number`);
    }
    if (periodMs < minPeriodMs) {
      throw RangeError(
        `${ctx}: periodMs ${periodMs} is below the minimum of ${minPeriodMs}ms`,
      );
    }
    if (periodMs > MAX_PERIOD_MS) {
      throw RangeError(
        `${ctx}: periodMs ${periodMs} exceeds maximum of ${MAX_PERIOD_MS}ms`,
      );
    }
  };

  // ── IntervalHandle factory ──────────────────────────────────────

  /**
   * Create an IntervalHandle for a given entry.
   *
   * @param {IntervalEntry} entry
   * @returns {IntervalHandle}
   */
  const makeIntervalHandle = entry =>
    harden({
      label() {
        return entry.label;
      },
      period() {
        return entry.periodMs;
      },
      async setPeriod(periodMs) {
        assertNotRevoked('Interval.setPeriod');
        assertValidPeriod(periodMs, 'Interval.setPeriod');
        entry.periodMs = periodMs;
        // Default tickTimeoutMs to half the new period.
        entry.tickTimeoutMs = periodMs / 2;
        await persist(entry);
        // Re-arm with updated period.
        if (entry.status === 'active') {
          armInterval(entry);
        }
      },
      async cancel() {
        if (entry.status === 'cancelled') {
          return; // idempotent
        }
        disarmInterval(entry.id);
        entry.status = 'cancelled';
        await persist(entry);
      },
      info() {
        return harden({ ...entry });
      },
      help() {
        return `Interval "${entry.label}" (${entry.periodMs}ms period, status: ${entry.status})`;
      },
    });

  // ── Scheduler facet (agent-facing) ──────────────────────────────

  /** @type {IntervalSchedulerFacet} */
  const scheduler = harden({
    async makeInterval(label, periodMs, opts = {}) {
      await Promise.resolve();

      assertNotRevoked('makeInterval');
      assertValidPeriod(periodMs, 'makeInterval');

      // Enforce maxActive.
      const activeCount = [...entries.values()].filter(
        e => e.status === 'active',
      ).length;
      if (activeCount >= maxActive) {
        throw Error(
          `makeInterval: active interval limit reached (${maxActive})`,
        );
      }

      if (typeof label !== 'string' || label.length === 0) {
        throw TypeError('makeInterval: label must be a non-empty string');
      }

      const { firstDelayMs = 0, tickTimeoutMs = periodMs / 2 } = opts;

      const now = Date.now();
      const id = randomHex();

      /** @type {IntervalEntry} */
      const entry = {
        id,
        label,
        periodMs,
        firstDelayMs,
        tickTimeoutMs,
        nextTickAt: now + firstDelayMs,
        createdAt: now,
        tickCount: 0,
        status: 'active',
      };

      entries.set(id, entry);

      if (intervalsDir) {
        await ensureDir(intervalsDir);
      }
      await persist(entry);

      // Arm the first tick.
      armInterval(entry);

      return makeIntervalHandle(entry);
    },

    async list() {
      assertNotRevoked('list');
      return harden(
        [...entries.values()]
          .filter(e => e.status !== 'cancelled')
          .map(e => harden({ ...e })),
      );
    },

    help() {
      return [
        'IntervalScheduler — create and manage periodic wakeup intervals.',
        '',
        '  makeInterval(label, periodMs, opts?) → Interval',
        '    Create a new interval that fires every periodMs milliseconds.',
        '    opts.firstDelayMs  — delay before first tick (default 0)',
        '    opts.tickTimeoutMs — deadline per tick (default periodMs/2)',
        '',
        '  list() → IntervalEntry[]',
        '    List all non-cancelled intervals.',
        '',
        `  Limits: maxActive=${maxActive}, minPeriodMs=${minPeriodMs}`,
      ].join('\n');
    },
  });

  // ── Control facet (host-facing) ─────────────────────────────────

  /** @type {IntervalControlFacet} */
  const schedulerControl = harden({
    setMaxActive(n) {
      if (typeof n !== 'number' || n < 1 || n > MAX_ACTIVE_CEILING) {
        throw RangeError(
          `setMaxActive: n must be between 1 and ${MAX_ACTIVE_CEILING}`,
        );
      }
      maxActive = n;
    },

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
    },

    pause() {
      if (paused) {
        return;
      }
      paused = true;
      disarmAll();
    },

    resume() {
      if (!paused) {
        return;
      }
      paused = false;
      const now = Date.now();
      for (const entry of entries.values()) {
        if (entry.status === 'active') {
          // Re-compute nextTickAt relative to now.
          if (entry.nextTickAt <= now) {
            entry.nextTickAt = now;
          }
          armInterval(entry);
        }
      }
    },

    revoke() {
      if (revoked) {
        return;
      }
      revoked = true;
      disarmAll();
      // Mark all entries cancelled.
      const persistPromises = [];
      for (const entry of entries.values()) {
        if (entry.status !== 'cancelled') {
          entry.status = 'cancelled';
          persistPromises.push(persist(entry));
        }
      }
      // Fire-and-forget persistence — revoke is synchronous per the design.
      Promise.all(persistPromises).catch(err =>
        console.error('[IntervalScheduler] Failed to persist revocation:', err),
      );
    },

    async listAll() {
      return harden([...entries.values()].map(e => harden({ ...e })));
    },

    help() {
      return [
        'IntervalControl — host-side management of an interval scheduler.',
        '',
        '  setMaxActive(n)     — set maximum active intervals (1-100)',
        `  setMinPeriodMs(ms)  — set minimum period floor (${ABSOLUTE_MIN_PERIOD_MS}-${MAX_PERIOD_MS}ms)`,
        '  pause()             — pause all intervals (disarm timers)',
        '  resume()            — resume all intervals (re-arm timers)',
        '  revoke()            — permanently revoke the scheduler',
        '  listAll()           — list all intervals including cancelled',
      ].join('\n');
    },
  });

  // ── Recover persisted state ─────────────────────────────────────
  await recover();

  return harden({ scheduler, schedulerControl });
};
harden(makeIntervalScheduler);

export { makeIntervalScheduler };
