// @ts-check

/**
 * @module interval
 *
 * EndoClaw interval scheduler — core heartbeat scheduling facility.
 *
 * Re-exports from sub-modules for convenient access.
 */

export { makeIntervalScheduler } from './scheduler.js';

export {
  DEFAULT_MAX_ACTIVE,
  DEFAULT_MIN_PERIOD_MS,
  ABSOLUTE_MIN_PERIOD_MS,
  MAX_ACTIVE_CEILING,
  MAX_PERIOD_MS,
} from './types.js';

export {
  randomHex,
  ensureDir,
  readEntry,
  writeEntry,
  readAllEntries,
  deleteEntry,
} from './persistence.js';
