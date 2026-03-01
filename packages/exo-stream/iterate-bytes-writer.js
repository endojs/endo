// @ts-check
/* eslint-disable no-await-in-loop */

import { E } from '@endo/far';
import { encodeBase64 } from '@endo/base64';
import { makePromiseKit } from '@endo/promise-kit';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef } from '@endo/far' */
/** @import { PassableBytesWriter, StreamNode, IterateBytesWriterOptions, BytesWriterIterator } from './types.js' */

/**
 * Create a local bytes writer iterator that sends Uint8Array values to a remote
 * PassableBytesWriter reference (Initiator/Producer side).
 *
 * Bytes are automatically base64-encoded for transmission over CapTP.
 * Uses the bidirectional promise chain protocol for streaming with flow control.
 * When the local iterator is closed early via `return(value)`, the final syn node
 * carries that argument value to the responder, which may replace it with its
 * own return value if it implements `return(value)`.
 * With buffer > 0, pre-sends data values before waiting for acks, keeping the
 * responder busy without additional round-trips.
 *
 * Calls streamBase64() on the responder, which allows future migration to direct
 * bytes transport when CapTP supports it. At that time, bytes-streamable Exos can
 * implement stream() directly, and initiators can gracefully transition to using
 * iterateWriter() instead of iterateBytesWriter().
 *
 * @template {Passable} [TWriteReturn=undefined]
 * @param {ERef<PassableBytesWriter<TWriteReturn>>} bytesWriterRef
 * @param {IterateBytesWriterOptions<TWriteReturn>} [options]
 * @returns {BytesWriterIterator<TWriteReturn>}
 */
export const iterateBytesWriter = (bytesWriterRef, options = {}) => {
  const { buffer = 0 } = options;

  // Create synchronize chain - we hold the resolver
  const { promise: synHead, resolve: initialSynResolve } = makePromiseKit();
  let synResolve = initialSynResolve;

  // Call streamBase64() - returns a promise for the acknowledge (flow-control) chain head
  /** @type {Promise<StreamNode<undefined, TWriteReturn>>} */
  let ackPromise = E(bytesWriterRef).streamBase64(synHead);

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
      const base64Value = encodeBase64(value);
      const { promise, resolve } = makePromiseKit();
      synResolve(harden({ value: base64Value, promise }));
      synResolve = resolve;
      if (preBufferRemaining > 0) {
        preBufferRemaining -= 1;
        return harden({ done: false, value: undefined });
      }

      const ackNode = await ackPromise;
      if (ackNode.promise === null) {
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
        return harden({ done: true, value: terminalValue });
      })();
    }
    return terminalPromise;
  };

  /** @type {Promise<undefined>} */
  let queue = Promise.resolve(undefined);

  /** @type {BytesWriterIterator<TWriteReturn>} */
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
