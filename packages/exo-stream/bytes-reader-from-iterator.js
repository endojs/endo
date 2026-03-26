// @ts-check

import { makeExo } from '@endo/exo';
import { encodeBase64 } from '@endo/base64';
import { mapReader } from '@endo/stream';

import { PassableBytesReaderInterface } from './type-guards.js';
import { makeReaderPump } from './reader-pump.js';

/** @import { Pattern } from '@endo/patterns' */
/** @import { SomehowAsyncIterable, PassableBytesReader, MakeBytesReaderOptions } from './types.js' */

/**
 * Convert a local AsyncIterator<Uint8Array> to a remote PassableBytesReader reference
 * (Responder/Producer side).
 *
 * This is the Producer for a bytes Reader: it wraps a local bytes iterator and
 * produces base64-encoded values for the remote Initiator/Consumer.
 *
 * Bytes are automatically base64-encoded for transmission over CapTP.
 * Uses streamBase64() method instead of stream() to allow future migration
 * to direct bytes transport when CapTP supports it. At that time, bytes-streamable
 * Exos can implement stream() directly, and initiators can gracefully transition
 * to using iterateReader() instead of iterateBytesReader().
 *
 * The interface implies Uint8Array yields (no readPattern method).
 * Only readReturnPattern can be customized.
 *
 * The reader uses bidirectional promise chains for flow control:
 * - Initiator sends synchronizations via the synchronization chain to induce
 *   production. When the initiator calls `return(value)` to close early, the
 *   final syn node carries that argument value. If the responder is backed by a
 *   JavaScript iterator with a `return(value)` method, it forwards the argument
 *   and uses the iterator’s returned value as the terminal ack; otherwise it
 *   terminates with the original argument value.
 * - Responder sends acknowledgements (base64 strings) via the acknowledgement chain
 *
 * @param {SomehowAsyncIterable<Uint8Array>} bytesIterator
 * @param {MakeBytesReaderOptions} [options]
 * @returns {PassableBytesReader}
 */
export const bytesReaderFromIterator = (bytesIterator, options = {}) => {
  const { buffer = 0, readReturnPattern } = options;

  // Encode bytes to base64 strings
  const base64Iterator = mapReader(
    // @ts-expect-error mapReader types aren't perfect with iterables
    bytesIterator,
    encodeBase64,
  );

  const pump = makeReaderPump(base64Iterator, { buffer });

  // @ts-expect-error The Exo's Passable types are compatible with the template types
  return makeExo('PassableBytesReader', PassableBytesReaderInterface, {
    streamBase64: pump,

    /**
     * Returns the pattern for validating TReadReturn (return value).
     * @returns {Pattern | undefined}
     */
    readReturnPattern() {
      return readReturnPattern;
    },
  });
};
