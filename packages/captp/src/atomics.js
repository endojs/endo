import { X, Fail } from '@endo/errors';
import { Lock, Cond } from './lock.js';

/**
 * The synchronization overhead of the transfer buffer, the rest of which is the
 * data buffer.
 *
 * We use the producer/consumer algorithm described in
 * https://www.geeksforgeeks.org/operating-systems/producer-consumer-problem-using-semaphores-set-1/
 *
 *
 *   [lenbuf: BigInt64Array(1),
 *    mutex: Lock, // protects all the state in the transfer buffer, including Cond variables.
 *    nonempty: Cond, // signaled when used > 0
 *    nonfull: Cond, // signaled when used < TOTAL_CHUNKS
 *    generation: Uint8Array(1), // disambiguates each transfer
 *    used: Uint8Array(1), // number of chunks used in databuf (0..TOTAL_CHUNKS)
 *    databuf: Uint8Array(N)]
 */
export const TRANSFER_OVERHEAD_BYTES =
  1 * BigInt64Array.BYTES_PER_ELEMENT +
  1 * Lock.NUMBYTES +
  2 * Cond.NUMBYTES +
  2 * Uint8Array.BYTES_PER_ELEMENT;

/**
 * The number of chunks in the data buffer.  Currently must be 1, since we just
 * have a single databuf.
 */
export const TOTAL_CHUNKS = 1;

/**
 * Minimum length in bytes of the data buffer within the transfer buffer.
 * We need at least 4 bytes to be able to encode a UTF-16 surrogate pair.
 *
 * This is a pathological minimum, but exercised by the unit test.
 */
export const MIN_DATA_BUFFER_BYTES = 4;

/**
 * Minimum length in bytes of the transfer buffer.
 */
export const MIN_TRANSFER_BUFFER_BYTES =
  MIN_DATA_BUFFER_BYTES + TRANSFER_OVERHEAD_BYTES;

/**
 * Return capacity counters, a length buffer, and data buffer backed by transferBuffer.
 *
 * @param {SharedArrayBuffer} transferBuffer the backing buffer
 */
const splitTransferBuffer = transferBuffer => {
  transferBuffer.byteLength >= MIN_TRANSFER_BUFFER_BYTES ||
    Fail`Transfer buffer of ${transferBuffer.byteLength} bytes is smaller than MIN_TRANSFER_BUFFER_BYTES ${MIN_TRANSFER_BUFFER_BYTES}`;

  let loc = 0;
  const lenbuf = new BigInt64Array(transferBuffer, loc, 1);
  loc += lenbuf.byteLength;

  const mutex = new Lock(transferBuffer, loc);
  loc += Lock.NUMBYTES;

  const nonfull = new Cond(mutex, loc);
  loc += Cond.NUMBYTES;

  const nonempty = new Cond(mutex, loc);
  loc += Cond.NUMBYTES;

  const generation = new Uint8Array(transferBuffer, loc, 1);
  loc += 1;

  const used = new Uint8Array(transferBuffer, loc, 1);
  loc += 1;

  const overheadBytes = loc;
  assert.equal(
    overheadBytes,
    TRANSFER_OVERHEAD_BYTES,
    X`Internal error; actual overhead of ${overheadBytes} bytes is not TRANSFER_OVERHEAD_BYTES ${TRANSFER_OVERHEAD_BYTES}`,
  );
  const databuf = new Uint8Array(transferBuffer, overheadBytes);
  MIN_DATA_BUFFER_BYTES >= 4 ||
    Fail`Internal error; MIN_DATA_BUFFER_BYTES ${MIN_DATA_BUFFER_BYTES} is too small to encode the largest utf8 character (4 bytes)`;
  databuf.byteLength >= MIN_DATA_BUFFER_BYTES ||
    Fail`Transfer buffer of size ${transferBuffer.byteLength} only supports ${databuf.byteLength} data bytes; need at least ${MIN_DATA_BUFFER_BYTES}`;

  return harden({
    mutex,
    nonfull,
    nonempty,
    used,
    generation,
    lenbuf,
    databuf,
  });
};

/**
 * Initialize the contents of a transfer buffer supplied by the caller.  We
 * assume that the capacity counters are set to a maximum of one empty chunk.
 *
 * @param {SharedArrayBuffer} transferBuffer
 * @param {number} [numChunks] currently must be undefined or 1
 */
