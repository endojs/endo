// @ts-check

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

import { asyncIterate } from './async-iterate.js';

/** @import { Passable } from '@endo/pass-style' */
/** @import { ERef } from '@endo/far' */
/** @import { PassableWriter, StreamNode, SomehowAsyncIterable, IterateWriterOptions } from './types.js' */

const { freeze } = Object;

/**
 * Send data from a local iterator to a remote PassableWriter reference
 * (Initiator/Producer side).
 *
 * This creates a Writer stream where:
 * - Synchronization values are `TWrite` (actual data to send)
 * - Acknowledgement values are `undefined` (flow control only - "send me more")
 *
 * The Producer sends values from a local iterator to the remote
 * Responder/Consumer.
 *
 * Uses the bidirectional promise chain protocol for streaming with flow control.
 * With buffer > 0, pre-sends data values before waiting for acks, keeping the
 * responder busy without additional round-trips.
 *
 * @template [TWrite=Passable]
 * @template [TWriteReturn=undefined]
 * @param {ERef<PassableWriter<TWrite, TWriteReturn>>} writerRef
 * @param {SomehowAsyncIterable<TWrite, undefined, TWriteReturn>} iterator
 * @param {IterateWriterOptions<TWrite, TWriteReturn>} [options]
 * @returns {Promise<void>}
 */
export const iterateWriter = async (writerRef, iterator, options = {}) => {
  const { buffer = 0 } = options;
  const localIterator = asyncIterate(iterator);

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
      // Still call stream() so responder processes what we sent
      E(writerRef).stream(synHead);
      return;
    }
    const { promise, resolve } = makePromiseKit();
    synResolve(freeze({ value: result.value, promise }));
    synResolve = resolve;
  }

  // Call stream() - returns a promise for the acknowledge (flow-control) chain head
  /** @type {Promise<StreamNode<undefined, TWriteReturn>>} */
  let ackPromise = E(writerRef).stream(synHead);

  // Track how many pre-buffered acks remain
  let preBufferRemaining = buffer;

  for (;;) {
    // With pre-buffering, acks are available before new sends are needed.
    // Without pre-buffering (buffer=0), we must send data BEFORE awaiting ack.
    if (preBufferRemaining === 0) {
      // Pull and send data first to unblock the responder
      // eslint-disable-next-line no-await-in-loop
      const result = await localIterator.next();
      if (result.done) {
        synResolve(freeze({ value: undefined, promise: null }));
        break;
      }
      const { promise, resolve } = makePromiseKit();
      synResolve(freeze({ value: result.value, promise }));
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
      const { promise, resolve } = makePromiseKit();
      synResolve(freeze({ value: result.value, promise }));
      synResolve = resolve;
    }
  }
};
