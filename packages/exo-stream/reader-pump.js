// @ts-check

import { makePromiseKit } from '@endo/promise-kit';

import { asyncIterate } from './async-iterate.js';

/** @import { ERef } from '@endo/eventual-send' */
/** @import { SomehowAsyncIterable, StreamNode, ReaderPumpOptions } from './types.js' */

const { freeze } = Object;

/**
 * Creates a Reader responder pump (Producer side).
 *
 * For a Reader stream:
 * - Syn values are `undefined` (flow control only - "give me more")
 * - Ack values are `TRead` (actual data from the iterator)
 *
 * This is the core machinery for the Responder/Producer side of a Reader.
 * Use this to add streaming methods to custom Exos.
 *
 * Example: Building a content-addressable bytes reader
 * ```js
 * import { makeExo } from '@endo/exo';
 * import { makeReaderPump } from '@endo/exo-stream/reader-pump.js';
 * import { mapReader } from '@endo/stream';
 * import { encodeBase64 } from '@endo/base64';
 *
 * const makeHashedBytesReader = (bytesIterator, hash) => {
 *   const base64Iterator = mapReader(bytesIterator, encodeBase64);
 *   const pump = makeReaderPump(base64Iterator);
 *
 *   return makeExo('HashedBytesReader', HashedBytesReaderInterface, {
 *     streamBase64: pump,
 *     sha512() {
 *       return hash;
 *     },
 *   });
 * };
 * ```
 *
 * @template [TRead=Passable]
 * @template [TReadReturn=undefined]
 * @param {SomehowAsyncIterable<TRead, undefined, TReadReturn>} iterable
 * @param {ReaderPumpOptions} [options]
 * @returns {(synPromise: ERef<StreamNode<undefined, Passable>>) => Promise<StreamNode<TRead, TReadReturn>>}
 */
export const makeReaderPump = (iterable, options = {}) => {
  const { buffer = 0 } = options;
  const iterator = asyncIterate(iterable);

  /**
   * @param {ERef<StreamNode<undefined, Passable>>} synPromise
   * @returns {Promise<StreamNode<TRead, TReadReturn>>}
   */
  const pump = synPromise => {
    /** @type {import('@endo/promise-kit').PromiseKit<StreamNode<TRead, TReadReturn>>} */
    const { promise: ackHead, resolve: initialAckResolve } = makePromiseKit();
    /** @type {(value: StreamNode<TRead, TReadReturn> | PromiseLike<StreamNode<TRead, TReadReturn>>) => void} */
    let ackResolve = initialAckResolve;

    (async () => {
      await null;
      for (let i = 0; ; i += 1) {
        // After buffer values, wait for sync before each pull
        if (i >= buffer) {
          // eslint-disable-next-line no-await-in-loop
          const synNode = await synPromise;
          if (synNode.promise === null) {
            // Initiator signaled close - call iterator.return() for cleanup
            /** @type {TReadReturn} */
            let returnValue = /** @type {TReadReturn} */ (undefined);
            if (iterator.return) {
              // eslint-disable-next-line no-await-in-loop
              const returned = await iterator.return();
              returnValue = /** @type {TReadReturn} */ (returned.value);
            }
            ackResolve(freeze({ value: returnValue, promise: null }));
            break;
          }
          synPromise = synNode.promise;
        }

        // Pull next value from iterator (no sync value for Reader - it's undefined)
        // eslint-disable-next-line no-await-in-loop
        const result = await iterator.next();

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

    return ackHead;
  };

  return pump;
};
