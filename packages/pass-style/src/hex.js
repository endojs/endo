// /* global Buffer */

// This module should eventually replace
// https://github.com/Agoric/agoric-sdk/blob/master/packages/internal/src/hex.js
// It makes the following observable improvements, none of which should cause
// practical compat problems:
// - It defensively hardens at least the things that should be defensively
//   hardened.
// - It makes clearer that the `decodings` map, once created, is then treated
//   as read-only by further defining a `getDecoding` function that does not
//   yet encapsulate the `decodings` map, but should.
// - The old code internally referred to Uint8Arrays with variable names like
//   `buf`, which confusingly implies an ArrayBuffer rather than a Uint8Array.
//   The new code here uses names like `u8` instead.
// - It still supports but deprecates the confusing names `encodeHex` and
//   `decodeHex`, while providing clearer replacement names
//   `uint8ArrayToHex` and `hexToUint8Array` respectively.
// - Deprecates the internal codec makers since they are the input to
//   feature detecting on `Buffer`. Advise to use use the exported
//   `uint8ArrayToHex` or `hexToUint8Array` functions directly, since those
//   are already best efforts based on this feature detection.
// - Use `Fail` so substitutions (which can reveal user data) get redacted
//   in the normal production environment.

// TODO https://github.com/Agoric/agoric-sdk/issues/11592 Eventually replace
// https://github.com/Agoric/agoric-sdk/blob/master/packages/internal/src/hex.js
// with this module.

import { Fail } from '@endo/errors';

/**
 * @typedef {ReturnType<typeof makePortableHexCodec>} HexCodec
 */

/** @type {string[]} */
const encodings = Array.from({ length: 256 }, (_, b) =>
  // Write the hex representation of the byte.
  b.toString(16).padStart(2, '0'),
);
harden(encodings);

/**
 * Create map entries for all four permutations of lowercase and uppercase
 * transformations of the two hex digits per byte. The map is keyed by the hex
 * string and the value is the byte value. This allows for fast lookups when
 * decoding hex strings.
 *
 * @type {Map<string, number>}
 */
const decodings = new Map(
  encodings.flatMap((hexdigits, b) => {
    const lo = hexdigits.toLowerCase();
    const UP = hexdigits.toUpperCase();
    return [
      [lo, b],
      [`${lo[0]}${UP[1]}`, b],
      [`${UP[0]}${lo[1]}`, b],
      [UP, b],
    ];
  }),
);
harden(decodings);

/**
 * @param {string} hexPair Two hex digits, where each may be lower case or upper
 * case.
 * @returns {number}
 */
const getDecoding = hexPair => {
  const result = decodings.get(hexPair);
  if (result === undefined) {
    throw Fail`Invalid hex string: ${hexPair}`;
  }
  return result;
};
harden(getDecoding);

/**
 * Create a hex codec that is portable across standard JS environments.
 * @deprecated Just use the exported `uint8ArrayToHex` and `hexToUint8Array`
 * which are already best efforts based on feature detecting `Buffer`.
 */
export const makePortableHexCodec = () => {
  /**
   * @param {Uint8Array} u8
   * @returns {string}
   */
  const uint8ArrayToHex = u8 => Array.from(u8, b => encodings[b]).join('');

  /**
   * @deprecated Use `uint8ArrayToHex` instead
   * @param {Uint8Array} u8
   * @returns {string}
   */
  const encodeHex = u8 => uint8ArrayToHex(u8);

  /**
   * @param {string} hex
   * @returns {Uint8Array}
   */
  const hexToUint8Array = hex => {
    const inputLen = hex.length;
    if (inputLen % 2 !== 0) {
      throw Fail`${hex} must be an even number of characters`;
    }
    const u8 = new Uint8Array(inputLen / 2);
    for (let i = 0; i < inputLen; i += 2) {
      const b = getDecoding(hex.slice(i, i + 2));
      // eslint-disable-next-line no-bitwise
      u8[i >> 1] = b;
    }
    // TODO once we can rely on a native implementation of
    // Immutable ArrayBuffer, do a transferToImmutable and return a new
    // hardened Uint8Array on that buffer. Cannot yet because the
    // Immutable ArrayBuffer shim does not support TypedArrays on
    // emulated Immutable ArrayBuffers.
    return harden(u8); // special case does not freeze index members.
  };

  /**
   * @deprecated Use `hexToUint8Array` instead
   * @param {string} hex
   * @returns {Uint8Array}
   */
  const decodeHex = hex => hexToUint8Array(hex);

  return harden({
    uint8ArrayToHex,
    encodeHex,
    hexToUint8Array,
    decodeHex,
  });
};
harden(makePortableHexCodec);

/**
 * @typedef {Pick<BufferConstructor, 'from' | 'isBuffer'> & {
 *   prototype: Pick<Buffer, 'toString'> & Uint8Array;
 * }} BufferishConstructor
 *   is the portion of the Node.js Buffer API we need for hex conversion.
 */

// Not actually plug compat with `makePortableHexCodec`. More lenient about
// what is an error.
// /**
//  * Create a hex codec using parts of the Node.js Buffer API.
//  *
//  * @deprecated Just use the exported `uint8ArrayToHex` and `hexToUint8Array`
//  * which are already best efforts based on feature detecting `Buffer`.
//  * @param {BufferishConstructor} Bufferish the object that implements the
//  *   necessary pieces of Buffer
//  * @returns {HexCodec}
//  */
// export const makeBufferishHexCodec = Bufferish => {
//   /**
//    * @param {Uint8Array} u8
//    * @returns {string}
//    */
//   const uint8ArrayToHex = u8 =>
//     (Bufferish.isBuffer?.(u8) ? u8 : Bufferish.from(u8)).toString('hex');

//   /**
//    * @deprecated Use `uint8ArrayToHex` instead
//    * @param {Uint8Array} u8
//    * @returns {string}
//    */
//   const encodeHex = u8 => uint8ArrayToHex(u8);

//   /**
//    * @param {string} hex
//    * @returns {Uint8Array}
//    */
//   const hexToUint8Array = hex => {
//     const buf = Bufferish.from(hex, 'hex');

//     // Coerce to Uint8Array to avoid leaking the abstraction.
//     const u8a = new Uint8Array(
//       buf.buffer,
//       buf.byteOffset,
//       buf.byteLength / Uint8Array.BYTES_PER_ELEMENT,
//     );
//     return u8a;
//   };

//   /**
//    * @deprecated Use `hexToUint8Array` instead
//    * @param {string} hex
//    * @returns {Uint8Array}
//    */
//   const decodeHex = hex => hexToUint8Array(hex);

//   return harden({
//     uint8ArrayToHex,
//     encodeHex,
//     hexToUint8Array,
//     decodeHex,
//   });
// };
// harden(makeBufferishHexCodec);

/**
 * Export a hex codec that can work with standard JS engines, but takes
 * advantage of optimizations on some platforms (like Node.js's Buffer API).
 */
export const { uint8ArrayToHex, encodeHex, hexToUint8Array, decodeHex } =
  makePortableHexCodec();
// Enable once `makeBufferishHexCodec` is plug compat
// typeof Buffer === 'undefined'
//   ? makePortableHexCodec()
//   : makeBufferishHexCodec(Buffer);
