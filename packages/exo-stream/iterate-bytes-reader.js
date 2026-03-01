// @ts-check
/* eslint-disable no-await-in-loop */

import { E } from '@endo/far';
import { decodeBase64 } from '@endo/base64';
import { M, mustMatch } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef } from '@endo/far' */
/** @import { PassableBytesReader, StreamNode, IterateBytesReaderOptions, BytesReaderIterator } from './types.js' */

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
 * When the initiator calls `return(value)` to close early, the final syn node
 * carries that argument value to the responder. If the responder is backed by a
 * JavaScript iterator with a `return(value)` method, it forwards the argument
 * and uses the iterator’s returned value as the terminal ack; otherwise it
 * terminates with the original argument value.
 * With buffer > 0, nodes propagate via CapTP before I/O yields, keeping the responder busy.
 *
 * Calls streamBase64() on the responder, which allows future migration to direct
 * bytes transport when CapTP supports it. At that time, bytes-streamable Exos can
 * implement stream() directly, and initiators can gracefully transition to using
 * iterateReader() instead of iterateBytesReader().
 *
 * The interface implies Uint8Array yields. Only readReturnPattern can be customized.
 *
 * @template {Passable} [TReadReturn=undefined]
 * @param {ERef<PassableBytesReader<TReadReturn>>} bytesReaderRef
 * @param {IterateBytesReaderOptions<TReadReturn>} [options]
 * @returns {BytesReaderIterator<TReadReturn>}
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
  /** @type {Promise<StreamNode<string, TReadReturn>>} */
  let nodePromise = E(bytesReaderRef).streamBase64(synHead);

  /** @type {Promise<IteratorResult<Uint8Array, TReadReturn>> | null} */
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
        // Return value is not decoded (it's not bytes)
        // Validate return value if readReturnPattern provided
        if (readReturnPattern !== undefined) {
          try {
            mustMatch(base64Value, readReturnPattern);
          } catch (error) {
            return fail(error);
          }
        }
        setTerminalDone(base64Value);
        return terminalPromise;
      }

      // Validate yielded value (should be string for base64).
      // Only pass limits when stringLengthLimit is defined, as M.string()
      // requires numeric values in the limits object.
      const stringPattern =
        stringLengthLimit !== undefined
          ? M.string({ stringLengthLimit })
          : M.string();
      try {
        mustMatch(base64Value, stringPattern);
      } catch (error) {
        return fail(error);
      }

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
      nodePromise = /** @type {Promise<StreamNode<string, TReadReturn>>} */ (
        nextPromiseOrNull
      );

      return harden({ done: false, value });
    } catch (error) {
      return fail(error);
    }
  };

  /** @type {BytesReaderIterator<TReadReturn>} */
  // @ts-expect-error Iterator type matching is complex
  const iterator = harden({
    async next() {
      const result = queue.then(next);
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },

    async return(value) {
      if (!terminalPromise) {
        synResolve(harden({ value, promise: null }));
        terminalPromise = (async () => {
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
