// @ts-check
/// <reference types="ses"/>

/** @import { Reader, Writer, AsyncSpring } from '@endo/stream' */

import harden from '@endo/harden';
import { makeStream } from '@endo/stream';
import { makePubSub } from './pub-sub.js';
import { nullSink, nullSpring } from './null-queue.js';

// TypeScript ReadOnly semantics are not sufficiently expressive to distinguish
// a value one promises not to alter from a value one must not alter,
// making it useless.
const freeze = /** @type {<T>(v: T | Readonly<T>) => T} */ (Object.freeze);

/**
 * Constructs a lossless-deltas pubsub topic.
 *
 * Every subscriber created after a value is published sees only values
 * published from that point forward; a subscriber created before any
 * publication sees every value.
 * The producer is a local `Writer<TValue, TReturn>` whose `next(value)` calls
 * advance the shared async linked list past one node; each subscriber is a
 * local `Reader<TValue, TReturn>` over an independent cursor on that same
 * list.
 *
 * The internal back-pressure side is null: the producer is not blocked by
 * any subscriber's drain rate.
 * A subscriber that drains slowly accumulates undrained nodes in its own
 * cursor closure; the producer advances regardless.
 * This matches the "producer not vulnerable to consumers" invariant from
 * `@agoric/notifier`'s subscription-pair and the lossless-deltas semantics
 * from the in-tree `formulaChangeTopic` precedent.
 *
 * Termination delivery: a subscriber that calls `next()` *after* the
 * producer's `return(returnValue)` resolves with `{ value: returnValue, done: true }`
 * for that call.
 * A subscriber that calls `next()` after `throw(error)` rejects with that
 * error on the first `next()`.
 * A subscriber created *after* the topic has terminated synthesizes the
 * terminal disposition on its first `next()` (the shared linked list's
 * cursor has advanced past the terminal node by the time `subscribe()` is
 * called).
 *
 * @template [TValue=unknown]
 * @template [TReturn=undefined]
 * @returns {{
 *   publisher: Writer<TValue, TReturn>,
 *   subscribe: () => Reader<TValue, TReturn>,
 * }}
 */
export const makeChangeTopic = () => {
  const { pub, sub } = makePubSub();
  /** @type {{ kind: 'return', value: TReturn } | { kind: 'throw', error: Error } | undefined} */
  let terminal;

  /** @type {Writer<TValue, TReturn>} */
  const innerPublisher = makeStream(
    /** @type {AsyncSpring<IteratorResult<undefined, undefined>>} */ (
      /** @type {unknown} */ (nullSpring)
    ),
    pub,
  );

  /** @type {Writer<TValue, TReturn>} */
  const publisher = harden({
    /**
     * @param {...TValue} args
     */
    next(...args) {
      if (terminal !== undefined) {
        // Publication after termination is a quiet no-op; the topic is sealed
        // and downstream subscribers will surface the terminal disposition.
        return Promise.resolve(
          harden(
            /** @type {IteratorResult<undefined, undefined>} */ ({
              value: undefined,
              done: false,
            }),
          ),
        );
      }
      return innerPublisher.next(
        .../** @type {[TValue]} */ (/** @type {unknown} */ (args)),
      );
    },
    return(value) {
      if (terminal === undefined) {
        terminal = freeze({ kind: /** @type {'return'} */ ('return'), value });
      }
      return innerPublisher.return(value);
    },
    throw(error) {
      if (terminal === undefined) {
        terminal = freeze({ kind: /** @type {'throw'} */ ('throw'), error });
      }
      // `@endo/stream`'s `makeStream.throw` pushes `Promise.reject(error)` onto
      // the underlying linked list so early subscribers' cursors observe the
      // rejection. A subscriber created *after* throw uses the synthesized
      // terminal branch in `subscribe` and never reads the rejected node from
      // the linked list. Open a graveyard cursor *before* the throw so it
      // captures the rejection node, then attach `.catch` to silence the
      // otherwise-orphan rejection when only late subscribers exist.
      const graveyardSpring = sub();
      const result = innerPublisher.throw(error);
      graveyardSpring.get().catch(() => {});
      return result;
    },
    [Symbol.asyncIterator]() {
      return publisher;
    },
  });

  const subscribe = () => {
    // If the topic has already terminated by the time this subscriber starts,
    // synthesize the terminal disposition rather than letting the cursor wait
    // on a tail that will never resolve.
    if (terminal !== undefined) {
      const sealedTerminal = terminal;
      let delivered = false;
      /** @type {Reader<TValue, TReturn>} */
      const subscriber = harden({
        async next() {
          if (!delivered) {
            delivered = true;
            if (sealedTerminal.kind === 'return') {
              return harden(
                /** @type {IteratorResult<TValue, TReturn>} */ ({
                  value: sealedTerminal.value,
                  done: true,
                }),
              );
            }
            throw sealedTerminal.error;
          }
          // Subsequent reads after the terminal is delivered remain terminal.
          if (sealedTerminal.kind === 'return') {
            return harden(
              /** @type {IteratorResult<TValue, TReturn>} */ ({
                value: sealedTerminal.value,
                done: true,
              }),
            );
          }
          throw sealedTerminal.error;
        },
        async return(_value) {
          return harden(
            /** @type {IteratorResult<TValue, TReturn>} */ ({
              value: /** @type {TReturn} */ (
                /** @type {unknown} */ (undefined)
              ),
              done: true,
            }),
          );
        },
        async throw(error) {
          throw error;
        },
        [Symbol.asyncIterator]() {
          return subscriber;
        },
      });
      return subscriber;
    }
    // A subscriber created before termination iterates the shared linked list
    // directly through `@endo/stream`'s reader. That reader is not sticky on
    // its own: the publisher's `return`/`throw` puts exactly one terminal node,
    // so once the reader has yielded it a further `next()` advances the cursor
    // onto the still-unresolved tail promise and would block forever. Wrap the
    // reader so the terminal disposition is captured on first delivery and
    // replayed on every subsequent `next()`. This matches the synthesized
    // late-subscriber branch above, `makeLatestTopic`, and the README's
    // contract that "every subsequent call keeps returning the same terminal
    // result."
    /** @type {Reader<TValue, TReturn>} */
    const innerSubscriber = makeStream(sub(), nullSink);
    /** @type {{ kind: 'return', value: TReturn } | { kind: 'throw', error: Error } | undefined} */
    let sealed;
    /** @type {Reader<TValue, TReturn>} */
    const subscriber = harden({
      async next() {
        await null;
        if (sealed !== undefined) {
          if (sealed.kind === 'return') {
            return harden(
              /** @type {IteratorResult<TValue, TReturn>} */ ({
                value: sealed.value,
                done: true,
              }),
            );
          }
          throw sealed.error;
        }
        try {
          const result = await innerSubscriber.next();
          if (result.done) {
            sealed = freeze({
              kind: /** @type {'return'} */ ('return'),
              value: /** @type {TReturn} */ (result.value),
            });
          }
          return result;
        } catch (caughtError) {
          const error = /** @type {Error} */ (caughtError);
          sealed = freeze({
            kind: /** @type {'throw'} */ ('throw'),
            error,
          });
          throw error;
        }
      },
      async return(value) {
        return innerSubscriber.return(value);
      },
      async throw(error) {
        return innerSubscriber.throw(error);
      },
      [Symbol.asyncIterator]() {
        return subscriber;
      },
    });
    return subscriber;
  };
  return harden({ publisher, subscribe });
};
harden(makeChangeTopic);
