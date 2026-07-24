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
// Consumers use `iterateReader(reader, { buffer })`. The reader has no
// remote-iterator surface: the migration's transitional `next`/`return`/
// `throw` methods were retired once every consumer moved onto the protocol.
// A producer that needs to abort its own stream calls the kit's `close()`,
// which fires `onClose` exactly as a consumer close would.

import { makeExo } from '@endo/exo';
import { makePromiseKit } from '@endo/promise-kit';
import { mustMatch } from '@endo/patterns';

import { BufferedReaderInterface } from './type-guards.js';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef } from '@endo/eventual-send' */
/** @import { Pattern } from '@endo/patterns' */
/** @import { StreamNode, StreamYieldNode, MakeBufferedReaderOptions, BufferedReaderKit } from './types.js' */

const { freeze } = Object;

/** Sentinel distinguishing "the pump finished" from a synchronize node. */
const DONE = harden({});

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
  // Resolves when the acknowledge pump has delivered its terminal node, so the
  // close watcher can stop walking a synchronize chain nobody will extend
  // again. Without it, a consumer that drains to natural completion (a plain
  // `for await` never calls `return()`) leaves the watcher parked forever,
  // pinning this channel's state for the life of the connection.
  const { promise: pumpDone, resolve: resolvePumpDone } = makePromiseKit();

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
  // than left running. Discarding drops the buffer's contents, not just the
  // cursor: nothing can read them again, and a closed channel should not pin
  // a turn's worth of events for the producer's lifetime.
  const finalize = () => {
    const wasFinished = finished;
    finished = true;
    buffer.length = 0;
    cursor = 0;
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
          resolvePumpDone(undefined);
          return;
        }
        const { promise, resolve } = makePromiseKit();
        ackResolve(freeze({ value: result.value, promise }));
        ackResolve = resolve;
      }
    })();

    // Close watcher: live even while the ack pump is parked on an idle
    // producer, so the consumer's early close fires onClose promptly. It races
    // the walk against `pumpDone` so a stream that ends naturally releases the
    // watcher instead of parking on a chain the initiator will never extend.
    (async () => {
      await null;
      let syn = synPromise;
      // A synchronize chain is walked one node at a time and must always
      // advance. A node that points back at itself can never carry a close
      // signal, so it is rejected outright below. NOTE: a longer cycle (node A
      // resolving to an earlier node B) still spins this loop through the
      // microtask queue, as it does in `makeReaderPump`'s equivalent walk;
      // defending against that needs a protocol-level bound, not a per-walk
      // one, and is deliberately left to the shared pump rather than solved
      // differently here.
      for (;;) {
        /** @type {StreamNode<undefined, undefined> | typeof DONE | undefined} */
        let synNode;
        try {
          // eslint-disable-next-line @jessie.js/no-nested-await
          synNode = await Promise.race([
            syn,
            pumpDone.then(() => /** @type {typeof DONE} */ (DONE)),
          ]);
        } catch {
          // The initiator abandoned the synchronize chain; treat as close.
          finalize();
          return;
        }
        if (synNode === DONE) {
          // The stream finished on its own; nothing left to watch for.
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
        const { promise: nextSyn } =
          /** @type {StreamYieldNode<undefined, undefined>} */ (synNode);
        if (nextSyn === syn) {
          // Self-referential node: the chain cannot advance, so no close signal
          // can ever arrive. Treat it as a close so the producer is released.
          finalize();
          return;
        }
        syn = nextSyn;
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
        }),
      )
    )
  );

  return harden({
    push,
    reader,
    close: finalize,
    isClosed: () => finished,
    setOnClose: fn => {
      closeHook = fn;
    },
  });
};
harden(makeBufferedReader);
