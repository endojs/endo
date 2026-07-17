// @ts-check

import '@endo/immutable-arraybuffer/shim.js';
import harden from '@endo/harden';

/**
 * Wraps a `Uint8Array` view's contents in an immutable `ArrayBuffer`.
 *
 * Calls the `sliceToImmutable` method installed by
 * `@endo/immutable-arraybuffer/shim.js` on `ArrayBuffer.prototype`.
 * Importing this module triggers the shim install, so the caller does not
 * need to arrange for it separately. The resulting buffer carries the
 * `'byteArray'` passStyle and is safe to share across vat boundaries. The
 * result is hardened so it is passable.
 *
 * Honors the view's `byteOffset` and `byteLength`, so passing a
 * `subarray` copies only that window.
 *
 * @param {Uint8Array} view
 * @returns {ArrayBuffer} A hardened immutable `ArrayBuffer`.
 */
export const bytesToImmutable = view => {
  const buffer = /** @type {ArrayBuffer} */ (view.buffer);
  const immutable = buffer.sliceToImmutable(
    view.byteOffset,
    view.byteOffset + view.byteLength,
  );
  return harden(immutable);
};
harden(bytesToImmutable);
