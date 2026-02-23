/// <reference types="ses"/>

/**
 * @import { Cancelled } from './types.js'
 */

import { makeCancelKit } from './cancel-kit.js';

/**
 * Converts an AbortSignal to a Cancelled token for use with Endo cancellation.
 *
 * @param {AbortSignal} signal - The AbortSignal to convert
 * @returns {Cancelled} A Cancelled token that triggers when signal aborts
 */
export const fromAbortSignal = signal => {
  const { cancelled, cancel } = makeCancelKit();

  // If already aborted, cancel immediately
  if (signal.aborted) {
    cancel(signal.reason);
    return cancelled;
  }

  signal.addEventListener(
    'abort',
    () => {
      cancel(signal.reason);
    },
    { once: true },
  );

  return cancelled;
};
harden(fromAbortSignal);
