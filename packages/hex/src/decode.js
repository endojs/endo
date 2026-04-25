/* eslint no-bitwise: ["off"] */

import harden from '@endo/harden';

/**
 * Pure-JavaScript hex decoder, exported for benchmarking and for
 * environments where the native TC39 `Uint8Array.fromHex` intrinsic
 * (proposal-arraybuffer-base64) is unavailable or has been removed.
 * See `decodeHex` below for the dispatched default.
 *
 * Accepts both upper- and lowercase input.  Throws on odd-length input
 * and on any character outside `[0-9a-fA-F]`.
 *
 * Computes nibble values directly from character codes rather than
 * indexing a lookup table.  On Node 22, this is roughly 2.5 to 3 times
 * faster than the table-based decoder for ~1 MiB inputs and avoids any
 * module-scope mutable data; see `test/decode.bench.js`.
 *
 * @param {string} string
 * @param {string} [name] Name of the string for error diagnostics.
 * @returns {Uint8Array}
 */
export const jsDecodeHex = (string, name = '<unknown>') => {
  if (string.length % 2 !== 0) {
    throw Error(
      `Hex string must have an even length, got ${string.length} in string ${name}`,
    );
  }
  const bytes = new Uint8Array(string.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const cHi = string.charCodeAt(i * 2);
    const cLo = string.charCodeAt(i * 2 + 1);
    // For ASCII codes:
    //   '0' to '9' (48 to 57)              -> c - 48
    //   'a' to 'f' / 'A' to 'F' (97/65 ..) -> (c | 0x20) - 87
    // `c | 0x20` folds upper- onto lowercase; non-letters with that
    // bit set still fail the (97..102) range check below.
    let hi = -1;
    if (cHi >= 48 && cHi <= 57) {
      hi = cHi - 48;
    } else {
      const x = cHi | 0x20;
      if (x >= 97 && x <= 102) hi = x - 87;
    }
    let lo = -1;
    if (cLo >= 48 && cLo <= 57) {
      lo = cLo - 48;
    } else {
      const x = cLo | 0x20;
      if (x >= 97 && x <= 102) lo = x - 87;
    }
    if (hi < 0 || lo < 0) {
      throw Error(
        `Invalid hex character at offset ${
          hi < 0 ? i * 2 : i * 2 + 1
        } of string ${name}`,
      );
    }
    bytes[i] = (hi << 4) | lo;
  }
  return bytes;
};
harden(jsDecodeHex);

// Capture the native TC39 `Uint8Array.fromHex` intrinsic at module load,
// before any caller can reach `decodeHex` and before SES lockdown
// freezes `Uint8Array`.  Post-lockdown mutation cannot redirect the
// dispatched binding.
const fromHex = /** @type {any} */ (Uint8Array).fromHex;
const nativeFromHex =
  typeof fromHex === 'function'
    ? /** @type {(hex: string) => Uint8Array} */ (fromHex)
    : undefined;

/**
 * Decodes a hex string to a Uint8Array.  Accepts both upper- and
 * lowercase input.  Throws on odd-length strings and on characters
 * outside `[0-9a-fA-F]`.
 *
 * Dispatches to the native `Uint8Array.fromHex` intrinsic when
 * available (stage-4 TC39 proposal-arraybuffer-base64).  On any
 * native throw, re-runs `jsDecodeHex` to produce a diagnostic with
 * precise offset information since native error messages are
 * implementation-defined and do not report the failing offset.
 *
 * @type {typeof jsDecodeHex}
 */
export const decodeHex =
  nativeFromHex !== undefined
    ? (string, name = '<unknown>') => {
        try {
          return nativeFromHex(string);
        } catch (err) {
          // Prefer the polyfill's precise offset diagnostic on any
          // native throw; jsDecodeHex is expected to reject anything
          // native rejected.  If it does not, fall back to propagating
          // the caught native error.
          jsDecodeHex(string, name);
          throw err;
        }
      }
    : jsDecodeHex;
harden(decodeHex);
