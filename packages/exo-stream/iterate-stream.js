// @ts-check

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { mustMatch } from '@endo/patterns';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef } from '@endo/far' */
/** @import { Pattern } from '@endo/patterns' */
/** @import { Stream } from '@endo/stream' */
/** @import { PassableStream, StreamNode } from './stream-iterator.js' */

const { freeze } = Object;

/**
 * Options for iterateStream.
 *
 * TODO: Future work should either:
 * 1. Constrain Pattern types based on template parameters (Pattern<TRead> etc.), or
 * 2. Infer template types from provided patterns.
 * The latter requires patterns to express more template arguments for terminal
 * nodes like remotables, symbols, and other non-primitive passables.
 *
 * @template [TRead=Passable]
 * @template [TWrite=undefined]
 * @template [TReadReturn=undefined]
 * @template [TWriteReturn=unknown]
 * @typedef {object} IterateStreamOptions
 * @property {number} [buffer] - Number of values to pre-synchronize (default 1)
 * @property {Pattern} [readPattern] - Pattern to validate TRead (yielded values)
 * @property {Pattern} [readReturnPattern] - Pattern to validate TReadReturn (return value)
 */

/**
 * Convert a remote PassableStream reference to a local Stream (Initiator side).
 *
 * For a Reader, this is the Consumer: it initiates streaming and consumes
 * values from the remote Responder/Producer.
 *
 * Uses the bidirectional promise chain protocol for streaming with flow control.
 * With buffer > 1, nodes propagate via CapTP before I/O yields, keeping the responder busy.
 *
 * The returned iterator supports bidirectional value flow:
 * - next(value) sends value upstream to the responder (like generator.next(value))
 * - return(value) closes the stream and sends a final value upstream
 *
 * @template [TRead=Passable]
 * @template [TWrite=undefined]
 * @template [TReadReturn=undefined]
 * @template [TWriteReturn=unknown]
 * @param {ERef<PassableStream<TRead, TWrite, TReadReturn, TWriteReturn>>} streamRef
 * @param {IterateStreamOptions<TRead, TWrite, TReadReturn, TWriteReturn>} [options]
 * @returns {Stream<TRead, TWrite, TReadReturn, TWriteReturn>}
 */
export const iterateStream = (streamRef, options = {}) => {
  const { buffer = 1, readPattern, readReturnPattern } = options;

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
  let nodePromise = E(streamRef).stream(synHead);

  // Track if we're done
  let done = false;

  // Track how many pre-buffered acks remain
  let preBufferRemaining = buffer;

  /** @type {Stream<TRead, TWrite, TReadReturn, TWriteReturn>} */
  // @ts-expect-error Stream type matching is complex
  const iterator = harden({
    /**
     * @param {TWrite} [synValue] - Optional value to send upstream
     */
    async next(synValue) {
      if (done) {
        return harden({ done: true, value: undefined });
      }

      // With pre-buffering, acks are available before syncs are needed.
      // Without pre-buffering (buffer=0), we must send sync BEFORE awaiting ack.
      if (preBufferRemaining === 0) {
        // Send sync first to unblock the responder
        const { promise, resolve } = makePromiseKit();
        synResolve(freeze({ value: synValue, promise }));
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
        synResolve(freeze({ value: synValue, promise }));
        synResolve = resolve;
      }

      // Store the next node promise for next iteration
      // Note: nextPromiseOrNull is a Promise here, not null
      nodePromise = /** @type {Promise<StreamNode<TRead, TReadReturn>>} */ (
        nextPromiseOrNull
      );

      return harden({ done: false, value });
    },

    async return(value) {
      done = true;
      // Signal close to responder with final value
      synResolve(freeze({ value, promise: null }));
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
