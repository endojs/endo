import { X, Fail } from '@endo/errors';
import { decodeBase64 } from '@endo/base64/decode.js';
import { encodeBase64 } from '@endo/base64/encode.js';

/**
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
  // @ts-expect-error TODO This error will be addressed when updating
  // TypeScript's native types to a version recognizing the upcoming standard.
  if (anArrayBuffer.sliceToImmutable === undefined) {
    return {
      immutableArrayBufferPrototype: null,
      immutableGetter: () => false,
    };
  }

  // @ts-expect-error TODO This error will be addressed when updating
  // TypeScript's native types to a version recognizing the upcoming standard.
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

  canBeValid: (candidate, check = undefined) =>
    (candidate instanceof ArrayBuffer &&
      // @ts-expect-error TODO How do I add it to the ArrayBuffer type?
      candidate.immutable) ||
    (!!check && check(false, X`Immutable ArrayBuffer expected: ${candidate}`)),

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
 * @param {ArrayBuffer} byteArray i.e., a hardened Immutable ArrayBuffer whose
 * `passStyle` is `'byteArray'`. NOTE: `encodeByteArrayToBase64` does not
 * enforce that `byteArray` is a ByteArray, but rather, will also accept a
 * normal `ArrayBuffer`. In that case, the returned `Uint8Array` would
 * not be freezable, and would be a read-write view onto `byteArray`.
 * @returns {Uint8Array} a view into the contents of `byteArray`.
 */
export const byteArrayToUint8Array = byteArray => {
  if (getPrototypeOf(byteArray) === ArrayBuffer.prototype) {
    // If `byteArray` inherits directly from `ArrayBuffer.prototype`,
    // then assume `byteArray` is a genuine `ArrayBuffer`,
    // as it would be in a native implementation
    // of the Immutable ArrayBuffer proposal. This conversion to a Uint8Array
    // is then zero-copy. If `byteArray` is indeed an Immutable ArrayBuffer,
    // then the returned Uint8Array is freezable.
    return new Uint8Array(byteArray);
  } else {
    // Otherwise, assume `byteArray` may be a shim-emulated
    // Immutable ArrayBuffer. This `.slice()` would then cost a copy into a
    // fresh mutable normal ArrayBuffer, and the returned Uint8Array would
    // be a read-write window into that mutable ArrayBuffer.
    const genuineArrayBuffer = byteArray.slice();
    return byteArrayToUint8Array(genuineArrayBuffer);
  }
};
harden(byteArrayToUint8Array);

/**
 * Converts a `Uint8Array` to a `ByteArray`, i.e., a hardened
 * Immutable ArrayBuffer whose `passStyleOf` is `'byteArray'`.
 *
 * @param {Uint8Array} uint8Array
 * @returns {ArrayBuffer} A ByteArray, i.e., a hardened Immutable ArrayBuffer
 */
export const uint8ArrayToByteArray = uint8Array =>
  // If we're using a native implementation of the full Immutable ArrayBuffer
  // proposal, and if `uint8Array`'s backing store is such a genuine
  // Immutable ArrayBuffer, and if the native implementation does the obvious
  // optimization of `immutableArrayBuffer.sliceToImmutable(0, length)`,
  // then this conversion is zero-copy.
  // Otherwise, it pays the copy cost implicit in `sliceToImmutable`.
  //
  // @ts-expect-error How can shim add to `ArrayBuffer` ts type?
  harden(uint8Array.buffer.sliceToImmutable(0, uint8Array.length));
harden(uint8ArrayToByteArray);

/**
 * Encodes the contents of a ByteArray to a base64-encoded string according
 * to the `@endo/base64` encoding.
 *
 * @param {ArrayBuffer} byteArray i.e., a hardened Immutable ArrayBuffer whose
 * `passStyle` is `'byteArray'`. NOTE: `encodeByteArrayToBase64` does not
 * enforce that `byteArray` is a ByteArray, but rather, will also accept a
 * normal `ArrayBuffer`.
 * @returns {string} base64-encoded string
 */
export const encodeByteArrayToBase64 = byteArray =>
  encodeBase64(byteArrayToUint8Array(byteArray));
harden(encodeByteArrayToBase64);

/**
 * Decodes a base64-encoded string into a ByteArray, i.e., a hardened
 * Immutable ArrayBuffer whose `passStyleOf` is `'byteArray'`.
 *
 * @param {string} string base64-encoded string according to the
 * `@endo/base64` encoding.
 * @param {string} [name] The name of the string as it will appear in error
 *   messages.
 * @returns {ArrayBuffer} A ByteArray, i.e., a hardened Immutable ArrayBuffer
 */
export const decodeBase64ToByteArray = (string, name = '<unknown>') =>
  uint8ArrayToByteArray(decodeBase64(string, name));
harden(decodeBase64ToByteArray);
