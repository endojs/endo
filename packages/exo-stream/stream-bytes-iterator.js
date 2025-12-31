// @ts-check

import { makeExo } from '@endo/exo';
import { encodeBase64 } from '@endo/base64';
import { mapReader } from '@endo/stream';
import { makePromiseKit } from '@endo/promise-kit';

import { PassableBytesReaderInterface } from './type-guards.js';

/** @import { Passable } from '@endo/pass-style' */
/** @import { SomehowAsyncIterable, StreamNode } from './stream-iterator.js' */
/** @import { ERef } from '@endo/eventual-send' */
/** @import { Pattern } from '@endo/patterns' */

const { freeze } = Object;

/**
 * A passable bytes reader reference.
 * Uses streamBase64() to allow future migration to direct bytes transport.
 * Yields base64-encoded strings (decoded to Uint8Array by initiator).
 *
 * @template [TReadReturn=undefined] - Type of return value when done
 * @typedef {object} PassableBytesReader
 * @property {(synPromise: ERef<StreamNode<Passable, Passable>>) => Promise<StreamNode<string, TReadReturn>>} streamBase64
 * @property {() => Pattern | undefined} readReturnPattern - Pattern for TReadReturn
 */

/**
 * Options for streamBytesIterator.
 * TRead is fixed to Uint8Array (transmitted as base64 string).
 *
 * TODO: Future work should either:
 * 1. Constrain Pattern types based on template parameters (Pattern<TReadReturn>), or
 * 2. Infer template types from provided patterns.
 * The latter requires patterns to express more template arguments for terminal
 * nodes like remotables, symbols, and other non-primitive passables.
 *
 * @template [TReadReturn=undefined]
 * @typedef {object} StreamBytesIteratorOptions
 * @property {number} [buffer] - Number of values to pre-pull before waiting for synchronizes (default 0)
 * @property {Pattern} [readReturnPattern] - Pattern for TReadReturn (return value)
 */

/**
 * Returns the iterator for the given iterable object.
 * Supports both synchronous and asynchronous iterables.
 *
 * @template T The item type of the iterable.
 * @param {SomehowAsyncIterable<T>} iterable The iterable object.
 * @returns {AsyncIterator<T> | Iterator<T>}
 */
const asyncIterate = iterable => {
  if (Symbol.asyncIterator in iterable) {
    return iterable[Symbol.asyncIterator]();
  } else if (Symbol.iterator in iterable) {
    return iterable[Symbol.iterator]();
  } else if ('next' in iterable) {
    return iterable;
  }
  throw new TypeError('Expected an iterable or iterator');
};

/**
 * Convert a local AsyncIterator<Uint8Array> to a remote PassableBytesReader reference.
 * Bytes are automatically base64-encoded for transmission over CapTP.
 *
 * Uses streamBase64() method instead of stream() to allow future migration
 * to direct bytes transport when CapTP supports it. At that time, bytes-streamable
 * Exos can implement stream() directly, and initiators can gracefully transition
 * to using iterateStream() instead of iterateBytesStream().
 *
 * The interface implies Uint8Array yields (no readPattern method).
 * Only readReturnPattern can be customized.
 *
 * The reader uses bidirectional promise chains for flow control:
 * - Initiator sends synchronizes via the synchronize chain to induce production
 * - Responder sends acknowledges (base64 strings) via the acknowledge chain
 *
 * @param {SomehowAsyncIterable<Uint8Array>} bytesIterator
 * @param {StreamBytesIteratorOptions} [options]
 * @returns {PassableBytesReader}
 */
export const streamBytesIterator = (bytesIterator, options = {}) => {
  const { buffer = 0, readReturnPattern } = options;

  // Encode bytes to base64 strings
  const base64Iterator = mapReader(
    // @ts-expect-error mapReader types aren't perfect with iterables
    bytesIterator,
    encodeBase64,
  );
  const iter = asyncIterate(base64Iterator);

  // @ts-expect-error The Exo's Passable types are compatible with the template types
  return makeExo('PassableBytesReader', PassableBytesReaderInterface, {
    /**
     * @param {ERef<StreamNode<Passable, Passable>>} synPromise - Head of synchronize promise chain
     * @returns {Promise<StreamNode<string, Passable>>} - Head of acknowledge promise chain
     */
    streamBase64(synPromise) {
      // Create acknowledge chain - we hold the resolver
      const { promise: ackHead, resolve: initialAckResolve } = makePromiseKit();
      let ackResolve = initialAckResolve;

      // Pump: process syncs and pull from iterator
      // With buffer > 0, we pre-pull values and send acks before waiting for syncs.
      (async () => {
        await null;
        for (let i = 0; ; i += 1) {
          // After buffer values, wait for sync before each pull
          if (i >= buffer) {
            // eslint-disable-next-line no-await-in-loop
            const synNode = await synPromise;
            if (synNode.promise === null) {
              // Initiator signaled close - pass through the return node
              ackResolve(synNode);
              break;
            }
            synPromise = synNode.promise;
          }

          // Pull next value from iterator
          // eslint-disable-next-line no-await-in-loop
          const result = await iter.next();

          const { promise, resolve } = makePromiseKit();
          const ackNode = freeze({
            value: result.value,
            promise: result.done ? null : promise,
          });
          ackResolve(ackNode);
          ackResolve = resolve;

          if (result.done) {
            break;
          }
        }
      })().catch(err => {
        // Abort: resolve tail with rejection
        ackResolve(Promise.reject(err));
      });

      return ackHead;
    },

    /**
     * Returns the pattern for validating TReadReturn (return value).
     * @returns {Pattern | undefined}
     */
    readReturnPattern() {
      return readReturnPattern;
    },
  });
};
