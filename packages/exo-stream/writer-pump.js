// @ts-check

import { makePromiseKit } from '@endo/promise-kit';

import { asyncIterate } from './async-iterate.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { SomehowAsyncIterable, StreamNode, WriterPumpOptions } from './types.js' */

const { freeze } = Object;

/**
 * Creates a Writer responder pump (Consumer side).
 *
 * For a Writer stream:
 * - Syn values are `TWrite` (actual data from the initiator)
 * - Ack values are `undefined` (flow control only - "send me more")
 *
 * This is the core machinery for the Responder/Consumer side of a Writer.
 * The pump receives data from the initiator via the syn chain and pushes
 * each value to the local iterator via `iterator.next(value)`.
 *
 * This is the dual of `makeReaderPump`. The reader pump pulls from an
 * iterator, the writer pump pushes to one.
 *
 * @template [TWrite=Passable]
 * @template [TWriteReturn=undefined]
 * @param {SomehowAsyncIterable<unknown, TWrite, TWriteReturn>} iterable
 * @param {WriterPumpOptions} [options]
 * @returns {(synPromise: ERef<StreamNode<TWrite, Passable>>) => Promise<StreamNode<undefined, TWriteReturn>>}
 */
export const makeWriterPump = (iterable, options = {}) => {
  const { buffer = 0 } = options;
  const iterator = asyncIterate(iterable);

  /**
   * @param {ERef<StreamNode<TWrite, Passable>>} synPromise
   * @returns {Promise<StreamNode<undefined, TWriteReturn>>}
   */
  const pump = synPromise => {
    /** @type {import('@endo/promise-kit').PromiseKit<StreamNode<undefined, TWriteReturn>>} */
    const { promise: ackHead, resolve: initialAckResolve } = makePromiseKit();
    /** @type {(value: StreamNode<undefined, TWriteReturn> | PromiseLike<StreamNode<undefined, TWriteReturn>>) => void} */
    let ackResolve = initialAckResolve;

    (async () => {
      await null;
      for (let i = 0; ; i += 1) {
        // Pre-ack flow control for buffer iterations
        if (i < buffer) {
          const { promise, resolve } = makePromiseKit();
          ackResolve(freeze({ value: undefined, promise }));
          ackResolve = resolve;
        }

        // Wait for syn (data from initiator)
        // eslint-disable-next-line no-await-in-loop
        const synNode = await synPromise;

        if (synNode.promise === null) {
          // Initiator done - close local iterator
          if (iterator.return) {
            // eslint-disable-next-line no-await-in-loop
            await iterator.return();
          }
          ackResolve(
            freeze({
              value: /** @type {TWriteReturn} */ (undefined),
              promise: null,
            }),
          );
          break;
        }

        synPromise = synNode.promise;

        // Push received value to local iterator
        // eslint-disable-next-line no-await-in-loop
        await iterator.next(synNode.value);

        // Ack after buffer phase
        if (i >= buffer) {
          const { promise, resolve } = makePromiseKit();
          ackResolve(freeze({ value: undefined, promise }));
          ackResolve = resolve;
        }
      }
    })().catch(err => {
      // Abort: resolve tail with rejection
      ackResolve(Promise.reject(err));
    });

    return ackHead;
  };

  return pump;
};
