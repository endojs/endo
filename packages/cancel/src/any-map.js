/// <reference types="ses"/>

/**
 * @import { Cancelled, CancellableCallback } from './types.js'
 */

import { makeCancelKit } from './cancel-kit.js';

/**
 * Starts a cancellable job for every value, racing them against each other.
 * When one job succeeds, all pending jobs are cancelled.
 * Only rejects with AggregateError if all jobs reject.
 *
 * @template T
 * @template R
 * @param {Iterable<T>} values - The values to map over
 * @param {CancellableCallback<T, R>} fn - The transformation function
 * @param {Cancelled} [parentCancelled] - Parent cancellation token
 * @returns {Promise<R>}
 */
export const anyMap = async (values, fn, parentCancelled) => {
  const { cancelled, cancel } = makeCancelKit(parentCancelled);

  const valuesArray = [...values];

  if (valuesArray.length === 0) {
    throw AggregateError([], 'No values provided to anyMap');
  }

  /** @type {Promise<R>[]} */
  const promises = valuesArray.map((value, index) =>
    Promise.resolve().then(() => fn(value, index, cancelled)),
  );

  await null; // safe-await-separator
  try {
    // Race all promises - first success wins
    const result = await Promise.any(promises);
    // Cancel remaining operations after first success
    cancel();
    return result;
  } catch (error) {
    // All operations failed - cancel is already triggered by individual failures
    cancel(/** @type {Error} */ (error));
    throw error;
  }
};
harden(anyMap);
