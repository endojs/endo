// @ts-check

import harden from '@endo/harden';
import { makeChangeTopic } from './pubsub.js';

/**
 * @typedef {object} RetentionDelta
 * @property {string[]} add
 * @property {string[]} remove
 */

/**
 * @typedef {object} RetentionAccumulator
 * @property {(formulaNumber: string) => void} add
 * @property {(formulaNumber: string) => void} remove
 * @property {() => void} flush
 * @property {() => AsyncGenerator<RetentionDelta>} subscribe
 */

/**
 * Create a retention accumulator that batches formula add/remove
 * events over a scheduling window and emits consolidated deltas.
 *
 * If a formula is added and then removed (or vice versa) within
 * the same batch window, the effects cancel out and no entry for
 * that formula appears in the emitted delta.
 *
 * @param {object} opts
 * @param {string[]} opts.snapshot - The initial set of retained formulas.
 * @param {(flush: () => void) => void} [opts.scheduleBatch] - Schedules a
 *   flush. Defaults to `queueMicrotask`. Injected for testing.
 * @returns {RetentionAccumulator}
 */
export const makeRetentionAccumulator = ({
  snapshot,
  scheduleBatch = fn => void Promise.resolve().then(fn),
}) => {
  /** @type {import('./types.js').Topic<RetentionDelta>} */
  const topic = makeChangeTopic();

  /** @type {Set<string>} */
  const pendingAdd = new Set();
  /** @type {Set<string>} */
  const pendingRemove = new Set();
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    if (pendingAdd.size === 0 && pendingRemove.size === 0) {
      return;
    }
    /** @type {RetentionDelta} */
    const delta = harden({
      add: [...pendingAdd],
      remove: [...pendingRemove],
    });
    pendingAdd.clear();
    pendingRemove.clear();
    topic.publisher.next(delta);
  };

  const scheduleIfNeeded = () => {
    if (!scheduled) {
      scheduled = true;
      scheduleBatch(flush);
    }
  };

  /** @param {string} formulaNumber */
  const add = formulaNumber => {
    if (pendingRemove.has(formulaNumber)) {
      pendingRemove.delete(formulaNumber);
    } else {
      pendingAdd.add(formulaNumber);
    }
    scheduleIfNeeded();
  };

  /** @param {string} formulaNumber */
  const remove = formulaNumber => {
    if (pendingAdd.has(formulaNumber)) {
      pendingAdd.delete(formulaNumber);
    } else {
      pendingRemove.add(formulaNumber);
    }
    scheduleIfNeeded();
  };

  /**
   * Subscribe to the retention stream. Yields the snapshot as
   * the first delta (all adds, no removes), then subsequent
   * consolidated deltas.
   *
   * @returns {AsyncGenerator<RetentionDelta>}
   */
  const subscribe = () => {
    // Subscribe eagerly so no deltas published between
    // subscribe() and the first next() are lost.
    const subscription = topic.subscribe();

    return (async function* retentionDeltas() {
      if (snapshot.length > 0) {
        yield harden({ add: snapshot, remove: [] });
      }

      for await (const delta of subscription) {
        yield delta;
      }
    })();
  };

  return harden({ add, remove, flush, subscribe });
};
harden(makeRetentionAccumulator);
