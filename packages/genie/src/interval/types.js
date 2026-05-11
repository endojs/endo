// @ts-check

/**
 * @module interval/types
 *
 * Shape definitions and constants for the interval scheduler.
 * These will become M.interface() guards when graduated to the daemon.
 */

/**
 * @typedef {'active' | 'paused' | 'cancelled'} IntervalStatus
 */

/**
 * @typedef {object} IntervalEntry
 * @property {string} id
 * @property {string} label
 * @property {number} periodMs
 * @property {number} firstDelayMs
 * @property {number} tickTimeoutMs
 * @property {number} nextTickAt - epoch ms of next scheduled tick
 * @property {number} createdAt - epoch ms when created
 * @property {number} tickCount - total ticks fired
 * @property {IntervalStatus} status
 */

/**
 * @typedef {object} IntervalHandle
 * @property {() => string} label
 * @property {() => number} period
 * @property {(periodMs: number) => Promise<void>} setPeriod
 * @property {() => Promise<void>} cancel
 * @property {() => IntervalEntry} info
 * @property {() => string} help
 */

/**
 * @typedef {object} TickResponseHandle
 * @property {() => void} resolve
 * @property {() => void} reschedule
 */

/**
 * @typedef {object} IntervalTickMessage
 * @property {'interval-tick'} type
 * @property {string} intervalId
 * @property {string} label
 * @property {number} periodMs
 * @property {number} tickNumber - 1-indexed count for this interval
 * @property {number} scheduledAt - intended fire time (epoch ms)
 * @property {number} actualAt - actual fire time (epoch ms)
 * @property {number} missedTicks - ticks missed during downtime (0 normally)
 * @property {TickResponseHandle} tickResponse - ref to TickResponse capability
 */

/**
 * @typedef {object} IntervalSchedulerFacet
 * @property {(label: string, periodMs: number, opts?: {firstDelayMs?: number, tickTimeoutMs?: number}) => Promise<IntervalHandle>} makeInterval
 * @property {() => Promise<IntervalEntry[]>} list
 * @property {() => string} help
 */

/**
 * @typedef {object} IntervalControlFacet
 * @property {(n: number) => void} setMaxActive
 * @property {(ms: number) => void} setMinPeriodMs
 * @property {() => void} pause
 * @property {() => void} resume
 * @property {() => void} revoke
 * @property {() => Promise<IntervalEntry[]>} listAll
 * @property {() => string} help
 */

/**
 * @typedef {object} IntervalSchedulerConfig
 * @property {number} [maxActive] - Maximum active intervals (default 5)
 * @property {number} [minPeriodMs] - Minimum period in ms (default 30000)
 * @property {string} [persistDir] - Directory for persisting interval entries
 * @property {(msg: IntervalTickMessage) => void} [onTick] - Callback for tick delivery
 */

/** Default maximum number of active intervals per scheduler. */
const DEFAULT_MAX_ACTIVE = 5;

/** Default minimum period in milliseconds. */
const DEFAULT_MIN_PERIOD_MS = 30_000;

/** Absolute minimum period floor (1 second). */
const ABSOLUTE_MIN_PERIOD_MS = 1_000;

/** Maximum allowed active intervals. */
const MAX_ACTIVE_CEILING = 100;

/** Maximum allowed period (24 hours). */
const MAX_PERIOD_MS = 86_400_000;

export {
  DEFAULT_MAX_ACTIVE,
  DEFAULT_MIN_PERIOD_MS,
  ABSOLUTE_MIN_PERIOD_MS,
  MAX_ACTIVE_CEILING,
  MAX_PERIOD_MS,
};
