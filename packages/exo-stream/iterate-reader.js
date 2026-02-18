// @ts-check

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { mustMatch } from '@endo/patterns';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef } from '@endo/far' */
/** @import { Pattern } from '@endo/patterns' */
/** @import { PassableReader, StreamNode, IterateReaderOptions } from './types.js' */

const { freeze } = Object;

/**
 * Convert a remote PassableReader reference to a local iterator (Initiator/Consumer side).
 *
 * This creates a Reader stream where:
 * - Synchronization values are `undefined` (flow control only - "give me more")
 * - Acknowledgement values are `TRead` (actual data from the responder)
 *
 * The Consumer initiates streaming and consumes values from the remote
 * Responder/Producer.
 *
 * Uses the bidirectional promise chain protocol for streaming with flow control.
 * With buffer > 0, nodes propagate via CapTP before I/O yields, keeping the responder busy.
 *
 * @template [TRead=Passable]
 * @template [TReadReturn=undefined]
 * @param {ERef<PassableReader<TRead, TReadReturn>>} readerRef
 * @param {IterateReaderOptions<TRead, TReadReturn>} [options]
 * @returns {AsyncIterableIterator<TRead, TReadReturn>}
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

  // Track if we're done
  let done = false;

  // Track how many pre-buffered acks remain
  let preBufferRemaining = buffer;

  /** @type {AsyncIterableIterator<TRead, TReadReturn>} */
  // @ts-expect-error Iterator type matching is complex
  const iterator = harden({
    /**
     * Request the next value from the stream.
     * For Reader streams, syn is always undefined (flow control only).
     */
    async next() {
      if (done) {
        return harden({ done: true, value: undefined });
      }

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
        done = true;
        // Validate return value if readReturnPattern provided
        if (readReturnPattern !== undefined && value !== undefined) {
          mustMatch(value, readReturnPattern);
        }
        return harden({ done: true, value });
      }

      // Validate yielded value if readPattern provided
      if (readPattern !== undefined) {
        mustMatch(value, readPattern);
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
    },

    /**
     * Close the stream early. The responder will call iterator.return() for cleanup.
     * @param {TReadReturn} [value] - Optional return value
     */
    async return(value) {
      done = true;
      // Signal close to responder (syn value is undefined for Reader)
      synResolve(freeze({ value: undefined, promise: null }));
      return harden({ done: true, value });
    },

    async throw(error) {
      done = true;
      // Abort: signal close and propagate error
      synResolve(freeze({ value: undefined, promise: null }));
      throw error;
    },

    [Symbol.asyncIterator]() {
      return iterator;
    },
  });

  return iterator;
};
