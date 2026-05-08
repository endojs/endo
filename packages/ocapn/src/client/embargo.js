// @ts-check

/**
 * @import { Settler } from '@endo/eventual-send'
 * @import { Slot } from '../captp/types.js'
 */

import harden from '@endo/harden';
import { ZERO_N, ONE_N } from '@endo/nat';

/**
 * @typedef {object} EmbargoEntry
 * @property {Settler<unknown>} settler
 * @property {unknown} value
 * @property {Slot} slot
 *
 * @typedef {object} EmbargoState
 * @property {(entry: EmbargoEntry) => bigint} allocate
 * @property {(embargoId: bigint) => EmbargoEntry | undefined} take
 * @property {(reason: Error) => void} rejectAll
 * @property {() => number} pendingCount
 */

/**
 * Tracks pending sender-loopback embargos. Each entry holds the settler whose
 * resolution we're delaying along with the locally-hosted value the promise
 * will resolve to. The HandledPromise is left unresolved until the matching
 * receiver-loopback message arrives, which keeps new E() calls flowing through
 * the original promise's handler (and therefore the original network path) so
 * that already-pipelined messages cannot be overtaken.
 *
 * @returns {EmbargoState}
 */
export const makeEmbargoState = () => {
  let nextEmbargoId = ZERO_N;
  /** @type {Map<bigint, EmbargoEntry>} */
  const pending = new Map();

  /**
   * @param {EmbargoEntry} entry
   * @returns {bigint}
   */
  const allocate = entry => {
    const id = nextEmbargoId;
    nextEmbargoId += ONE_N;
    pending.set(id, entry);
    return id;
  };

  /**
   * @param {bigint} embargoId
   * @returns {EmbargoEntry | undefined}
   */
  const take = embargoId => {
    const entry = pending.get(embargoId);
    if (entry === undefined) {
      return undefined;
    }
    pending.delete(embargoId);
    return entry;
  };

  /**
   * @param {Error} reason
   */
  const rejectAll = reason => {
    for (const entry of pending.values()) {
      entry.settler.reject(reason);
    }
    pending.clear();
  };

  const pendingCount = () => pending.size;

  return harden({
    allocate,
    take,
    rejectAll,
    pendingCount,
  });
};
