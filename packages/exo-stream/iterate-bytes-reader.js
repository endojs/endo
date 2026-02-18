// @ts-check

import { E } from '@endo/far';
import { decodeBase64 } from '@endo/base64';
import { M, mustMatch } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef } from '@endo/far' */
/** @import { PassableBytesReader, StreamNode, IterateBytesReaderOptions } from './types.js' */

const { freeze } = Object;

/**
 * Convert a remote PassableBytesReader reference to a local AsyncIterableIterator<Uint8Array>
 * (Initiator/Consumer side).
 *
 * This is the Consumer for a bytes Reader: it initiates streaming and consumes
 * bytes from the remote Responder/Producer.
 *
 * Base64 strings are automatically decoded to bytes.
 * Uses the bidirectional promise chain protocol for streaming with flow control.
 * With buffer > 0, nodes propagate via CapTP before I/O yields, keeping the responder busy.
 *
 * Calls streamBase64() on the responder, which allows future migration to direct
 * bytes transport when CapTP supports it. At that time, bytes-streamable Exos can
 * implement stream() directly, and initiators can gracefully transition to using
 * iterateReader() instead of iterateBytesReader().
 *
 * The interface implies Uint8Array yields. Only readReturnPattern can be customized.
 *
 * @param {ERef<PassableBytesReader>} bytesReaderRef
 * @param {IterateBytesReaderOptions} [options]
 * @returns {AsyncIterableIterator<Uint8Array>}
 */
export const iterateBytesReader = (bytesReaderRef, options = {}) => {
  const {
    buffer = 0,
    readReturnPattern,
    stringLengthLimit = undefined,
  } = options;

  // Create synchronize chain - we hold the resolver
  const { promise: synHead, resolve: initialSynResolve } = makePromiseKit();
  let synResolve = initialSynResolve;

  // Pre-resolve 'buffer' synchronize nodes to prime the pump
  for (let i = 0; i < buffer; i += 1) {
    const { promise, resolve } = makePromiseKit();
    synResolve(freeze({ value: undefined, promise }));
    synResolve = resolve;
  }

  // Call streamBase64() - returns a promise for the acknowledge chain head
  /** @type {Promise<StreamNode<string, Passable>>} */
  let nodePromise = E(bytesReaderRef).streamBase64(synHead);

  // Track if we're done
  let done = false;

  // Track how many pre-buffered acks remain
  let preBufferRemaining = buffer;

  /** @type {AsyncIterableIterator<Uint8Array>} */
  const iterator = harden({
    async next() {
      if (done) {
        return harden({ done: true, value: undefined });
      }

      // With pre-buffering, acks are available before syncs are needed.
      // Without pre-buffering (buffer=0), we must send sync BEFORE awaiting ack.
      if (preBufferRemaining === 0) {
        // Send sync first to unblock the responder (always undefined for flow control)
        const { promise, resolve } = makePromiseKit();
        synResolve(freeze({ value: undefined, promise }));
        synResolve = resolve;
      }

      // Await the current node
      const node = await nodePromise;

      // Extract value (base64 string)
      const base64Value = await E.get(node).value;

      // Get the promise to next node - DON'T await, just access the property
      const nextPromiseOrNull = node.promise;

      // Check if stream ended (promise is null)
      if (nextPromiseOrNull === null) {
        done = true;
        // Return value is not decoded (it's not bytes)
        // Validate return value if readReturnPattern provided
        if (readReturnPattern !== undefined && base64Value !== undefined) {
          mustMatch(base64Value, readReturnPattern);
        }
        return harden({ done: true, value: base64Value });
      }

      // Validate yielded value (should be string for base64).
      // Only pass limits when stringLengthLimit is defined, as M.string()
      // requires numeric values in the limits object.
      const stringPattern =
        stringLengthLimit !== undefined
          ? M.string({ stringLengthLimit })
          : M.string();
      mustMatch(base64Value, stringPattern);

      // Decode base64 to Uint8Array
      const value = decodeBase64(/** @type {string} */ (base64Value));

      // With pre-buffering, send sync AFTER consuming ack to maintain the pipeline
      if (preBufferRemaining > 0) {
        preBufferRemaining -= 1;
        const { promise, resolve } = makePromiseKit();
        synResolve(freeze({ value: undefined, promise }));
        synResolve = resolve;
      }

      // Store the next node promise for next iteration
      nodePromise = /** @type {Promise<StreamNode<string, Passable>>} */ (
        nextPromiseOrNull
      );

      return harden({ done: false, value });
    },

    async return(value) {
      done = true;
      // Signal close to responder
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
