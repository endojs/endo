// @ts-check

import { makePipe } from '@endo/stream';
import { makePromiseKit } from '@endo/promise-kit';

/** @import { Reader, Writer } from '@endo/stream' */

/**
 * Adapts a libp2p duplex stream into @endo/stream-compatible
 * Reader<Uint8Array> and Writer<Uint8Array> pairs, suitable for
 * use with makeNetstringCapTP.
 *
 * libp2p streams have:
 *   - source: AsyncIterable yielding chunks (Uint8Array or Uint8ArrayList)
 *   - sink: a function that consumes an AsyncIterable and sends it
 *   - close()/abort(): lifecycle methods
 *
 * @endo/stream uses synchronized push/pull iterators (Reader/Writer).
 *
 * The adapter bridges these models using makePipe() for the write direction
 * and a thin wrapper for the read direction.
 *
 * @param {object} stream - A libp2p duplex stream
 * @param {AsyncIterable<any>} stream.source
 * @param {(source: AsyncIterable<Uint8Array>) => Promise<void>} stream.sink
 * @param {() => Promise<void>} stream.close
 * @param {(error?: Error) => void} stream.abort
 * @returns {{ reader: Reader<Uint8Array>, writer: Writer<Uint8Array>, closed: Promise<void> }}
 */
export const adaptLibp2pStream = stream => {
  const { promise: closed, resolve: resolveClosed } = makePromiseKit();

  // --- Read direction ---
  // Wrap stream.source as an @endo/stream Reader<Uint8Array>.
  const sourceIterator = stream.source[Symbol.asyncIterator]();

  /** @type {Reader<Uint8Array>} */
  const reader = harden({
    async next() {
      try {
        const result = await sourceIterator.next();
        if (result.done) {
          resolveClosed(undefined);
          return harden({ value: undefined, done: true });
        }
        const chunk = result.value;
        // Uint8ArrayList (from libp2p) has subarray() returning a contiguous
        // Uint8Array. Plain Uint8Array also has subarray() which returns a view.
        // Both are safe to pass downstream as Uint8Array.
        const bytes = chunk instanceof Uint8Array ? chunk : chunk.subarray();
        return harden({ value: bytes, done: false });
      } catch (err) {
        resolveClosed(undefined);
        throw err;
      }
    },
    async return() {
      if (sourceIterator.return) {
        await sourceIterator.return();
      }
      return harden({ value: undefined, done: true });
    },
    async throw(error) {
      if (sourceIterator.throw) {
        await sourceIterator.throw(error);
      }
      return harden({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  // --- Write direction ---
  // makePipe() returns [consumerEnd, producerEnd].
  // consumerEnd is iterable (pass to stream.sink).
  // producerEnd.next(value) pushes data.
  const [pipeSource, pipePush] = makePipe();

  const sinkDone = stream.sink(
    /** @type {AsyncIterable<Uint8Array>} */ (pipeSource),
  );

  sinkDone.then(
    () => resolveClosed(undefined),
    () => resolveClosed(undefined),
  );

  // If the sink fails, propagate the error to the push side so pending
  // writes don't hang indefinitely.
  sinkDone.catch(err => {
    pipePush.throw(/** @type {Error} */ (err)).catch(() => {});
  });

  /** @type {Writer<Uint8Array>} */
  const writer = harden({
    async next(value) {
      return pipePush.next(value);
    },
    async return(value) {
      const result = await pipePush.return(value);
      try {
        await stream.close();
      } catch (_) {
        // Ignore close errors during cleanup.
      }
      return result;
    },
    async throw(error) {
      const result = await pipePush.throw(error);
      try {
        stream.abort(error);
      } catch (_) {
        // Ignore abort errors during cleanup.
      }
      return result;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  return harden({ reader, writer, closed });
};
harden(adaptLibp2pStream);
