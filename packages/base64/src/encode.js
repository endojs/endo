// @ts-check
/* eslint no-bitwise: ["off"] */
/* global globalThis */

import { alphabet64, padding } from './common.js';

/**
 * Encodes bytes into a Base64 string, as specified in
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
 * @param {Uint8Array} data
 * @returns {string} base64 encoding
 */
export const jsEncodeBase64 = data => {
  // A cursory benchmark shows that string concatenation is about 25% faster
  // than building an array and joining it in v8, in 2020, for strings of about
  // 100 long.
  let string = '';
  let register = 0;
  let quantum = 0;

  for (const b of data) {
    register = (register << 8) | b;
    quantum += 8;
    if (quantum === 24) {
      string +=
        alphabet64[(register >>> 18) & 0x3f] +
        alphabet64[(register >>> 12) & 0x3f] +
        alphabet64[(register >>> 6) & 0x3f] +
        alphabet64[(register >>> 0) & 0x3f];
      register = 0;
      quantum = 0;
    }
  }

  switch (quantum) {
    case 0:
      break;
    case 8:
      string +=
        alphabet64[(register >>> 2) & 0x3f] +
        alphabet64[(register << 4) & 0x3f] +
        padding +
        padding;
      break;
    case 16:
      string +=
        alphabet64[(register >>> 10) & 0x3f] +
        alphabet64[(register >>> 4) & 0x3f] +
        alphabet64[(register << 2) & 0x3f] +
        padding;
      break;
    default:
      throw Error(`internal: bad quantum ${quantum}`);
  }
  return string;
};

/** @type {typeof jsEncodeBase64} */
export const encodeBase64 =
  globalThis.Base64 !== undefined ? globalThis.Base64.encode : jsEncodeBase64;
