// @ts-check

import { makeExo } from '@endo/exo';
import { decodeBase64 } from '@endo/base64';

import { PassableBytesWriterInterface } from './type-guards.js';
import { makeWriterPump } from './writer-pump.js';
import { asyncIterate } from './async-iterate.js';

/** @import { Pattern } from '@endo/patterns' */
/** @import { SomehowAsyncIterable, PassableBytesWriter, MakeBytesWriterOptions } from './types.js' */

/**
 * Convert a local sink AsyncIterator to a remote PassableBytesWriter reference
 * (Responder/Consumer side).
 *
 * This is the Consumer for a bytes Writer: it wraps a local sink iterator and
 * receives base64-encoded values from the remote Initiator/Producer, decoding
 * them to Uint8Array before pushing to the local iterator.
 *
 * Bytes are automatically base64-decoded on receipt from CapTP.
 * Uses streamBase64() method instead of stream() to allow future migration
 * to direct bytes transport when CapTP supports it. At that time, bytes-streamable
 * Exos can implement stream() directly, and initiators can gracefully transition
 * to using iterateWriter() instead of iterateBytesWriter().
 *
 * The interface implies Uint8Array writes (no writePattern method).
 * Only writeReturnPattern can be customized.
 *
 * The writer uses bidirectional promise chains for flow control:
 * - Initiator sends synchronizations (base64 strings) via the synchronization chain
 * - Responder sends acknowledgements via the acknowledgement chain to induce production
 *
 * @param {SomehowAsyncIterable<unknown, Uint8Array>} iterator
 * @param {MakeBytesWriterOptions} [options]
 * @returns {PassableBytesWriter}
 */
export const bytesWriterFromIterator = (iterator, options = {}) => {
  const { buffer = 0, writeReturnPattern } = options;

  // Create a decoding adapter that intercepts the writer pump's pushes.
  // The writer pump will push base64 strings; we decode to Uint8Array
  // before forwarding to the real sink iterator.
  const sinkIterator = asyncIterate(iterator);
  const decodingIterator = {
    /** @param {string} base64Value */
    next(base64Value) {
      const bytes = decodeBase64(base64Value);
      return sinkIterator.next(/** @type {any} */ (bytes));
    },
    /** @param {any} [value] */
    return(value) {
      if (sinkIterator.return) {
        return sinkIterator.return(value);
      }
      return Promise.resolve({ done: true, value: undefined });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  const pump = makeWriterPump(decodingIterator, { buffer });

  // @ts-expect-error The Exo's Passable types are compatible with the template types
  return makeExo('PassableBytesWriter', PassableBytesWriterInterface, {
    streamBase64: pump,

    /**
     * Returns the pattern for validating TWriteReturn (return value).
     * @returns {Pattern | undefined}
     */
    writeReturnPattern() {
      return writeReturnPattern;
    },
  });
};
