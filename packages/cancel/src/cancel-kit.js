/// <reference types="ses"/>

/**
 * @import { Cancelled, Cancel, IsCancelled, CancelKit } from './types.js'
 */

/**
 * Creates a cancellation kit containing a cancellation token, a cancel
 * function, and a synchronous observation function.
 *
 * The cancellation token is a `Promise<never>` that will never resolve but may
 * be rejected when cancellation is requested. The `isCancelled` function
 * provides synchronous local observation of cancellation state.
 *
 * If a parent cancellation token is provided, cancellation will automatically
 * propagate from the parent to this kit. If a parent `isCancelled` function
 * is provided and returns true, the child is synchronously cancelled at
 * creation time.
 *
 * This design anticipates a future `Promise.withCanceller` API.
 *
 * @param {Cancelled} [parentCancelled] - Optional parent cancellation token
 * @param {IsCancelled} [parentIsCancelled] - Optional parent synchronous cancellation check
 * @returns {CancelKit}
 */
export const makeCancelKit = (parentCancelled, parentIsCancelled) => {
  /** @type {undefined | true} */
  let cancelledState;

  /** @type {Cancel | undefined} */
  let internalReject;

  const promise = new Promise((_resolve, reject) => {
    internalReject = reject;
  });

  // Prevent unhandled rejection warnings when the promise is not awaited
  promise.catch(() => {});

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

  /** @type {IsCancelled} */
  const isCancelled = () => cancelledState === true;

  // Propagate cancellation from parent if provided
  if (parentCancelled) {
    parentCancelled.then(
      () => {},
      reason => cancel(reason),
    );
  }

  // If parent is already cancelled synchronously, cancel child immediately
  if (parentIsCancelled && parentIsCancelled()) {
    cancel(Error('Cancelled'));
  }

  return harden({ cancelled, cancel, isCancelled });
};
harden(makeCancelKit);
