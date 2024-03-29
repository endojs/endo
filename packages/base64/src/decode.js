// @ts-check
/* eslint no-bitwise: ["off"] */
/* global globalThis */

import { monodu64, padding } from './common.js';

/**
 * Decodes a Base64 string into bytes, as specified in
 * https://tools.ietf.org/html/rfc4648#section-4
 *
 * XSnap is a JavaScript engine based on Moddable/XS.
 * The algorithm below is orders of magnitude too slow on this VM, but it
 * arranges a native binding on the global object.
 * We use that if it is available instead.
 *
 * This function is exported from this *file* for use in benchmarking,
 * but is not part of the *module*'s public API.
 *
 * @param {string} string Base64-encoded string
 * @param {string} [name] The name of the string as it will appear in error
 * messages.
 * @returns {Uint8Array} decoded bytes
 */
export const jsDecodeBase64 = (string, name = '<unknown>') => {
  const data = new Uint8Array(Math.ceil((string.length * 4) / 3));
  let register = 0;
  let quantum = 0;
  let i = 0; // index in string
  let j = 0; // index in data

  while (i < string.length && string[i] !== padding) {
    const number = monodu64[string[i]];
    if (number === undefined) {
      throw Error(`Invalid base64 character ${string[i]} in string ${name}`);
    }
    register = (register << 6) | number;
    quantum += 6;
    if (quantum >= 8) {
      quantum -= 8;
      data[j] = register >>> quantum;
      j += 1;
      register &= (1 << quantum) - 1;
    }
    i += 1;
  }

  while (quantum > 0) {
    if (i === string.length || string[i] !== padding) {
      throw Error(`Missing padding at offset ${i} of string ${name}`);
    }
    // We MAY reject non-zero padding bits, but choose not to.
    // https://datatracker.ietf.org/doc/html/rfc4648#section-3.5
    i += 1;
    quantum -= 2;
  }

  if (i < string.length) {
    throw Error(
      `Base64 string has trailing garbage ${string.substr(
        i,
      )} in string ${name}`,
    );
  }

  return data.subarray(0, j);
};

// The XS Base64.decode function is faster, but might return ArrayBuffer (not
// Uint8Array).  Adapt it to our needs.
const adaptDecoder =
  nativeDecodeBase64 =>
  (...args) => {
    const decoded = nativeDecodeBase64(...args);
    if (decoded instanceof Uint8Array) {
      return decoded;
    }
    return new Uint8Array(decoded);
  };

/** @type {typeof jsDecodeBase64} */
export const decodeBase64 =
  globalThis.Base64 !== undefined
    ? adaptDecoder(globalThis.Base64.decode)
    : jsDecodeBase64;
