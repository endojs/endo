// @ts-check

import { E } from '@endo/far';
import { decodeBase64 } from '@endo/base64';
import { M, mustMatch } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef } from '@endo/far' */
/** @import { PassableBytesReader } from './stream-bytes-iterator.js' */
/** @import { StreamNode } from './stream-iterator.js' */
/** @import { Pattern } from '@endo/patterns' */

const { freeze } = Object;

/**
 * Options for iterateBytesStream.
 * TRead is fixed to Uint8Array.
 *
 * TODO: Future work should either:
 * 1. Constrain Pattern types based on template parameters (Pattern<TReadReturn>), or
 * 2. Infer template types from provided patterns.
 * The latter requires patterns to express more template arguments for terminal
 * nodes like remotables, symbols, and other non-primitive passables.
 *
 * @template [TReadReturn=undefined]
 * @typedef {object} IterateBytesStreamOptions
 * @property {number} [buffer] - Number of values to pre-synchronize (default 1)
 * @property {Pattern} [readReturnPattern] - Pattern for TReadReturn (return value)
 * @property {number} [stringLengthLimit] - Maximum length for base64-encoded
 *   chunks in characters. The default is 100,000 (from @endo/patterns default
 *   limits). Increase this for large payloads like bundles. Note: base64
 *   encoding increases size by ~33%, so a 75KB binary payload becomes ~100KB
 *   of base64 text.
 */

/**
 * Convert a remote PassableBytesReader reference to a local AsyncIterableIterator<Uint8Array>
 * (Initiator/Consumer side).
 *
 * This is the Consumer for a bytes Reader: it initiates streaming and consumes
 * bytes from the remote Responder/Producer.
 *
 * Base64 strings are automatically decoded to bytes.
 * Uses the bidirectional promise chain protocol for streaming with flow control.
 * With buffer > 1, nodes propagate via CapTP before I/O yields, keeping the responder busy.
 *
 * Calls streamBase64() on the responder, which allows future migration to direct
 * bytes transport when CapTP supports it. At that time, bytes-streamable Exos can
 * implement stream() directly, and initiators can gracefully transition to using
 * iterateStream() instead of iterateBytesStream().
 *
 * The interface implies Uint8Array yields. Only readReturnPattern can be customized.
 *
 * @param {ERef<PassableBytesReader>} bytesStreamRef
 * @param {IterateBytesStreamOptions} [options]
 * @returns {Promise<AsyncIterableIterator<Uint8Array>>}
 */
export const iterateBytesStream = async (bytesStreamRef, options = {}) => {
  const {
    buffer = 1,
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
  let nodePromise = E(bytesStreamRef).streamBase64(synHead);

  // Track if we're done
  let done = false;

  /** @type {AsyncIterableIterator<Uint8Array>} */
  const iterator = harden({
    /**
     * @param {Passable} [synValue] - Optional value to send upstream
     */
    async next(synValue) {
      if (done) {
        return harden({ done: true, value: undefined });
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

      // Send synchronize (with optional value) to induce next value
      const { promise, resolve } = makePromiseKit();
      synResolve(freeze({ value: synValue, promise }));
      synResolve = resolve;

      // Store the next node promise for next iteration
      nodePromise = /** @type {Promise<StreamNode<string, Passable>>} */ (
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
