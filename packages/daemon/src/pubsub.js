// @ts-check

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';
import { makeStream } from '@endo/stream';

/** @import { AsyncQueue } from '@endo/stream' */
/** @import { Topic } from './types.js' */

// TypeScript ReadOnly semantics are not sufficiently expressive to distinguish
// a value one promises not to alter from a value one must not alter,
// making it useless.
const freeze = /** @type {<T>(v: T | Readonly<T>) => T} */ (Object.freeze);

/**
 * @template TValue TValue
 * @param {TValue} value
 * @returns {AsyncQueue<TValue, unknown>}
 */
export const makeNullQueue = value =>
  harden({
    put: () => {},
    get: async () => value,
  });

export const nullIteratorQueue = makeNullQueue(
  harden({ value: undefined, done: false }),
);

/**
 * @template TValue
 */
export const makeChangePubSub = () => {
  // Request pubsub async queue internals
  let { promise: tailPromise, resolve: tailResolve } = makePromiseKit();

  const sink = {
    /**
     * @param {TValue} value
     */
    put: value => {
      const { resolve, promise } = makePromiseKit();
      tailResolve(freeze({ value, promise }));
      tailResolve = resolve;
      // Unlike a queue, advance the read head for future subscribers.
      tailPromise = promise;
    },
  };

  const makeSpring = () => {
    // Capture the read head for the next published value.
    let cursor = tailPromise;
    return {
      get: () => {
        const promise = cursor.then(next => next.value);
        cursor = cursor.then(next => next.promise);
        return harden(promise);
      },
    };
  };

  return harden({ sink, makeSpring });
};
harden(makeChangePubSub);

/**
 * @template TValue
 * @returns {Topic<TValue>}
 */
export const makeChangeTopic = () => {
  /** @type {ReturnType<makeChangePubSub<TValue>>} */
  const { sink, makeSpring } = makeChangePubSub();
  return harden({
    publisher: makeStream(nullIteratorQueue, sink),
    subscribe: () => {
      // A subscriber reads published values from the spring. `makeStream`'s
      // own `return()`/`throw()` settle via `acks.get()`, which for a
      // subscriber is the spring — so they await the *next* published value
      // and never settle once the reader has caught up. Override them so a
      // subscription can be closed promptly. This matters for consumers that
      // stop early (a `for await` that breaks) and for the @endo/exo-stream
      // reader pump, which calls `return()` to release a stream; awaiting the
      // spring there would deadlock the consumer's pending read.
      const subscription = makeStream(makeSpring(), nullIteratorQueue);
      const reader = harden({
        next: value => subscription.next(value),
        return: async value => harden({ value, done: true }),
        throw: async error => {
          throw error;
        },
        [Symbol.asyncIterator]: () => reader,
      });
      return reader;
    },
  });
};
harden(makeChangeTopic);
