// @ts-check
/// <reference types="ses"/>

import harden from '@endo/harden';

/**
 * @import { Cancelled, IsCancelled } from './types.js'
 */

import { makeCancelKit } from './cancel-kit.js';

/**
 * Converts an AbortSignal to a cancellation kit for use with Endo cancellation.
 *
 * @param {AbortSignal} signal - The AbortSignal to convert
 * @returns {{ cancelled: Cancelled, isCancelled: IsCancelled }} A cancellation token and synchronous check
 */
export const fromAbortSignal = signal => {
  const { cancelled, cancel, isCancelled } = makeCancelKit();

  // If already aborted, cancel immediately
  if (signal.aborted) {
    cancel(signal.reason);
    return { cancelled, isCancelled };
  }

  signal.addEventListener(
    'abort',
    () => {
      cancel(signal.reason);
    },
    { once: true },
  );

  return { cancelled, isCancelled };
};
harden(fromAbortSignal);