export const initTransferBuffer = (transferBuffer, numChunks = 1) => {
  numChunks === 1 ||
    Fail`Only one chunk is currently supported; got ${numChunks}`;
  const { lenbuf, mutex, generation, nonfull, nonempty, used, databuf } =
    splitTransferBuffer(transferBuffer);

  let loc = lenbuf.byteLength;

  loc === mutex._ibase * Int32Array.BYTES_PER_ELEMENT ||
    Fail`Internal error; bad mutex Lock location ${loc}`;
  Lock.initialize(transferBuffer, loc);
  loc += Lock.NUMBYTES;

  loc === nonfull._ibase * Int32Array.BYTES_PER_ELEMENT ||
    Fail`Internal error; bad nonfull Cond location ${loc}`;
  loc = Cond.initialize(transferBuffer, loc);
  loc += Cond.NUMBYTES;

  loc === nonempty._ibase * Int32Array.BYTES_PER_ELEMENT ||
    Fail`Internal error; bad nonempty Cond location ${loc}`;
  loc = Cond.initialize(transferBuffer, loc);
  loc += Cond.NUMBYTES;

  loc === generation.byteOffset ||
    Fail`Internal error; bad generation location ${loc} does not match generation.byteOffset ${generation.byteOffset}`;
  loc += generation.byteLength;

  loc === used.byteOffset ||
    Fail`Internal error; bad used location ${loc} does not match used.byteOffset ${used.byteOffset}`;
  loc += used.byteLength;

  loc === databuf.byteOffset ||
    Fail`Internal error; bad final location ${loc} does not match databuf.byteOffset ${databuf.byteOffset}`;
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
    // The result tells us how many UTF-16 code units were read from the
    // string, and how many bytes were written to the buffer.
    //
    // We know this will always make progress (even in the face of surrogates)
    // because buf is at least 4 bytes.

    assert(buf.byteLength >= MIN_DATA_BUFFER_BYTES);
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
    try {
      return JSON.parse(consumed);
    } catch (e) {
      throw assert.error(X`Cannot parse JSON: ${consumed}`, SyntaxError, {
        cause: e,
      });
    }
  };
};

/**
 *
 * @param {SharedArrayBuffer} transferBuffer
 * @param {(obj: any) => BufferProducer} makeProducer
 * @returns {import('./types.js').TrapHost}
 */
export const makeAtomicsWrite = (transferBuffer, makeProducer) => {
  const { mutex, generation, nonempty, nonfull, used, lenbuf, databuf } =
    splitTransferBuffer(transferBuffer);

  return harden(async function* trapWrite(obj) {
    const origGen = generation[0];

    // Start producing message buffer chunks.
    const producer = makeProducer(obj);

    // Send chunks in the data transfer buffer.
    let more = true;
    MORE: while (more) {
      // Produce one chunk into the data buffer.
      mutex.lock();
      try {
        while (used[0] >= TOTAL_CHUNKS) {
          const thisGen = Atomics.load(generation, 0);
          if (thisGen !== origGen) {
            break MORE;
          }

          // Wait until the guest has consumed at least one chunk.
          await nonfull.waitAsync();
        }

        const thisGen = Atomics.load(generation, 0);
        if (thisGen !== origGen) {
          break MORE;
        }

        // Fill the next portion of the data buffer.
        const { more: hasMore, byteLength } = producer(databuf);
        more = !!hasMore;

        // Encode the byteLength number and more boolean (negative if no more).
        const len = BigInt(more ? byteLength : -byteLength);
        lenbuf[0] = len;

        // Indicate that one slot of the buffer is filled.
        used[0] += 1;
        nonempty.notifyOne();
      } finally {
        mutex.unlock();
      }

      if (more) {
        // Wait until the next guest call to `it.next(newMore)`.  If the guest
        // calls `it.return()` or `it.throw()`, then this yield will return or
        // throw, terminating the generator function early.
        more = yield;
      }
    }
    // All done
  });
};

/**
 * Create a trapHost that can be paired with makeAtomicsTrapGuest.
 *
 * This host encodes the transfer buffer and returns it in consecutive slices
 * when the guest iterates over it.
 *
 * @param {SharedArrayBuffer} transferBuffer
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
  const { mutex, generation, nonempty, nonfull, used, lenbuf, databuf } =
    splitTransferBuffer(transferBuffer);

  const generationWrap = 2 ** (8 * generation.BYTES_PER_ELEMENT);

  return makeProducerDriver => {
    // Start the protocol by sending the trap call to the host.
    const origGen = (Atomics.add(generation, 0, 1) + 1) % generationWrap;
    const it = makeProducerDriver();
    const consumer = makeConsumer();

    try {
      let more = true;
      /** @type {V | null} */
      let result = null;
      MORE: while (more) {
        // Let the host know we're ready for the next buffer.
        const { done: itDone } = it.next(more);
        !itDone || Fail`Internal error; it.next() returned done=${itDone}`;

        mutex.lock();
        try {
          while (used[0] <= 0) {
            const thisGen = Atomics.load(generation, 0);
            if (thisGen !== origGen) {
              break MORE;
            }

            // Wait upon nonzero filled capacity.
            nonempty.wait();
          }

          const thisGen = Atomics.load(generation, 0);
          if (thisGen !== origGen) {
            break MORE;
          }

          // Determine whether this is the last buffer.
          const len = lenbuf[0];
          more = len > 0n;
          const byteLength = Math.abs(Number(len));

          // Consume the next buffer chunk.
          result = consumer(databuf.subarray(0, byteLength), more);

          // Mark the chunk as consumed.
          used[0] -= 1;
          nonfull.notifyOne();
        } finally {
          mutex.unlock();
        }
      }
      return /** @type {V} */ (result);
    } catch (e) {
      // If the consumer threw, then abort the host iterator too.  If the host
      // iterator has already finished, then this throw is harmless.
      it?.throw?.(e);

      // Rethrow.
      throw e;
    } finally {
      // If we exited the loop normally, then return from the host iterator too.  If
      // the host iterator has already finished, then this return is harmless.
      it?.return?.();

      // If neither the throw nor the return were implemented, make a last ditch
      // effort to exit the producer gracefully.
      it?.next(false);
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
  return harden(({ startTrap }) => readSync(startTrap));
};
