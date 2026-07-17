// Header codec: x402 carries JSON payloads (the `PaymentPayload` in
// `X-PAYMENT`, the `SettlementResponse` in `X-PAYMENT-RESPONSE`) as
// base64-encoded UTF-8 inside HTTP headers. We reuse `@endo/base64` for
// the byte<->string half and the platform `TextEncoder`/`TextDecoder`
// for the JSON<->byte half, so the codec pulls in no ambient authority.

import harden from '@endo/harden';
import { encodeBase64, decodeBase64 } from '@endo/base64';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Encode a JSON-serializable object as a base64 header value.
 *
 * @param {unknown} object
 * @returns {string}
 */
export const encodeHeaderObject = object => {
  const json = JSON.stringify(object);
  return encodeBase64(textEncoder.encode(json));
};
harden(encodeHeaderObject);

/**
 * Decode a base64 header value back into an object.
 *
 * @param {string} headerValue
 * @param {string} [name] label used in error messages
 * @returns {any}
 */
export const decodeHeaderObject = (headerValue, name = 'x402 header') => {
  if (typeof headerValue !== 'string' || headerValue.length === 0) {
    throw new Error(`${name}: expected a non-empty base64 string`);
  }
  const bytes = decodeBase64(headerValue, name);
  const json = textDecoder.decode(bytes);
  return JSON.parse(json);
};
harden(decodeHeaderObject);
