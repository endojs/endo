// @ts-check

import harden from '@endo/harden';
import { sliceBufferToImmutable } from '@endo/immutable-arraybuffer';

/**
 * Wraps a `Uint8Array` view's contents in an immutable `ArrayBuffer`.
 *
 * Uses the `sliceBufferToImmutable` ponyfill from
 * `@endo/immutable-arraybuffer` so the caller does not need to have
 * arranged for the `ArrayBuffer.prototype.sliceToImmutable` shim to be
 * installed first. The resulting buffer carries the `'byteArray'`
 * passStyle and is safe to share across vat boundaries. The result is
 * hardened so it is passable.
 *
 * Honors the view's `byteOffset` and `byteLength`, so passing a
 * `subarray` copies only that window.
 *
 * @param {Uint8Array} view
 * @returns {ArrayBuffer} A hardened immutable `ArrayBuffer`.
 */
export const bytesToImmutable = view => {
  const immutable = sliceBufferToImmutable(
    /** @type {ArrayBuffer} */ (view.buffer),
    view.byteOffset,
    view.byteOffset + view.byteLength,
  );
  return harden(immutable);
};
harden(bytesToImmutable);
