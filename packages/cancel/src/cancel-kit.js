/// <reference types="ses"/>

/**
 * @import { Cancelled, Cancel, CancelKit } from './types.js'
 */

/**
 * Creates a cancellation kit containing a cancellation token and a cancel function.
 *
 * The cancellation token is a `Promise<never>` that will never resolve but may
 * be rejected when cancellation is requested. It also has a synchronous
 * `cancelled` getter that returns `true` if cancellation has been requested,
 * or `undefined` otherwise.
 *
 * This design anticipates a future `Promise.withCanceller` API.
 *
 * @returns {CancelKit}
 */
export const makeCancelKit = () => {
  /** @type {undefined | true} */
  let cancelledState;

  /** @type {Cancel | undefined} */
  let internalReject;

  const promise = new Promise((_resolve, reject) => {
    internalReject = reject;
  });

  // Prevent unhandled rejection warnings when the promise is not awaited
  promise.catch(() => {});

  // Define the cancelled getter on the promise
  Object.defineProperty(promise, 'cancelled', {
    get() {
      return cancelledState;
    },
    enumerable: false,
    configurable: false,
  });

  /** @type {Cancelled} */
  const cancelled = /** @type {Cancelled} */ (promise);

  /** @type {Cancel} */
  const cancel = reason => {
    if (cancelledState === undefined) {
      cancelledState = true;
      const error = reason || Error('Cancelled');
      if (internalReject) {
        internalReject(error);
        internalReject = undefined;
      }
    }
  };

  return harden({ cancelled, cancel });
};
harden(makeCancelKit);
