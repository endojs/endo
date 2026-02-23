/// <reference types="ses"/>

/**
 * @import { Cancelled } from './types.js'
 */

/**
 * Converts a Cancelled token to an AbortSignal for use with web APIs like fetch.
 *
 * @param {Cancelled} cancelled - The cancellation token to convert
 * @returns {AbortSignal} An AbortSignal that aborts when cancelled
 */
export const toAbortSignal = cancelled => {
  const controller = new AbortController();

  cancelled.then(
    () => {},
    reason => controller.abort(reason),
  );

  // If already cancelled, abort immediately
  if (cancelled.cancelled) {
    controller.abort(Error('Cancelled'));
  }

  return controller.signal;
};
harden(toAbortSignal);
