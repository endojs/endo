// @ts-check

/** @import { Reader, Writer } from '@endo/stream' */
/** @import { PromiseKit } from '@endo/promise-kit' */

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';

// TypeScript ReadOnly semantics are not sufficiently expressive to distinguish
// a value one promises not to alter from a value one must not alter,
// making it useless.
const freeze = /** @type {<T>(v: T | Readonly<T>) => T} */ (Object.freeze);

/**
 * Constructs a lossy pubsub topic.
 *
 * Each subscriber sees the **most recent** value the producer has published.
 * A subscriber that drains slowly never accumulates intermediate values; if
 * the producer publishes ten values between the subscriber's `next()` calls,
 * the next call resolves with the tenth.
 * This matches the lossy semantics of `@agoric/notifier`'s notifier-pair and
 * the `makeLatestTopic` design intent in the `notifier-pubsub-migration`
 * design.
 *
 * Replay-on-iterate semantic:
 *
 * - A subscriber created before any value is published blocks on `next()`
 *   until the first publication.
 *   No synthetic initial value.
 * - A subscriber created after at least one value is published immediately
 *   sees the most recent value on its first `next()` call.
 *   Subsequent calls block on the next publication.
 * - A subscriber that has already received the most-recent-known value
 *   blocks on `next()` until a new publication advances past it.
 *
 * Termination delivery: after the producer calls `return(returnValue)`, every
 * subscriber's next `next()` resolves to `{ value: returnValue, done: true }`,
 * and subsequent calls keep returning the same terminal result.
 * After `throw(error)`, the next `next()` rejects with the error; subsequent
 * calls reject with the same error.
 * A subscriber created after termination immediately sees the terminal
 * disposition on its first `next()` call without blocking.
 *
 * The implementation keeps:
 *
 * - One mutable "latest" cell holding the most recent value (or the absence
 *   of one if nothing has been published yet).
 * - A promise that resolves on the next publication, used to wake subscribers
 *   that have already seen the latest known value.
 * - A terminal disposition (set on `return` or `throw`) that, once set,
 *   converts every subsequent `next()` into a sticky terminal response.
 *
 * Each subscriber tracks the index of the value it last delivered to its
 * consumer; if that index matches the current latest index, the subscriber
 * blocks on the next-publication promise.
 * If it lags, the subscriber resolves immediately with the latest value (not
 * the next one in sequence, which would be the lossless-deltas semantic).
 *
 * @template [TValue=unknown]
 * @template [TReturn=undefined]
 * @returns {{
 *   publisher: Writer<TValue, TReturn>,
 *   subscribe: () => Reader<TValue, TReturn>,
 * }}
 */
export const makeLatestTopic = () => {
  /** @type {{ index: number, value: TValue } | undefined} */
  let latest;
  /** @type {{ kind: 'return', value: TReturn } | { kind: 'throw', error: Error } | undefined} */
  let terminal;
  let { promise: nextPublishPromise, resolve: resolveNextPublish } =
    /** @type {PromiseKit<undefined>} */ (makePromiseKit());
  let publishIndex = 0;

  /** @type {Writer<TValue, TReturn>} */
  const publisher = harden({
    /**
     * @param {TValue} value
     * @returns {Promise<IteratorResult<undefined, undefined>>}
     */
    async next(value) {
      if (terminal !== undefined) {
        // Publication after termination is a quiet no-op: the producer has
        // already settled and downstream subscribers will surface the
        // terminal disposition on their next read.
        return harden({ value: undefined, done: false });
      }
      publishIndex += 1;
      latest = freeze({ index: publishIndex, value });
      const previousResolve = resolveNextPublish;
      const fresh = makePromiseKit();
      nextPublishPromise = fresh.promise;
      resolveNextPublish = fresh.resolve;
      previousResolve(undefined);
      return harden({ value: undefined, done: false });
    },
    /**
     * @param {TReturn} value
     * @returns {Promise<IteratorResult<undefined, undefined>>}
     */
    async return(value) {
      if (terminal === undefined) {
        terminal = freeze({ kind: /** @type {'return'} */ ('return'), value });
        resolveNextPublish(undefined);
      }
      return harden({ value: undefined, done: true });
    },
    /**
     * @param {Error} error
     * @returns {Promise<IteratorResult<undefined, undefined>>}
     */
    async throw(error) {
      if (terminal === undefined) {
        terminal = freeze({ kind: /** @type {'throw'} */ ('throw'), error });
        resolveNextPublish(undefined);
      }
      return harden({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return publisher;
    },
  });

  const subscribe = () => {
    /** @type {number} */
    let lastSeenIndex = 0;

    /** @returns {Promise<IteratorResult<TValue, TReturn>>} */
    const drain = async () => {
      await null;
      // Loop until either fresh-value or terminal disposition is available.
      // The loop terminates after at most one wait because the next-publish
      // promise resolves once per publication or once on terminal.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (latest !== undefined && latest.index > lastSeenIndex) {
          lastSeenIndex = latest.index;
          return harden({ value: latest.value, done: false });
        }
        if (terminal !== undefined) {
          if (terminal.kind === 'return') {
            return harden({ value: terminal.value, done: true });
          }
          throw terminal.error;
        }
        // Wait for the next publication or termination, then re-check.
        // eslint-disable-next-line no-await-in-loop
        await nextPublishPromise;
      }
    };

    /** @type {Reader<TValue, TReturn>} */
    const subscriber = harden({
      /**
       * @param {undefined} [_value]
       * @returns {Promise<IteratorResult<TValue, TReturn>>}
       */
      // eslint-disable-next-line no-unused-vars
      async next(_value) {
        return drain();
      },
      /**
       * @param {undefined} [_value]
       * @returns {Promise<IteratorResult<TValue, TReturn>>}
       */
      // eslint-disable-next-line no-unused-vars
      async return(_value) {
        // Consumer-side close: subsequent reads from this subscriber return a
        // synthetic terminal that does not affect the topic or peer
        // subscribers.
        lastSeenIndex = Number.POSITIVE_INFINITY;
        return harden(
          /** @type {IteratorResult<TValue, TReturn>} */ ({
            value: /** @type {TReturn} */ (/** @type {unknown} */ (undefined)),
            done: true,
          }),
        );
      },
      /**
       * @param {Error} error
       * @returns {Promise<IteratorResult<TValue, TReturn>>}
       */
      async throw(error) {
        // Consumer-side throw is a subscriber-local close that rejects.
        lastSeenIndex = Number.POSITIVE_INFINITY;
        throw error;
      },
      [Symbol.asyncIterator]() {
        return subscriber;
      },
    });
    return subscriber;
  };

  return harden({ publisher, subscribe });
};
harden(makeLatestTopic);
