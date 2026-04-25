/* eslint no-bitwise: ["off"] */

import harden from '@endo/harden';

const hexAlphabet = '0123456789abcdef';

/**
 * Pure-JavaScript hex encoder, exported for benchmarking and for
 * environments where the native TC39 `Uint8Array.prototype.toHex`
 * intrinsic (proposal-arraybuffer-base64) is unavailable or has been
 * removed.  See `encodeHex` below for the dispatched default.
 *
 * Emits lowercase hex.  Callers that need uppercase can call
 * `.toUpperCase()` on the result.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export const jsEncodeHex = bytes => {
  // Pre-allocate the output array to avoid quadratic-time string
  // concatenation on large inputs.
  const chars = new Array(bytes.length * 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    const j = i * 2;
    chars[j] = hexAlphabet[b >>> 4];
    chars[j + 1] = hexAlphabet[b & 0x0f];
  }
  return chars.join('');
};
harden(jsEncodeHex);

// Capture the native TC39 `Uint8Array.prototype.toHex` intrinsic at
// module load, before any caller can reach `encodeHex` and before SES
// lockdown freezes the prototype.  Post-lockdown mutation cannot
// redirect the dispatched binding.
const toHex = /** @type {any} */ (Uint8Array.prototype).toHex;
const nativeToHex =
  typeof toHex === 'function' ? /** @type {() => string} */ (toHex) : undefined;

/**
 * Encodes a Uint8Array as a lowercase hex string.
 *
 * Dispatches to the native `Uint8Array.prototype.toHex` intrinsic when
 * available (stage-4 TC39 proposal-arraybuffer-base64).  Otherwise
 * falls through to the pure-JavaScript polyfill.
 *
 * @type {typeof jsEncodeHex}
 */
export const encodeHex =
  nativeToHex !== undefined ? bytes => nativeToHex.call(bytes) : jsEncodeHex;
harden(encodeHex);
