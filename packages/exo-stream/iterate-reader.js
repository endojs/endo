// @ts-check
/* eslint-disable no-await-in-loop */

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { mustMatch } from '@endo/patterns';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef } from '@endo/far' */
/** @import { Pattern } from '@endo/patterns' */
/** @import { PassableReader, StreamNode, IterateReaderOptions, ReaderIterator } from './types.js' */

const { freeze } = Object;

/**
 * Convert a remote PassableReader reference to a local iterator (Initiator/Consumer side).
 *
 * This creates a Reader stream where:
 * - Synchronization values are `undefined` (flow control only - "give me more").
 *   When the initiator calls `return(value)` to close early, the final syn node
 *   carries that argument value to the responder. If the responder is backed by
 *   a JavaScript iterator with a `return(value)` method, it forwards the argument
 *   and uses the iterator’s returned value as the terminal ack; otherwise it
 *   terminates with the original argument value.
 * - Acknowledgement values are `TRead` (actual data from the responder)
 *
 * The Consumer initiates streaming and consumes values from the remote
 * Responder/Producer.
 *
 * Uses the bidirectional promise chain protocol for streaming with flow control.
 * With buffer > 0, nodes propagate via CapTP before I/O yields, keeping the responder busy.
 *
 * @template {Passable} [TRead=Passable]
 * @template {Passable} [TReadReturn=undefined]
 * @param {ERef<PassableReader<TRead, TReadReturn>>} readerRef
 * @param {IterateReaderOptions<TRead, TReadReturn>} [options]
 * @returns {ReaderIterator<TRead, TReadReturn>}
 */
export const iterateReader = (readerRef, options = {}) => {
  const { buffer = 0, readPattern, readReturnPattern } = options;

  // Create synchronize chain - we hold the resolver
  const { promise: synHead, resolve: initialSynResolve } = makePromiseKit();
  let synResolve = initialSynResolve;

  // Pre-resolve 'buffer' synchronize nodes to prime the pump
  for (let i = 0; i < buffer; i += 1) {
    const { promise, resolve } = makePromiseKit();
    synResolve(freeze({ value: undefined, promise }));
    synResolve = resolve;
  }

  // Call stream() - returns a promise for the acknowledge chain head
  /** @type {Promise<StreamNode<TRead, TReadReturn>>} */
  let nodePromise = E(readerRef).stream(synHead);

  /** @type {Promise<IteratorResult<TRead, TReadReturn>> | null} */
  let terminalPromise = null;

  const setTerminalDone = value => {
    if (!terminalPromise) {
      terminalPromise = Promise.resolve(harden({ done: true, value }));
    }
  };

  const setTerminalError = error => {
    if (!terminalPromise) {
      terminalPromise = Promise.reject(error);
      terminalPromise.catch(() => undefined);
    }
  };

  const fail = error => {
    if (!terminalPromise) {
      setTerminalError(error);
      synResolve(freeze({ value: undefined, promise: null }));
    }
    return terminalPromise;
  };

  // Track how many pre-buffered acks remain
  let preBufferRemaining = buffer;

  /** @type {Promise<undefined>} */
  let queue = Promise.resolve(undefined);

  const next = async () => {
    if (terminalPromise) {
      return terminalPromise;
    }

    await null;

    try {
      // With pre-buffering, acks are available before syncs are needed.
      // Without pre-buffering (buffer=0), we must send sync BEFORE awaiting ack.
      if (preBufferRemaining === 0) {
        // Send sync first to unblock the responder (undefined for Reader)
        const { promise, resolve } = makePromiseKit();
        synResolve(freeze({ value: undefined, promise }));
        synResolve = resolve;
      }

      // Await the current node
      const node = await nodePromise;

      // Extract value
      const value = await E.get(node).value;

      // Get the promise to next node - DON'T await, just access the property
      // node is already local (resolved from nodePromise), so direct property access works
      const nextPromiseOrNull = node.promise;

      // Check if stream ended (promise is null)
      if (nextPromiseOrNull === null) {
        // Validate return value if readReturnPattern provided
        if (readReturnPattern !== undefined) {
          try {
            mustMatch(value, readReturnPattern);
          } catch (error) {
            return fail(error);
          }
        }
        setTerminalDone(value);
        return terminalPromise;
      }

      // Validate yielded value if readPattern provided
      if (readPattern !== undefined) {
        try {
          mustMatch(value, readPattern);
        } catch (error) {
          return fail(error);
        }
      }

      // With pre-buffering, send sync AFTER consuming ack to maintain the pipeline
      if (preBufferRemaining > 0) {
        preBufferRemaining -= 1;
        const { promise, resolve } = makePromiseKit();
        synResolve(freeze({ value: undefined, promise }));
        synResolve = resolve;
      }

      // Store the next node promise for next iteration
      // Note: nextPromiseOrNull is a Promise here, not null
      nodePromise = /** @type {Promise<StreamNode<TRead, TReadReturn>>} */ (
        nextPromiseOrNull
      );

      return harden({ done: false, value });
    } catch (error) {
      return fail(error);
    }
  };

  /** @type {ReaderIterator<TRead, TReadReturn>} */
  // @ts-expect-error Iterator type matching is complex
  const iterator = harden({
    /**
     * Request the next value from the stream.
     * For Reader streams, syn is undefined for flow control. The final syn node
     * carries the value passed to return(value) when closing early.
     */
    async next() {
      const result = queue.then(next);
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },

    /**
     * Close the stream early. The responder will call iterator.return() for cleanup.
     * @param {TReadReturn} [value] - Optional return value
     */
    async return(value) {
      if (!terminalPromise) {
        synResolve(harden({ value, promise: null }));
        terminalPromise = (async () => {
          // Drain the ack chain to obtain the responder's terminal value.
          // This mirrors local iterator.return(value) semantics and allows
          // responder errors (or return-value validation failures) to surface
          // to the initiator.
          await null;
          let node = await nodePromise;
          while (node.promise !== null) {
            node = await node.promise;
          }
          const terminalValue = await E.get(node).value;
          if (readReturnPattern !== undefined) {
            mustMatch(terminalValue, readReturnPattern);
          }
          return harden({ done: true, value: terminalValue });
        })();
      }
      return terminalPromise;
    },

    async throw(error) {
      setTerminalError(error);
      // Abort: signal close and propagate error
      synResolve(freeze({ value: undefined, promise: null }));
      return terminalPromise;
    },

    [Symbol.asyncIterator]() {
      return iterator;
    },
  });

  return iterator;
};
