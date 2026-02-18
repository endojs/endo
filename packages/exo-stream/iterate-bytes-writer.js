// @ts-check

import { E } from '@endo/far';
import { encodeBase64 } from '@endo/base64';
import { makePromiseKit } from '@endo/promise-kit';

import { asyncIterate } from './async-iterate.js';

/** @import { ERef } from '@endo/far' */
/** @import { PassableBytesWriter, StreamNode, SomehowAsyncIterable, IterateBytesWriterOptions } from './types.js' */

const { freeze } = Object;

/**
 * Send bytes from a local AsyncIterator<Uint8Array> to a remote PassableBytesWriter reference
 * (Initiator/Producer side).
 *
 * This is the Producer for a bytes Writer: it sends bytes from a local iterator
 * to the remote Responder/Consumer. Bytes are automatically base64-encoded for
 * transmission over CapTP.
 *
 * Uses the bidirectional promise chain protocol for streaming with flow control.
 * With buffer > 0, pre-sends data values before waiting for acks, keeping the
 * responder busy without additional round-trips.
 *
 * Calls streamBase64() on the responder, which allows future migration to direct
 * bytes transport when CapTP supports it. At that time, bytes-streamable Exos can
 * implement stream() directly, and initiators can gracefully transition to using
 * iterateWriter() instead of iterateBytesWriter().
 *
 * @param {ERef<PassableBytesWriter>} bytesWriterRef
 * @param {SomehowAsyncIterable<Uint8Array>} bytesIterator
 * @param {IterateBytesWriterOptions} [options]
 * @returns {Promise<void>}
 */
export const iterateBytesWriter = async (
  bytesWriterRef,
  bytesIterator,
  options = {},
) => {
  const { buffer = 0 } = options;
  const localIterator = asyncIterate(bytesIterator);

  // Create synchronize chain - we hold the resolver
  const { promise: synHead, resolve: initialSynResolve } = makePromiseKit();
  let synResolve = initialSynResolve;

  // Pre-send 'buffer' data values to prime the pump
  for (let i = 0; i < buffer; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await localIterator.next();
    if (result.done) {
      // Iterator exhausted during pre-buffering
      synResolve(freeze({ value: undefined, promise: null }));
      // Still call streamBase64() so responder processes what we sent
      E(bytesWriterRef).streamBase64(synHead);
      return;
    }
    const base64Value = encodeBase64(result.value);
    const { promise, resolve } = makePromiseKit();
    synResolve(freeze({ value: base64Value, promise }));
    synResolve = resolve;
  }

  // Call streamBase64() - returns a promise for the acknowledge (flow-control) chain head
  /** @type {Promise<StreamNode<undefined, Passable>>} */
  let ackPromise = E(bytesWriterRef).streamBase64(synHead);

  // Track how many pre-buffered acks remain
  let preBufferRemaining = buffer;

  for (;;) {
    // With pre-buffering, acks are available before new sends are needed.
    // Without pre-buffering (buffer=0), we must send data BEFORE awaiting ack.
    if (preBufferRemaining === 0) {
      // Pull, encode, and send data first to unblock the responder
      // eslint-disable-next-line no-await-in-loop
      const result = await localIterator.next();
      if (result.done) {
        synResolve(freeze({ value: undefined, promise: null }));
        break;
      }
      const base64Value = encodeBase64(result.value);
      const { promise, resolve } = makePromiseKit();
      synResolve(freeze({ value: base64Value, promise }));
      synResolve = resolve;
    }

    // Await ack (flow control - value is undefined)
    // eslint-disable-next-line no-await-in-loop
    const ackNode = await ackPromise;

    if (ackNode.promise === null) {
      // Responder closed
      return;
    }
    ackPromise = ackNode.promise;

    // With pre-buffering, send data AFTER consuming ack to maintain the pipeline
    if (preBufferRemaining > 0) {
      preBufferRemaining -= 1;
      // eslint-disable-next-line no-await-in-loop
      const result = await localIterator.next();
      if (result.done) {
        synResolve(freeze({ value: undefined, promise: null }));
        break;
      }
      const base64Value = encodeBase64(result.value);
      const { promise, resolve } = makePromiseKit();
      synResolve(freeze({ value: base64Value, promise }));
      synResolve = resolve;
    }
  }
};
