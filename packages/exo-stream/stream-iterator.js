// @ts-check

import { makeExo } from '@endo/exo';
import { makePromiseKit } from '@endo/promise-kit';

import { PassableStreamInterface } from './type-guards.js';
import { asyncIterate } from './async-iterate.js';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef } from '@endo/eventual-send' */
/** @import { Pattern } from '@endo/patterns' */
/** @import { SomehowAsyncIterable } from './async-iterate.js' */

const { freeze } = Object;

/**
 * A yielding node in a bidirectional promise chain.
 * @template Y - Yield value type
 * @template [R=undefined] - Return value type
 * @typedef {object} StreamYieldNode
 * @property {Y} value - The yielded value
 * @property {Promise<StreamNode<Y, R>>} promise - Next node
 */

/**
 * A return node in a bidirectional promise chain (final node).
 * @template [R=undefined] - Return value type
 * @typedef {object} StreamReturnNode
 * @property {R} value - The return value
 * @property {null} promise - null signals end of chain
 */

/**
 * A node in a bidirectional promise chain.
 * Like IteratorResult, this is a discriminated union:
 * - Yield node: {value: Y, promise: Promise<StreamNode<Y, R>>}
 * - Return node: {value: R, promise: null}
 *
 * The same structure is used for both directions:
 * - Synchronize chain: initiator → responder (next() values, close signals)
 * - Acknowledge chain: responder → initiator (yields/returns)
 *
 * @template [Y=undefined] - Yield value type
 * @template [R=undefined] - Return value type
 * @typedef {StreamYieldNode<Y, R> | StreamReturnNode<R>} StreamNode
 */

/**
 * Options for streamIterator.
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
 * @template [TWriteReturn=undefined]
 * @typedef {object} StreamIteratorOptions
 * @property {number} [buffer] - Number of values to pre-pull before waiting for synchronizes (default 0)
 * @property {Pattern} [readPattern] - Pattern for TRead (yielded values)
 * @property {Pattern} [readReturnPattern] - Pattern for TReadReturn (return value)
 * @property {Pattern} [writePattern] - Pattern for TWrite (next() values)
 * @property {Pattern} [writeReturnPattern] - Pattern for TWriteReturn (return() value)
 */

/**
 * A passable stream reference, analogous to Stream<TRead, TWrite, TReadReturn, TWriteReturn>.
 *
 * @template [TRead=Passable] - Type of values read (yielded)
 * @template [TWrite=Passable] - Type of values written (passed to next())
 * @template [TReadReturn=Passable] - Type of return value when done
 * @template [TWriteReturn=Passable] - Type of value passed to return()
 * @typedef {object} PassableStream
 * @property {(synPromise: ERef<StreamNode<TWrite, TWriteReturn>>) => Promise<StreamNode<TRead, TReadReturn>>} stream
 * @property {() => Pattern | undefined} readPattern - Pattern for TRead
 * @property {() => Pattern | undefined} readReturnPattern - Pattern for TReadReturn
 * @property {() => Pattern | undefined} writePattern - Pattern for TWrite
 * @property {() => Pattern | undefined} writeReturnPattern - Pattern for TWriteReturn
 */

/**
 * Convert a local iterator to a remote PassableStream reference (Responder side).
 *
 * For a Reader, this is the Producer: it wraps a local iterator and produces
 * values for the remote Initiator/Consumer.
 *
 * The stream uses bidirectional promise chains for flow control:
 * - Initiator sends synchronizations (with optional values) via the synchronization chain
 * - Responder sends acknowledgements via the acknowledgement chain
 * - Synchronization values are passed to iterator.next() like generator.next(value)
 *
 * With buffer > 0, the responder pre-pulls values and sends acknowledgements
 * before waiting for synchronization messages, allowing the initiator to receive
 * values without additional round-trips.
 *
 * @template [TRead=Passable]
 * @template [TWrite=undefined]
 * @template [TReadReturn=undefined]
 * @template [TWriteReturn=undefined]
 * @param {SomehowAsyncIterable<TRead, TWrite, TReadReturn, TWriteReturn>} iterator
 * @param {StreamIteratorOptions} [options]
 * @returns {PassableStream<TRead, TWrite, TReadReturn, TWriteReturn>}
 */
export const streamIterator = (iterator, options = {}) => {
  const {
    buffer = 0,
    readPattern,
    readReturnPattern,
    writePattern,
    writeReturnPattern,
  } = options;
  const iter = asyncIterate(iterator);

  // @ts-expect-error The Exo's Passable types are compatible with the template types
  return makeExo('PassableStream', PassableStreamInterface, {
    /**
     * @param {Promise<StreamNode<Passable, Passable>>} synPromise - Head of synchronize promise chain
     * @returns {Promise<StreamNode<Passable, Passable>>} - Head of acknowledge promise chain
     */
    stream(synPromise) {
      // Create acknowledge chain - we hold the resolver
      const { promise: ackHead, resolve: initialAckResolve } = makePromiseKit();
      let ackResolve = initialAckResolve;

      // Pump: process syncs and pull from iterator
      // With buffer > 1, we pre-pull values and send acks before waiting for syncs.
      // This allows the initiator to receive values without additional round-trips.
      (async () => {
        await null;
        /** @type {unknown} */
        let synValue;
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
            synValue = synNode.value;
            synPromise = synNode.promise;
          }

          // Pull next value from iterator, passing TWrite value
          // eslint-disable-next-line no-await-in-loop
          const result = await iter.next(/** @type {any} */ (synValue));

          if (result.done) {
            ackResolve(freeze({ value: result.value, promise: null }));
            break;
          }
          const { promise, resolve } = makePromiseKit();
          ackResolve(freeze({ value: result.value, promise }));
          ackResolve = resolve;
        }
      })().catch(err => {
        // Abort: resolve tail with rejection
        ackResolve(Promise.reject(err));
      });

      // Return ackHead directly - E.get() pipelining handles remote access
      return ackHead;
    },

    /**
     * Returns the pattern for validating TRead (yielded values).
     * @returns {Pattern | undefined}
     */
    readPattern() {
      return readPattern;
    },

    /**
     * Returns the pattern for validating TReadReturn (return value).
     * @returns {Pattern | undefined}
     */
    readReturnPattern() {
      return readReturnPattern;
    },

    /**
     * Returns the pattern for validating TWrite (next() values).
     * @returns {Pattern | undefined}
     */
    writePattern() {
      return writePattern;
    },

    /**
     * Returns the pattern for validating TWriteReturn (return() value).
     * @returns {Pattern | undefined}
     */
    writeReturnPattern() {
      return writeReturnPattern;
    },
  });
};
