// @ts-check
/* global BigUint64Array */

import { assert, details as X } from '@agoric/assert';

// This is a pathological minimum, but exercised by the unit test.
// transfer.
export const MIN_DATA_BUFFER_LENGTH = 1;

// Calculate how big the transfer buffer needs to be.
export const TRANSFER_OVERHEAD_LENGTH =
  BigUint64Array.BYTES_PER_ELEMENT + Int32Array.BYTES_PER_ELEMENT;
export const MIN_TRANSFER_BUFFER_LENGTH =
  MIN_DATA_BUFFER_LENGTH + TRANSFER_OVERHEAD_LENGTH;

// These are bit flags for the status element of the transfer buffer.
const STATUS_WAITING = 1;
const STATUS_FLAG_DONE = 2;
const STATUS_FLAG_REJECT = 4;

/**
 * Return a status buffer, length buffer, and data buffer backed by transferBuffer.
 *
 * @param {SharedArrayBuffer} transferBuffer the backing buffer
 */
const splitTransferBuffer = transferBuffer => {
  assert(
    transferBuffer.byteLength >= MIN_TRANSFER_BUFFER_LENGTH,
    X`Transfer buffer of ${transferBuffer.byteLength} bytes is smaller than MIN_TRANSFER_BUFFER_LENGTH ${MIN_TRANSFER_BUFFER_LENGTH}`,
  );
  const lenbuf = new BigUint64Array(transferBuffer, 0, 1);
  const statusbuf = new Int32Array(transferBuffer, lenbuf.byteLength, 1);
  const overheadLength = lenbuf.byteLength + statusbuf.byteLength;
  assert.equal(
    overheadLength,
    TRANSFER_OVERHEAD_LENGTH,
    X`Internal error; actual overhead ${overheadLength} of bytes is not TRANSFER_OVERHEAD_LENGTH ${TRANSFER_OVERHEAD_LENGTH}`,
  );
  const databuf = new Uint8Array(
    transferBuffer,
    lenbuf.byteLength + statusbuf.byteLength,
  );
  assert(
    databuf.byteLength >= MIN_DATA_BUFFER_LENGTH,
    X`Transfer buffer of size ${transferBuffer.byteLength} only supports ${databuf.byteLength} data bytes; need at least ${MIN_DATA_BUFFER_LENGTH}`,
  );
  return { statusbuf, lenbuf, databuf };
};

/**
 * Create a trapHost that can be paired with makeAtomicsTrapGuest.
 *
 * This host encodes the transfer buffer and returns it in consecutive slices
 * when the guest iterates over it.
 *
 * @param {SharedArrayBuffer} transferBuffer
 * @returns {TrapHost}
 */
export const makeAtomicsTrapHost = transferBuffer => {
  const { statusbuf, lenbuf, databuf } = splitTransferBuffer(transferBuffer);

  const te = new TextEncoder();

  return async function* trapHost([isReject, serialized]) {
    // Get the complete encoded message buffer.
    const json = JSON.stringify(serialized);
    const encoded = te.encode(json);

    // Send chunks in the data transfer buffer.
    let i = 0;
    let done = false;
    while (!done) {
      // Copy the next slice of the encoded arry to the data buffer.
      const subenc = encoded.subarray(i, i + databuf.length);
      databuf.set(subenc);

      // Save the length of the remaining data.
      lenbuf[0] = BigInt(encoded.length - i);

      // Calculate the next slice, and whether this is the last one.
      i += subenc.length;
      done = i >= encoded.length;

      // Find bitflags to represent the rejected and finished state.
      const rejectFlag = isReject ? STATUS_FLAG_REJECT : 0;
      const doneFlag = done ? STATUS_FLAG_DONE : 0;

      // Notify our guest for this data buffer.

      // eslint-disable-next-line no-bitwise
      statusbuf[0] = rejectFlag | doneFlag;
      Atomics.notify(statusbuf, 0, +Infinity);

      // Wait until the next call.
      yield;
    }
  };
};

/**
 * Create a trapGuest that can be paired with makeAtomicsTrapHost.
 *
 * This guest iterates through the consecutive slices of the JSON-encoded data,
 * then returns it.
 *
 * @param {SharedArrayBuffer} transferBuffer
 * @returns {TrapGuest}
 */
export const makeAtomicsTrapGuest = transferBuffer => {
  const { statusbuf, lenbuf, databuf } = splitTransferBuffer(transferBuffer);

  return ({ startTrap }) => {
    const td = new TextDecoder('utf-8');

    let json = '';

    // Start by sending the trap call to the host.
    const it = startTrap();

    let done = false;
    while (!done) {
      // Tell that we are ready for another buffer.
      statusbuf[0] = STATUS_WAITING;
      it.next();

      // Wait for the host to wake us.
      Atomics.wait(statusbuf, 0, STATUS_WAITING);

      // Determine whether this is the last buffer.
      // eslint-disable-next-line no-bitwise
      done = (statusbuf[0] & STATUS_FLAG_DONE) !== 0;

      // Decode the next part of the data buffer.
      json += td.decode(databuf.subarray(0, Number(lenbuf[0])), {
        stream: !done,
      });
    }

    // Tell the host we're finished.
    it.return();

    // eslint-disable-next-line no-bitwise
    const isReject = !!(statusbuf[0] & STATUS_FLAG_REJECT);

    // Parse the JSON data into marshalled form.
    const serialized = JSON.parse(json);
    return [isReject, serialized];
  };
};
