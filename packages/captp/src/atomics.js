import { X, Fail } from '@endo/errors';

/**
 * The synchronization overhead of the transfer buffer, the rest of which is the
 * data buffer.
 *
 *   [lenbuf: ...BigInt64Array(1),
 *    statusbuf: ...Int32Array(1),
 *    databuf: ...Uint8Array(N)]
 */
export const TRANSFER_OVERHEAD_LENGTH =
  1 * BigInt64Array.BYTES_PER_ELEMENT + 1 * Int32Array.BYTES_PER_ELEMENT;

/**
 * Minimum length in bytes of the data buffer within the transfer buffer.
 *
 * This is a pathological minimum, but exercised by the unit test.
 */
export const MIN_DATA_BUFFER_LENGTH = 1;

/**
 * Minimum length in bytes of the transfer buffer.
 */
export const MIN_TRANSFER_BUFFER_LENGTH =
  MIN_DATA_BUFFER_LENGTH + TRANSFER_OVERHEAD_LENGTH;

// These are flags for the status buffer.
const STATUS_FLAG_WAITING_TO_READ = 1 << 0;
const STATUS_FLAG_WRITTEN = 1 << 1;

/**
 * Return a status buffer, length buffer, and data buffer backed by transferBuffer.
 *
 * @param {SharedArrayBuffer} transferBuffer the backing buffer
 */
const splitTransferBuffer = transferBuffer => {
  transferBuffer.byteLength >= MIN_TRANSFER_BUFFER_LENGTH ||
    Fail`Transfer buffer of ${transferBuffer.byteLength} bytes is smaller than MIN_TRANSFER_BUFFER_LENGTH ${MIN_TRANSFER_BUFFER_LENGTH}`;
  const lenbuf = new BigInt64Array(transferBuffer, 0, 1);

  // The documentation says that this needs to be an Int32Array for use with
  // Atomics.notify:
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/notify#syntax
  const statusbuf = new Int32Array(transferBuffer, lenbuf.byteLength, 1);
  const overheadLength = lenbuf.byteLength + statusbuf.byteLength;
  assert.equal(
    overheadLength,
    TRANSFER_OVERHEAD_LENGTH,
    X`Internal error; actual overhead ${overheadLength} of bytes is not TRANSFER_OVERHEAD_LENGTH ${TRANSFER_OVERHEAD_LENGTH}`,
  );
  const databuf = new Uint8Array(transferBuffer, overheadLength);
  databuf.byteLength >= MIN_DATA_BUFFER_LENGTH ||
    Fail`Transfer buffer of size ${transferBuffer.byteLength} only supports ${databuf.byteLength} data bytes; need at least ${MIN_DATA_BUFFER_LENGTH}`;
  return harden({ statusbuf, lenbuf, databuf });
};

/**
 * @callback BufferProducer
 * @param {Uint8Array} buf
 * @returns {{byteLength: number; more: boolean;}}
 */

/**
 * Create a JSON producer for the given object.
 *
 * @param {any} obj
 * @returns {BufferProducer}
 */
const makeJSONProducer = obj => {
  const json = JSON.stringify(obj);
  return makeUTF8Producer(json);
};

/**
 * Create a UTF8 producer for the given string.
 *
 * @param {string} str
 * @returns {BufferProducer}
 */
const makeUTF8Producer = str => {
  const te = new TextEncoder();
  let remaining = str;

  return buf => {
    // Encode as much of the remaining string as will fit in buf.
    const { read, written } = te.encodeInto(remaining, buf);

    // Drop the part we just encoded from the remaining string.
    remaining = remaining.slice(read);
    return { byteLength: written, more: Boolean(remaining.length) };
  };
};

/**
 * @template V
 * @callback BufferConsumer
 * @param {Uint8Array<SharedArrayBuffer>} buf
 * @param {boolean} more
 * @returns {V | null} the transferred value, or null if more is expected
 */

/**
 * Create a consumer that decodes buffers to a string.
 *
 * @param {string} [encoding] the text encoding to use; defaults to 'utf8'
 * @returns {BufferConsumer<string>}
 */
const makeStringConsumer = (encoding = 'utf8') => {
  const td = new TextDecoder(encoding);
  const chunks = [];

  return (buf, more) => {
    // Decode the next utf8 chunk, with `stream: true` if more input is
    // expected.
    const str = td.decode(buf, { stream: more });

    // Accumulate the string chunks until done.
    chunks.push(str);

    if (more) {
      return null;
    }

    // All done; accumulate the chunks and return them.
    return chunks.join('');
  };
};

/**
 * Create a consumer that decodes buffers to UTF8, then parses themt as JSON.
 *
 * @param {string} [encoding] the text encoding to use; defaults to 'utf-8'
 * @returns {BufferConsumer<any>}
 */
