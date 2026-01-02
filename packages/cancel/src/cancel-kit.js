/// <reference types="ses"/>

/**
 * @import { Cancelled, Cancel, CancelKit } from './types.js'
 */

const { apply } = Reflect;

/**
 * @type {WeakSet<Promise>}
 */
const knownCancelledSet = new WeakSet();
harden(knownCancelledSet);

const thenMethod = Promise.prototype.then;

// TODO more accurate typing of `when`. It is intended to emulate E.when.
/**
 * Since this package has no dependencies, it likely needs to work reliably in
 * a non-ses environment too.
 *
 * @template {any} V
 * @template {any} T
 * @param {Promise<V>} promise
 * @param {(v: V) => T} [onFulfilled]
 * @param {(reason: Error) => T } [onRejected]
 * @returns {Promise<T>}
 */
const when = (promise, onFulfilled = undefined, onRejected = undefined) =>
  apply(thenMethod, promise, [onFulfilled, onRejected]);

/**
 * Says whether a promise, if interpreted as a cancellation token, is known
 * to be cancelled. If the promise was made by the CancelKit, the answer is
 * always immediately accurate.
 *
 * For other promises, we interpret any rejected state as cancelled.
 * For these, the answer is false the first time, since we do not yet know.
 * But once the promise settles, we will eventually
 * have an accurate answer. Thus, if the promise is well behaved,
 * once the answer is ever `true` it should remain `true` forever.
 * A passable promise is necessarily well behaved, so for those, this
 * monotonicity is guaranteed.
 *
 * XXX SECURITY BUG DO NOT MERGE THIS EXPERIMENT
 *
 * The fact that this always says false the first time we ask about an
 * unrelated promise is a global communications channel.
 *
 * @param {Promise} promise
 * @returns {boolean}
 */
export const isKnownCancelled = promise => {
  if (knownCancelledSet.has(promise)) {
    return true;
  }
  when(
    promise,
    _v => {},
    _reason => {
      knownCancelledSet.add(promise);
    },
  );
  return false;
};
harden(isKnownCancelled);

/**
 * Creates a cancellation kit containing a cancellation token and a cancel function.
 *
 * The cancellation token is a `Promise<never>` that will never resolve but may
 * be rejected when cancellation is requested. It also has a synchronous
 * `cancelled` getter that returns `true` if cancellation has been requested,
 * or `undefined` otherwise.
 *
 * If a parent cancellation token is provided, cancellation will automatically
 * propagate from the parent to this kit.
 *
 * This design anticipates a future `Promise.withCanceller` API.
 *
 * @param {Cancelled} [parentCancelled] - Optional parent cancellation token
 * @returns {CancelKit}
 */
export const makeCancelKit = (parentCancelled = undefined) => {
  /** @type {Cancel | undefined} */
  let internalReject;

  /** @type {Cancelled} */
  const cancelled = new Promise((_resolve, reject) => {
    internalReject = reject;
  });

  // Propagate cancellation from parent if provided
  if (parentCancelled) {
    if (isKnownCancelled(parentCancelled)) {
      knownCancelledSet.add(cancelled);
    }
  }

  // Prevent unhandled rejection warnings when the promise is not awaited
  when(cancelled, undefined, () => {});

  /** @type {Cancel} */
  const cancel = reason => {
    const error = reason || Error('Cancelled');
    if (internalReject) {
      internalReject(error);
      internalReject = undefined;
      knownCancelledSet.add(cancelled);
    }
  };

  // Propagate cancellation from parent if provided
  if (parentCancelled) {
    when(
      parentCancelled,
      () => {},
      reason => cancel(reason),
    );
  }

  return harden({ cancelled, cancel });
};
harden(makeCancelKit);
