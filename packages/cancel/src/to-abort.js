// @ts-check
/// <reference types="ses"/>

import harden from '@endo/harden';
import { makeError, X } from '@endo/errors';

/**
 * @import { Cancelled, IsCancelled } from './types.js'
 */

/**
 * Converts a Cancelled token to an AbortSignal for use with web APIs like fetch.
 *
 * @param {Cancelled} cancelled - The cancellation token to convert
 * @param {IsCancelled} [isCancelled] - Optional synchronous cancellation check
 * @returns {AbortSignal} An AbortSignal that aborts when cancelled
 */
export const toAbortSignal = (cancelled, isCancelled) => {
  const controller = new AbortController();

  cancelled.then(
    () => {},
    reason => controller.abort(reason),
  );

  // If already cancelled, abort immediately
  if (isCancelled && isCancelled()) {
    controller.abort(makeError(X`Cancelled`));
  }

  return controller.signal;
};
harden(toAbortSignal);
