// @ts-check
/* eslint-disable no-await-in-loop */

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { mustMatch } from '@endo/patterns';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef } from '@endo/far' */
/** @import { PassableWriter, StreamNode, IterateWriterOptions, WriterIterator } from './types.js' */

/**
 * Create a local writer iterator that sends values to a remote PassableWriter
 * reference (Initiator/Producer side).
 *
 * This creates a Writer stream where:
 * - Synchronization values are `TWrite` (actual data to send). When the local
 *   iterator is closed early via `return(value)`, the final syn node carries that
 *   argument value to the responder, which may replace it with its own return
 *   value if it implements `return(value)`.
 * - Acknowledgement values are `undefined` (flow control only - "send me more")
 *
 * The Producer pushes values via `next(value)` to the remote Responder/Consumer.
 *
 * Uses the bidirectional promise chain protocol for streaming with flow control.
 * With buffer > 0, pre-sends data values before waiting for acks, keeping the
 * responder busy without additional round-trips.
 *
 * @template {Passable} [TWrite=Passable]
 * @template {Passable} [TWriteReturn=undefined]
 * @param {ERef<PassableWriter<TWrite, TWriteReturn>>} writerRef
 * @param {IterateWriterOptions<TWrite, TWriteReturn>} [options]
 * @returns {WriterIterator<TWrite, TWriteReturn>}
 */
export const iterateWriter = (writerRef, options = {}) => {
  const { buffer = 0, writePattern, writeReturnPattern } = options;

  // Create synchronize chain - we hold the resolver
  const { promise: synHead, resolve: initialSynResolve } = makePromiseKit();
  let synResolve = initialSynResolve;

  // Call stream() - returns a promise for the acknowledge (flow-control) chain head
  /** @type {Promise<StreamNode<undefined, TWriteReturn>>} */
  let ackPromise = E(writerRef).stream(synHead);

  /** @type {Promise<IteratorResult<undefined, TWriteReturn>> | null} */
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
      synResolve(harden({ value: undefined, promise: null }));
    }
    return terminalPromise;
  };

  // Track how many pre-buffered acks remain
  let preBufferRemaining = buffer;

  const next = async value => {
    if (terminalPromise) {
      return terminalPromise;
    }

    await null;

    try {
      if (writePattern !== undefined) {
        mustMatch(value, writePattern);
      }
      const { promise, resolve } = makePromiseKit();
      synResolve(harden({ value, promise }));
      synResolve = resolve;
      if (preBufferRemaining > 0) {
        preBufferRemaining -= 1;
        return harden({ done: false, value: undefined });
      }

      const ackNode = await ackPromise;
      if (ackNode.promise === null) {
        if (writeReturnPattern !== undefined) {
          mustMatch(ackNode.value, writeReturnPattern);
        }
        setTerminalDone(ackNode.value);
        return terminalPromise;
      }
      ackPromise = ackNode.promise;
      return harden({ done: false, value: undefined });
    } catch (error) {
      return fail(error);
    }
  };

  const close = async value => {
    if (!terminalPromise) {
      synResolve(harden({ value, promise: null }));
      terminalPromise = (async () => {
        await null;
        let node = await ackPromise;
        while (node.promise !== null) {
          node = await node.promise;
        }
        const terminalValue = await E.get(node).value;
        if (writeReturnPattern !== undefined) {
          mustMatch(terminalValue, writeReturnPattern);
        }
        return harden({ done: true, value: terminalValue });
      })();
    }
    return terminalPromise;
  };

  /** @type {Promise<undefined>} */
  let queue = Promise.resolve(undefined);

  /** @type {WriterIterator<TWrite, TWriteReturn>} */
  // @ts-expect-error Iterator type matching is complex
  const iterator = harden({
    async next(value) {
      const result = queue.then(() => next(value));
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },

    async return(value) {
      const result = queue.then(() => close(value));
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },

    async throw(error) {
      const result = queue.then(() => fail(error));
      queue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },

    [Symbol.asyncIterator]() {
      return iterator;
    },
  });

  return iterator;
};
