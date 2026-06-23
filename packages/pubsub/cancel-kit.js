// @ts-check
/// <reference types="ses"/>

/** @import { PromiseKit } from '@endo/promise-kit' */
/** @import { CancelKit } from './types.js' */

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';

/**
 * Creates a cancellation kit.
 *
 * A cancellation kit is a record `{ cancel, cancelled }` where `cancelled` is
 * a promise of `never` and `cancel(reason)` rejects that promise with the
 * supplied reason.
 *
 * Calls to `cancel` after the first are no-ops.
 * Consumers that race against `cancelled` observe a single, idempotent
 * cancellation event.
 *
 * The shape mirrors the daemon's existing `Context['cancel']` /
 * `Context['cancelled']` discipline, lifted out so packages that need only
 * the cancellation surface do not import the entire context machinery.
 *
 * @returns {CancelKit}
 */
export const makeCancelKit = () => {
  const { promise: cancelled, reject } = /** @type {PromiseKit<never>} */ (
    makePromiseKit()
  );
  // Suppress unhandled-rejection noise for consumers that observe cancellation
  // by `await`ing or `Promise.race`ing rather than by `.catch`ing.
  cancelled.catch(() => {});
  let done = false;
  /** @type {(reason?: Error) => void} */
  const cancel = reason => {
    if (done) return;
    done = true;
    reject(reason || harden(new Error('Cancelled')));
  };
  return harden({ cancel, cancelled });
};
harden(makeCancelKit);
