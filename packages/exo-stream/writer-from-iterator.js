// @ts-check

import { makeExo } from '@endo/exo';

import { PassableWriterInterface } from './type-guards.js';
import { makeWriterPump } from './writer-pump.js';

/** @import { Pattern } from '@endo/patterns' */
/** @import { SomehowAsyncIterable, MakeWriterOptions, PassableWriter } from './types.js' */

/**
 * Create a PassableWriter Exo from a local iterator (Responder/Consumer side).
 *
 * This creates a Writer stream where:
 * - Synchronization values are `TWrite` (actual data from the initiator)
 * - Acknowledgement values are `undefined` (flow control only - "send me more")
 *
 * The Responder wraps a local iterator and receives data from the remote
 * Initiator/Producer. Each received value is pushed to the iterator via
 * `iterator.next(value)`.
 *
 * This is the dual of `readerFromIterator`. The reader wraps an iterator it pulls
 * from, the writer wraps an iterator it pushes to.
 *
 * With buffer > 0, the responder pre-sends flow-control acks, allowing the
 * initiator to send data without additional round-trips.
 *
 * @template [TWrite=Passable]
 * @template [TWriteReturn=undefined]
 * @param {SomehowAsyncIterable<unknown, TWrite>} iterator
 * @param {MakeWriterOptions} [options]
 * @returns {PassableWriter<TWrite, TWriteReturn>}
 */
export const writerFromIterator = (iterator, options = {}) => {
  const { buffer = 0, writePattern, writeReturnPattern } = options;

  const pump = makeWriterPump(iterator, { buffer });

  return /** @type {PassableWriter<TWrite, TWriteReturn>} */ (
    /** @type {unknown} */ (
      makeExo('PassableWriter', PassableWriterInterface, {
        stream: pump,

        /**
         * Returns the pattern for validating TWrite (yielded values).
         * @returns {Pattern | undefined}
         */
        writePattern() {
          return writePattern;
        },

        /**
         * Returns the pattern for validating TWriteReturn (return value).
         * @returns {Pattern | undefined}
         */
        writeReturnPattern() {
          return writeReturnPattern;
        },
      })
    )
  );
};
