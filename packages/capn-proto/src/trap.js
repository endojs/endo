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
    let bin = '';
    for (let i = 0; i < u8.length; i += 1) bin += String.fromCharCode(u8[i]);
    const b64 = hasBuffer ? NodeBuffer.from(u8).toString('base64') : btoa(bin);
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
    return [isReject, bytes.buffer];
  };
};
