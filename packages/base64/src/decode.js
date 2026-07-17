// @ts-check
/* eslint no-bitwise: ["off"] */

import { monodu64, padding } from './common.js';

// Capture `Reflect.apply` once at module load, before any consumer
// can tamper with `Function.prototype.call`.
// Using `Reflect.apply` for the native dispatch ensures a tampered
// `Function.prototype.call` cannot redirect the dispatched native
// intrinsic invocation.
const { apply } = Reflect;

/**
 * Pure-JavaScript base64 decoder, exported for benchmarking and for
 * environments where the native TC39 `Uint8Array.fromBase64` intrinsic
 * (proposal-arraybuffer-base64) is unavailable or has been removed.
 * See `decodeBase64` below for the dispatched default.
 *
 * XSnap, a JavaScript engine based on Moddable/XS, runs this polyfill
 * orders of magnitude slower than V8.
 * Older XS builds expose a native `globalThis.Base64` binding that the
 * dispatched `decodeBase64` uses ahead of the polyfill on legacy
 * Agoric chain XS; going forward, XS is expected to favor the standard
 * `Uint8Array.fromBase64`.
 *
 * This function is exported from this *file* for use in benchmarking,
 * but is not part of the *module*'s public API.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc4648#section-4
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
Object.freeze(jsDecodeBase64);

// Capture the native TC39 `Uint8Array.fromBase64` intrinsic at module
// load, before any caller can reach `decodeBase64` and before SES
// lockdown freezes `Uint8Array`.
// Post-lockdown mutation cannot redirect the dispatched binding.
/** @type {typeof Uint8Array.fromBase64 | undefined} */
const nativeFromBase64 = /** @type {any} */ (Uint8Array).fromBase64;

// Pin native options to the strictest semantics that match
// `jsDecodeBase64`:
//   - `lastChunkHandling: 'strict'` rejects unpadded / short final
//     chunks (the proposal default `'loose'` would silently accept
//     them).
//   - `alphabet: 'base64'` rejects URL-safe characters (`-_`) and
//     pins forward compatibility against any future spec drift.
const nativeFromBase64Options = Object.freeze({
  lastChunkHandling: 'strict',
  alphabet: 'base64',
});

/** @type {typeof jsDecodeBase64} */
const nativeDecodeBase64 = (string, name) => {
  try {
    return apply(
      /** @type {typeof Uint8Array.fromBase64} */ (nativeFromBase64),
      Uint8Array,
      [string, nativeFromBase64Options],
    );
  } catch (err) {
    // Prefer the polyfill's precise diagnostic on any native throw:
    // native error messages are implementation-defined and do not
    // embed `name` or report the failing offset.
    // jsDecodeBase64 is expected to reject anything native rejected;
    // if it does not, fall back to propagating the caught native error.
    jsDecodeBase64(string, name);
    throw err;
  }
};

// Legacy XSnap path.
// Older Moddable/XS builds ship a native `globalThis.Base64.decode`
// that predates the TC39 intrinsic; we dispatch to it on Agoric chain
// XS.
// Going forward, XS will favor the standard `Uint8Array.fromBase64`
// and this branch will retire.
//
// The legacy XS `Base64.decode` may return ArrayBuffer (not
// Uint8Array); adapt it.
const adaptDecoder =
  nativeDecoder =>
  (...args) => {
    const decoded = nativeDecoder(...args);
    if (decoded instanceof Uint8Array) {
      return decoded;
    }
    return new Uint8Array(decoded);
  };

/** @type {typeof jsDecodeBase64 | undefined} */
const xsDecodeBase64 =
  globalThis.Base64 !== undefined
    ? adaptDecoder(globalThis.Base64.decode)
    : undefined;

/**
 * Decodes a Base64 string into bytes, as specified in
 * https://tools.ietf.org/html/rfc4648#section-4.
 *
 * Dispatches to the native `Uint8Array.fromBase64` intrinsic when
 * available (stage-4 TC39 proposal-arraybuffer-base64).
 * Otherwise falls through to the legacy `globalThis.Base64.decode` XS
 * binding, and finally to the pure-JavaScript `jsDecodeBase64`.
 *
 * On any native throw, the polyfill is re-run to surface a
 * diagnostic that embeds `name` and the failing offset; native
 * error messages are implementation-defined and do neither.
 *
 * @type {typeof jsDecodeBase64}
 */
export const decodeBase64 = (() => {
  if (nativeFromBase64 !== undefined) return nativeDecodeBase64;
  if (xsDecodeBase64 !== undefined) return xsDecodeBase64;
  return jsDecodeBase64;
})();
Object.freeze(decodeBase64);
