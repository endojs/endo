// @ts-check
/* eslint no-bitwise: ["off"] */

import { alphabet64, padding } from './common.js';

// Capture `Reflect.apply` once at module load; we prefer it to
// `Function.prototype.call` even where `.call` is assumed to be
// primordial, so a tampered `Function.prototype.call` cannot redirect
// the dispatched native intrinsic invocation.
const { apply } = Reflect;

/**
 * Pure-JavaScript base64 encoder, exported for benchmarking and for
 * environments where the native TC39 `Uint8Array.prototype.toBase64`
 * intrinsic (proposal-arraybuffer-base64) is unavailable or has been
 * removed.
 * See `encodeBase64` below for the dispatched default.
 *
 * XSnap, a JavaScript engine based on Moddable/XS, runs this polyfill
 * orders of magnitude slower than V8.
 * Older XS builds expose a native `globalThis.Base64` binding that the
 * dispatched `encodeBase64` uses ahead of the polyfill on legacy
 * Agoric chain XS; going forward, XS is expected to favor the standard
 * `Uint8Array.prototype.toBase64`.
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

  for (let i = 0; i < data.length; i += 1) {
    const b = data[i];
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
Object.freeze(jsEncodeBase64);

// Capture the native TC39 `Uint8Array.prototype.toBase64` intrinsic at
// module load, before any caller can reach `encodeBase64` and before
// SES lockdown freezes the prototype.
// Post-lockdown mutation cannot redirect the dispatched binding.
/** @type {typeof Uint8Array.prototype.toBase64 | undefined} */
const nativeToBase64 = /** @type {any} */ (Uint8Array.prototype).toBase64;

/** @type {typeof jsEncodeBase64} */
const nativeEncodeBase64 = data =>
  apply(
    /** @type {typeof Uint8Array.prototype.toBase64} */ (nativeToBase64),
    data,
    [],
  );

// Legacy XSnap path.
// Older Moddable/XS builds ship a native `globalThis.Base64.encode`
// that predates the TC39 intrinsic; we dispatch to it on Agoric chain
// XS.
// Going forward, XS will favor the standard
// `Uint8Array.prototype.toBase64` and this branch will retire.
/** @type {typeof jsEncodeBase64 | undefined} */
const xsEncodeBase64 = (() => {
  if (globalThis.Base64 === undefined) return undefined;
  const { encode } = globalThis.Base64;
  // eslint-disable-next-line no-shadow
  const xsEncodeBase64 = data => apply(encode, undefined, [data]);
  return xsEncodeBase64;
})();

/**
 * Encodes bytes into a Base64 string, as specified in
 * https://tools.ietf.org/html/rfc4648#section-4.
 *
 * Dispatches to the native `Uint8Array.prototype.toBase64` intrinsic
 * when available (stage-4 TC39 proposal-arraybuffer-base64).
 * Otherwise falls through to the legacy `globalThis.Base64.encode` XS
 * binding, and finally to the pure-JavaScript `jsEncodeBase64`.
 *
 * @type {typeof jsEncodeBase64}
 */
export const encodeBase64 = (() => {
  if (nativeToBase64 !== undefined) return nativeEncodeBase64;
  if (xsEncodeBase64 !== undefined) return xsEncodeBase64;
  return jsEncodeBase64;
})();
Object.freeze(encodeBase64);
