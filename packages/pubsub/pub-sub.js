// @ts-check
/// <reference types="ses"/>

/** @import { AsyncSink, AsyncSpring } from '@endo/stream' */
/** @import { PromiseKit } from '@endo/promise-kit' */

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';

// TypeScript ReadOnly semantics are not sufficiently expressive to distinguish
// a value one promises not to alter from a value one must not alter,
// making it useless.
const freeze = /** @type {<T>(v: T | Readonly<T>) => T} */ (Object.freeze);

/**
 * @template TValue
 * @typedef {{value: TValue, promise: Promise<unknown>}} PubSubNode
 */

/**
 * Builds a sink and a spring factory over a shared async promise linked list.
 *
 * The publisher (the sink) calls `put(value)` to extend the linked list with a
 * new node whose `value` is the published value and whose `promise` is the
 * tail awaiting the next publication.
 * Each call to `sub()` returns an independent spring (`{ get }`) that
 * advances its own cursor through the linked list.
 * A spring created after the producer has already published several values
 * begins its cursor at the *next* node, not at the head, matching the
 * lossless-deltas semantics of `makeChangeTopic`.
 *
 * The mechanism is the same one the now-removed `makePubSub` in
 * `@endo/stream` introduced; the present file lifts it from package history
 * into the new local-layer `@endo/pubsub`.
 *
 * The `pub.put(value)` calls advance the linked list synchronously; subscribers
 * observe new nodes when they `get()` and the value they observe is the value
 * the producer most recently advanced past.
 *
 * @template TValue
 * @returns {{
 *   pub: AsyncSink<TValue>,
 *   sub: () => AsyncSpring<TValue>,
 * }}
 */
export const makePubSub = () => {
  let { promise: tailPromise, resolve: tailResolve } =
    /** @type {PromiseKit<PubSubNode<TValue>>} */ (makePromiseKit());

  const pub = harden({
    /**
     * @param {TValue} value
     */
    put(value) {
      const { resolve, promise } = makePromiseKit();
      tailResolve(freeze({ value, promise }));
      tailResolve = resolve;
      // Unlike a queue, the read head advances past this value for any
      // subscriber created from this point onward.
      tailPromise = promise;
    },
  });

  const sub = () => {
    // Capture the read head for the next published value.
    /** @type {Promise<PubSubNode<TValue>>} */
    let cursor = tailPromise;
    return harden({
      get: () => {
        const promise = cursor.then(next => next.value);
        cursor = /** @type {Promise<PubSubNode<TValue>>} */ (
          cursor.then(next => next.promise)
        );
        return harden(promise);
      },
    });
  };

  return harden({ pub, sub });
};
harden(makePubSub);
