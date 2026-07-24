// @ts-check
/* eslint-disable no-await-in-loop */
// A buffered reader exo paired with an imperative, fire-and-forget `push`.
// A producer pushes events as they occur, without awaiting acknowledgment; the
// consumer pulls them over CapTP. Consolidates the twin `buffered-channel.js`
// copies formerly in `packages/floot` and `packages/claude-sandbox` (design:
// designs/buffered-channel-exo-stream-consolidation.md).
//
// Unlike the pull-based `makeReaderPump`, the responder pump here is driven by
// `push` and never blocks on the producer:
//
// - Eager acknowledgment: each pushed event resolves the next acknowledge-chain
//   node immediately, without waiting for synchronize credit. The syn chain
//   degenerates to a close-signal carrier.
// - Terminal events auto-finalize: an event matching `isTerminal` (default:
//   `type` of 'end' or 'abort') is delivered in-band as a value, then the
//   stream reports done; later pushes are ignored.
// - Live close watcher: a concurrent loop walks the syn chain, so an early
//   consumer `return()`/`throw()` is observed even while the producer is idle,
//   firing `onClose` (e.g. to kill an in-flight `claude -p` turn) and resolving
//   the acknowledge tail so the consumer's close completes promptly, discarding
//   buffered events.
//
// Buffer semantics: there is deliberately no producer-side bound. `push` is
// fire-and-forget and the buffer is unbounded — a bound would require either
// blocking the producer (a lockstep pipe, which could stall reading a child
// process's stdout) or dropping events. On the initiator, the `buffer` option
// of `iterateReader` does not throttle this channel: the responder never
// spends synchronize credit, so `buffer` only pre-resolves synchronize nodes.
// `buffer: 0` is fine; events pipeline to the initiator regardless, and
// unconsumed events accumulate initiator-side as the resolved acknowledge-chain
// tail.
//
// During migration the reader also carries the legacy remote-iterator methods
// (`next`/`return`/`throw`) that existing `E(reader).next()` consumers call.
// They are deprecated at birth; new consumers use
// `iterateReader(reader, { buffer })`. A reader has one consumer: use either
// the protocol surface or the legacy surface, not both.

import { makeExo } from '@endo/exo';
import { makePromiseKit } from '@endo/promise-kit';
import { mustMatch } from '@endo/patterns';

import { BufferedReaderInterface } from './type-guards.js';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef } from '@endo/eventual-send' */
/** @import { Pattern } from '@endo/patterns' */
/** @import { StreamNode, MakeBufferedReaderOptions, BufferedReaderKit } from './types.js' */

const { freeze } = Object;

/**
 * Terminal events close the stream; this default matches every migrated wire.
 *
 * @param {unknown} event
 * @returns {boolean}
 */
const defaultIsTerminal = event => {
  if (event === null || typeof event !== 'object') return false;
  const { type } = /** @type {{ type?: unknown }} */ (event);
  return type === 'end' || type === 'abort';
};

/**
 * Create a buffered reader exo fed by an imperative `push`.
 *
 * @template {Passable} [TRead=Passable]
 * @param {MakeBufferedReaderOptions<TRead>} [options]
 * @returns {BufferedReaderKit<TRead>}
 */
export const makeBufferedReader = (options = {}) => {
  const {
    onClose = null,
    isTerminal = defaultIsTerminal,
    readPattern = undefined,
  } = options;

  /** @type {Array<TRead>} */
  const buffer = [];
  let finished = false;
  let cursor = 0;
  // A FIFO of parked consumer resolvers. A single slot would drop an earlier
  // parker when a second take overlaps it, hanging that call forever; draining
  // every waiter keeps concurrent consumers safe (each re-checks on wake).
  /** @type {Array<() => void>} */
  const waiters = [];
  let closeHook = onClose;
  let streaming = false;

  const drainWake = () => {
    while (waiters.length) {
      const wake = waiters.shift();
      if (wake) wake();
    }
  };

  /** @param {TRead} event */
  const push = event => {
    if (finished) return;
    if (readPattern !== undefined) {
      mustMatch(harden(event), readPattern);
    }
    buffer.push(harden(event));
    if (isTerminal(event)) finished = true;
    drainWake();
  };

  // Consumer stopped pulling: finish, discard undelivered events, unblock any
  // parked take, and signal the producer so in-flight work is aborted rather
  // than left running.
  const finalize = () => {
    const wasFinished = finished;
    finished = true;
    cursor = buffer.length;
    drainWake();
    if (!wasFinished && closeHook) closeHook();
  };

  // Take the next buffered event, parking while the producer is idle.
  /** @returns {Promise<IteratorResult<TRead, undefined>>} */
  const takeNext = async () => {
    await null;
    for (;;) {
      if (cursor < buffer.length) {
        const value = buffer[cursor];
        cursor += 1;
        return harden({ value, done: false });
      }
      if (finished) return harden({ value: undefined, done: true });
      await new Promise(resolve => {
        waiters.push(() => resolve(undefined));
      });
    }
  };

  /**
   * The push-fed responder pump. Resolves acknowledge nodes eagerly as events
   * arrive — no synchronize credit — while a concurrent watcher walks the
   * synchronize chain so a close signal is observed even when the producer is
   * idle.
   *
   * @param {ERef<StreamNode<undefined, undefined>>} synPromise
   * @returns {Promise<StreamNode<TRead, undefined>>}
   */
  const stream = synPromise => {
    if (streaming) {
      throw TypeError('BufferedReader stream() may be called at most once');
    }
    streaming = true;

    /** @type {import('@endo/promise-kit').PromiseKit<StreamNode<TRead, undefined>>} */
    const { promise: ackHead, resolve: initialAckResolve } = makePromiseKit();
    let ackResolve = initialAckResolve;

    // Ack pump: deliver events as they are pushed.
    (async () => {
      await null;
      for (;;) {
        const result = await takeNext();
        if (result.done) {
          ackResolve(freeze({ value: undefined, promise: null }));
          return;
        }
        const { promise, resolve } = makePromiseKit();
        ackResolve(freeze({ value: result.value, promise }));
        ackResolve = resolve;
      }
    })();

    // Close watcher: live even while the ack pump is parked on an idle
    // producer, so the consumer's early close fires onClose promptly.
    (async () => {
      await null;
      let syn = synPromise;
      for (;;) {
        let synNode;
        try {
          synNode = await syn;
        } catch {
          // The initiator abandoned the synchronize chain; treat as close.
          finalize();
          return;
        }
        if (
          synNode === null ||
          (typeof synNode !== 'object' && typeof synNode !== 'function') ||
          !('promise' in synNode) ||
          synNode.promise === null
        ) {
          finalize();
          return;
        }
        syn = synNode.promise;
      }
    })();

    return ackHead;
  };

  const reader = /** @type {import('./types.js').BufferedReader<TRead>} */ (
    /** @type {unknown} */ (
      makeExo(
        'BufferedReader',
        BufferedReaderInterface,
        /** @type {any} */ ({
          stream,

          /** @returns {Pattern | undefined} */
          readPattern() {
            return readPattern;
          },

          /** @returns {Pattern | undefined} */
          readReturnPattern() {
            return undefined;
          },

          // Legacy remote-iterator surface (deprecated, migration only).
          next: async () => takeNext(),
          return: async () => {
            finalize();
            return harden({ value: undefined, done: true });
          },
          throw: async error => {
            finalize();
            throw error;
          },
        }),
      )
    )
  );

  return {
    push,
    reader,
    isClosed: () => finished,
    setOnClose: fn => {
      closeHook = fn;
    },
  };
};
harden(makeBufferedReader);
