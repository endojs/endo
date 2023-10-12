// @ts-check

import { makePromiseKit } from '@endo/promise-kit';
import { makeStream } from '@endo/stream';

// TypeScript ReadOnly semantics are not sufficiently expressive to distinguish
// a value one promises not to alter from a value one must not alter,
// making it useless.
const freeze = /** @type {<T>(v: T | Readonly<T>) => T} */ (Object.freeze);

/**
 * @template TValue TValue
 * @param {TValue} value
 * @returns {import('@endo/stream').AsyncQueue<TValue, unknown>}
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
 * @returns {import('./types.js').Topic<TValue>}
 */
export const makeChangeTopic = () => {
  /** @type {ReturnType<makeChangePubSub<TValue>>} */
  const { sink, makeSpring } = makeChangePubSub();
  return harden({
    publisher: makeStream(nullIteratorQueue, sink),
    subscribe: () => makeStream(makeSpring(), nullIteratorQueue),
  });
};
harden(makeChangeTopic);
