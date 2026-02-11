/// <reference types="ses"/>

/**
 * @import { Cancelled, CancellableCallback } from './types.js'
 */

import { makeCancelKit } from './cancel-kit.js';

/**
 * Maps over values performing a cancellable transformation on each.
 * If any individual operation rejects, all pending operations are cancelled.
 * Returns a promise for an array of transformed values.
 *
 * @template T
 * @template R
 * @param {Iterable<T>} values - The values to map over
 * @param {CancellableCallback<T, R>} fn - The transformation function
 * @param {Cancelled} parentCancelled - Parent cancellation token
 * @returns {Promise<R[]>}
 */
export const allMap = async (values, fn, parentCancelled) => {
  const { cancelled, cancel } = makeCancelKit(parentCancelled);

  const valuesArray = [...values];

  /** @type {Promise<R>[]} */
  const promises = valuesArray.map((value, index) =>
    Promise.resolve().then(() => fn(value, index, cancelled)),
  );

  await null; // safe-await-separator
  try {
    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    // Cancel all pending operations on first rejection
    cancel(/** @type {Error} */ (error));
    throw error;
  }
};
harden(allMap);
