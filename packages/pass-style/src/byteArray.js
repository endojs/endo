import harden from '@endo/harden';
import { X, Fail } from '@endo/errors';
import { encodeHex, decodeHex } from '@endo/hex';

/**
 * @import {ByteArray} from './types.js';
 * @import {PassStyleHelper} from './internal-types.js';
 */

const { getPrototypeOf, getOwnPropertyDescriptor } = Object;
const { ownKeys, apply } = Reflect;

// Detects the presence of a immutable ArrayBuffer support in the underlying
// platform and provides either suitable values from that implementation or
// values that will consistently deny that immutable ArrayBuffers exist.
const adaptImmutableArrayBuffer = () => {
  const anArrayBuffer = new ArrayBuffer(0);

  // On platforms that do not support sliceToImmutable, pass-style byteArray
  // cannot be constructed.
  if (anArrayBuffer.sliceToImmutable === undefined) {
    return {
      immutableArrayBufferPrototype: null,
      immutableGetter: () => false,
    };
  }

  const anImmutableArrayBuffer = anArrayBuffer.sliceToImmutable();

  /**
   * As proposed, this will be the same as `ArrayBuffer.prototype`. As shimmed,
   * this will be a hidden intrinsic that inherits from `ArrayBuffer.prototype`.
   * Either way, get this in a way that we can trust it after lockdown, and
   * require that all immutable ArrayBuffers directly inherit from it.
   */
  const immutableArrayBufferPrototype = getPrototypeOf(anImmutableArrayBuffer);

  const immutableGetter = /** @type {(this: ArrayBuffer) => boolean} */ (
    // @ts-expect-error We know the desciptor is there.
    getOwnPropertyDescriptor(immutableArrayBufferPrototype, 'immutable').get
  );

  return { immutableArrayBufferPrototype, immutableGetter };
};

const { immutableArrayBufferPrototype, immutableGetter } =
  adaptImmutableArrayBuffer();

/**
 * @type {PassStyleHelper}
 */
export const ByteArrayHelper = harden({
  styleName: 'byteArray',

  confirmCanBeValid: (candidate, reject) =>
    (candidate instanceof ArrayBuffer && candidate.immutable) ||
    (reject && reject`Immutable ArrayBuffer expected: ${candidate}`),

  assertRestValid: (candidate, _passStyleOfRecur) => {
    getPrototypeOf(candidate) === immutableArrayBufferPrototype ||
      assert.fail(X`Malformed ByteArray ${candidate}`, TypeError);
    apply(immutableGetter, candidate, []) ||
      Fail`Must be an immutable ArrayBuffer: ${candidate}`;
    ownKeys(candidate).length === 0 ||
      assert.fail(
        X`ByteArrays must not have own properties: ${candidate}`,
        TypeError,
      );
  },
});
harden(ByteArrayHelper);

/**
 * Returns a Uint8Array reflecting the current contents of `byteArray`.
 *
 * On platforms with native immutable ArrayBuffer support, the byteArray
 * inherits directly from `ArrayBuffer.prototype` and the returned
 * `Uint8Array` is a zero-copy view. On platforms using the
 * `@endo/immutable-arraybuffer` shim, the shim-emulated buffer does not
 * admit a `Uint8Array` view, so this slices out a fresh mutable copy.
 *
 * @param {ArrayBuffer} byteArray A `passStyleOf === 'byteArray'` value
 * (hardened Immutable ArrayBuffer), or a plain mutable ArrayBuffer
 * (in which case the returned Uint8Array is a read-write view).
 * @returns {Uint8Array}
 */
export const byteArrayToUint8Array = byteArray => {
  if (getPrototypeOf(byteArray) === ArrayBuffer.prototype) {
    return new Uint8Array(byteArray);
  }
  const genuineArrayBuffer = byteArray.slice();
  return new Uint8Array(genuineArrayBuffer);
};
harden(byteArrayToUint8Array);

/**
 * Converts a `Uint8Array` to a `ByteArray`, i.e., a hardened Immutable
 * ArrayBuffer whose `passStyleOf` is `'byteArray'`.
 *
 * @param {Uint8Array} uint8Array
 * @returns {ArrayBuffer}
 */
export const uint8ArrayToByteArray = uint8Array =>
  // @ts-expect-error shim-augmented ArrayBuffer type
  harden(uint8Array.buffer.sliceToImmutable(0, uint8Array.length));
harden(uint8ArrayToByteArray);

/**
 * Hex-encodes the contents of a ByteArray.
 *
 * @param {ByteArray} byteArray
 * @returns {string}
 */
export const byteArrayToHex = byteArray =>
  encodeHex(byteArrayToUint8Array(byteArray));
harden(byteArrayToHex);

/**
 * Decodes a hex string into a ByteArray (hardened Immutable ArrayBuffer).
 *
 * @param {string} hex
 * @param {string} [name]
 * @returns {ByteArray}
 */
export const hexToByteArray = (hex, name) =>
  uint8ArrayToByteArray(decodeHex(hex, name));
harden(hexToByteArray);
