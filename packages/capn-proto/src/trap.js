// @ts-check
/* global globalThis, atob, btoa */
/**
 * Trap: synchronous round-trip via SharedArrayBuffer + Atomics.
 *
 * The framing layer is identical to `@endo/captp/src/atomics.js`: a status
 * word, a length word, and a data buffer carved out of a SharedArrayBuffer.
 * What changes is what we put in the data slices: instead of JSON, we
 * transmit framed Cap'n Proto bytes (the same framed Call/Return pair that
 * we'd otherwise send through the asynchronous transport).
 *
 * `makeAtomicsTrapHost` and `makeAtomicsTrapGuest` here are thin wrappers
 * around the captp originals; we re-export them so a Cap'n Proto user can
 * adopt the same flow as a CapTP user, with bytes already encoded.
 */

import {
  makeAtomicsTrapHost as captpHost,
  makeAtomicsTrapGuest as captpGuest,
  TRANSFER_OVERHEAD_LENGTH,
  MIN_DATA_BUFFER_LENGTH,
  MIN_TRANSFER_BUFFER_LENGTH,
} from '@endo/captp';

export {
  TRANSFER_OVERHEAD_LENGTH,
  MIN_DATA_BUFFER_LENGTH,
  MIN_TRANSFER_BUFFER_LENGTH,
};

/**
 * Adapt the captp host so it ferries [isReject, framedBytes] tuples instead
 * of [isReject, capdata]. The captp host expects to JSON.stringify its
 * payload; we wrap our framed bytes as a base64 string before handoff so the
 * underlying machinery is unchanged.
 *
 * @param {SharedArrayBuffer} transferBuffer
 */
const NodeBuffer = /** @type {any} */ (globalThis).Buffer;
const hasBuffer = typeof NodeBuffer !== 'undefined';

export const makeCapnpTrapHost = transferBuffer => {
  const inner = captpHost(transferBuffer);
  return async function* trapHost([isReject, framed]) {
    const u8 = new Uint8Array(framed);
    let b64;
    if (hasBuffer) {
      b64 = NodeBuffer.from(u8).toString('base64');
    } else {
      // btoa only accepts a binary string. Build it lazily here, since
      // String concat per byte is O(n) in modern engines (small chunks
      // would be unnecessary with Array.from + join, but for typical
      // trap-sized payloads the simple loop is adequate).
      let bin = '';
      for (let i = 0; i < u8.length; i += 1) bin += String.fromCharCode(u8[i]);
      b64 = btoa(bin);
    }
    yield* /** @type {any} */ (inner)([isReject, b64]);
  };
};

/**
 * @param {SharedArrayBuffer} transferBuffer
 */
export const makeCapnpTrapGuest = transferBuffer => {
  const inner = captpGuest(transferBuffer);
  return ({ startTrap }) => {
    const [isReject, b64] = /** @type {any} */ (inner)(
      /** @type {any} */ ({ startTrap }),
    );
    let bytes;
    if (hasBuffer) {
      bytes = new Uint8Array(NodeBuffer.from(b64, 'base64'));
    } else {
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    }
    // `bytes.buffer` may be a pooled ArrayBuffer (Node Buffer) where
    // `bytes` covers only [byteOffset, byteOffset + byteLength). Slice
    // out the exact view to avoid leaking adjacent prefix/suffix bytes
    // that would corrupt downstream framing.
    return [
      isReject,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    ];
  };
};
