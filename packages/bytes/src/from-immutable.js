// @ts-check

import harden from '@endo/harden';

/**
 * Copies the contents of an immutable `ArrayBuffer` into a fresh
 * mutable `Uint8Array`.
 *
 * Immutable `ArrayBuffer` instances (proposal-immutable-arraybuffer)
 * cannot back a `Uint8Array` view directly, and APIs such as
 * `TextDecoder.decode` reject them.  This helper produces a working
 * `Uint8Array` copy that callers can pass to those APIs.
 *
 * Accepts any `ArrayBufferLike` so callers do not need to narrow the
 * argument before invoking.
 *
 * @param {ArrayBufferLike} buffer
 * @returns {Uint8Array}
 */
export const bytesFromImmutable = buffer => {
  return new Uint8Array(buffer.slice(0));
};
harden(bytesFromImmutable);