const makeJSONConsumer = encoding => {
  const consumeUTF8 = makeStringConsumer(encoding);
  return (buf, more) => {
    const consumed = consumeUTF8(buf, more);
    if (more || consumed === null) {
      return null;
    }
    return JSON.parse(consumed);
  };
};

/**
 *
 * @param {SharedArrayBuffer} transferBuffer
 * @param {(obj: any) => BufferProducer} makeProducer
 * @returns {(obj: any) => AsyncGenerator<void, void, boolean>}
 */
export const makeAtomicsWrite = (transferBuffer, makeProducer) => {
  const { statusbuf, lenbuf, databuf } = splitTransferBuffer(transferBuffer);

  return harden(async function* produce(obj) {
    // Start producing message buffer chunks.
    const producer = makeProducer(obj);

    // Send chunks in the data transfer buffer.
    let more = true;
    while (more) {
      // Fill the next portion of the data buffer.
      const { more: hasMore, byteLength } = producer(databuf);
      more = !!hasMore;

      // Encode the byteLength number and more boolean (negative if no more).
      const len = BigInt(more ? byteLength : -byteLength);
      lenbuf[0] = len;

      // Notify our consumer of this data buffer.
      Atomics.store(statusbuf, 0, STATUS_FLAG_WRITTEN);
      Atomics.notify(statusbuf, 0, 1);

      if (more) {
        // Wait until the next guest call to `it.next(newMore)`.  If the guest
        // calls `it.return()` or `it.throw()`, then this yield will return or
        // throw, terminating the generator function early.
        more = yield;
      }
    }
  });
};

/**
 * Create a trapHost that can be paired with makeAtomicsTrapGuest.
 *
 * This host encodes the transfer buffer and returns it in consecutive slices
 * when the guest iterates over it.
 *
 * @param {SharedArrayBuffer} transferBuffer
 * @returns {import('./types.js').TrapHost}
 */
export const makeAtomicsTrapHost = transferBuffer => {
  return makeAtomicsWrite(transferBuffer, makeJSONProducer);
};

/**
 * @callback MakeSynchronousProducerDriver create a synchronous producer driver
 * @returns {Iterator<void, void, boolean>} an iterator that exposes `.next(more)`
 * to produce the next buffer value, optional `.throw()` to abort the producer,
 * and optional `.return()` to cleanly terminate the producer.
 */

/**
 * Create a synchronous reader of the results of startTransferProtocol message
 * invocations.
 *
 * @template V
 * @param {SharedArrayBuffer} transferBuffer
 * @param {() => BufferConsumer<V>} makeConsumer a factory for a consumer to process the incoming data; defaults to a JSON consumer
 * @returns {(makeProducerDriver: MakeSynchronousProducerDriver) => V}
 */
export const makeAtomicsReadSync = (transferBuffer, makeConsumer) => {
  const { statusbuf, lenbuf, databuf } = splitTransferBuffer(transferBuffer);

  return makeProducerDriver => {
    // Defensively reinitialize the transfer buffer state.
    new Uint8Array(transferBuffer).fill(0);

    // Start the protocol by sending the trap call to the host.
    const it = makeProducerDriver();

    const consumer = makeConsumer();
    try {
      let more = true;
      /** @type {V | null} */
      let result = null;
      while (more) {
        // Tell that we are ready for another buffer.
        Atomics.store(statusbuf, 0, STATUS_FLAG_WAITING_TO_READ);

        // Let the host know we're ready for the next buffer.
        const { done: itDone } = it.next(more);
        !itDone || Fail`Internal error; it.next() returned done=${itDone}`;

        // Wait for the host to wake us.
        Atomics.wait(statusbuf, 0, STATUS_FLAG_WAITING_TO_READ);

        // Determine whether this is the last buffer.
        const len = lenbuf[0];
        more = len > 0n;
        const byteLength = Number(more ? len : -len);

        // Consume the next buffer chunk.
        result = consumer(databuf.subarray(0, byteLength), more);
      }
      return /** @type {V} */ (result);
    } catch (e) {
      // If the consumer threw, then abort the host iterator too.  If the host
      // iterator has already finished, then this throw is harmless.
      it.throw?.(e);

      // Rethrow.
      throw e;
    } finally {
      // If we exited the loop normally, then return from the host iterator too.  If
      // the host iterator has already finished, then this return is harmless.
      it.return?.();

      // If neither the throw nor the return were implemented, make a last ditch
      // effort to exit the producer gracefully.
      it.next(false);
    }
  };
};

/**
 * Create a trapGuest that can be paired with makeAtomicsTrapHost.
 *
 * This guest iterates through the consecutive slices of the JSON-encoded data,
 * then decodes and returns it.
 *
 * @param {SharedArrayBuffer} transferBuffer
 * @returns {import('./types.js').TrapGuest}
 */
export const makeAtomicsTrapGuest = transferBuffer => {
  const readSync = makeAtomicsReadSync(transferBuffer, makeJSONConsumer);
  return harden(({ startTrap }) => {
    return readSync(startTrap);
  });
};
