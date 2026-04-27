// @ts-check

/**
 * @import { OcapnLocation, SwissNum } from '@endo/ocapn'
 */

import { Buffer } from 'node:buffer';

import { swissnumFromBytes } from '@endo/ocapn';

/**
 * Decode a base64url-encoded string (RFC 4648 §5) without padding into
 * raw bytes wrapped as a `SwissNum`. The Spritely Goblins reference
 * implementation of `string->ocapn-id` (`goblins/ocapn/ids.scm`) treats
 * the `/s/<value>` URI segment exactly this way:
 *
 *   (base64-decode (substring path …)
 *                  #:alphabet base64-url-alphabet
 *                  #:padding? #f)
 *
 * The OCapN draft spec's Syrup serialization for `<ocapn-sturdyref>`
 * carries `swiss-num` as a bytevector (and Endo's `OcapnSturdyRefCodec`
 * already uses `read/writeBytestring`), so this is the only sound
 * interpretation for an interoperable sturdyref URI.
 *
 * Validation here is strict: `Buffer.from(_, 'base64url')` silently
 * skips characters outside the alphabet, which would let typos slip
 * through and produce a wrong-but-plausible swissnum that fails far
 * away from the parser. Pre-checking the alphabet keeps errors local.
 *
 * @param {string} value  Path segment as it appears after `/s/` (already
 *   percent-decoded by the caller).
 * @returns {SwissNum}
 */
const decodeBase64UrlSwissnum = value => {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw Error(
      `Sturdyref swiss-num must be base64url (RFC 4648 §5) without padding: ${value}`,
    );
  }
  const buf = Buffer.from(value, 'base64url');
  // Round-trip check: any character ignored by Node's permissive decoder
  // would shorten the output, so re-encoding and comparing catches the
  // edge cases the regex above misses (e.g. a wrong-length input — 5
  // base64url chars can never represent a whole number of bytes).
  if (buf.toString('base64url') !== value) {
    throw Error(
      `Sturdyref swiss-num is not a valid base64url encoding: ${value}`,
    );
  }
  return swissnumFromBytes(Uint8Array.from(buf));
};

/**
 * @typedef {object} ParsedOcapnUri
 * @property {OcapnLocation} location
 *   The peer locator (designator + transport + hints).
 * @property {SwissNum | undefined} swissNum
 *   Present for sturdyref URIs (`/s/<swiss>`); `undefined` for plain peer URIs.
 * @property {'peer' | 'sturdyref'} kind
 */

/**
 * Parse an OCapN locator URI of the form
 *   `ocapn://<designator>.<transport>[/s/<swiss>][?hint=value&...]`
 *
 * The swissnum, when present, is base64url(no-padding) of the raw
 * swissnum bytes per the OCapN spec (`draft-specifications/Locators.md`)
 * and the Spritely Goblins reference implementation
 * (`goblins/ocapn/ids.scm`). No other encodings are accepted.
 *
 * @param {string} uri
 * @returns {ParsedOcapnUri}
 */
export const parseOcapnUri = uri => {
  const trimmed = uri.trim();
  const match = trimmed.match(/^ocapn:\/\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?$/);
  if (!match) {
    throw Error(`Not a valid ocapn:// URI: ${uri}`);
  }
  const [, hostPart, pathPart, queryPart] = match;

  const lastDot = hostPart.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === hostPart.length - 1) {
    throw Error(
      `OCapN URI host must be of the form <designator>.<transport>: ${hostPart}`,
    );
  }
  const designator = hostPart.slice(0, lastDot);
  const transport = hostPart.slice(lastDot + 1);

  /** @type {Record<string, string>} */
  const hints = {};
  if (queryPart && queryPart.length > 1) {
    const params = new URLSearchParams(queryPart.slice(1));
    for (const [key, value] of params) {
      hints[key] = value;
    }
  }

  /** @type {'peer' | 'sturdyref'} */
  let kind = 'peer';
  /** @type {SwissNum | undefined} */
  let swissNum;
  if (pathPart) {
    const path = pathPart.replace(/\/+$/u, '');
    if (path.length > 0) {
      const sMatch = path.match(/^\/s\/(.+)$/u);
      if (!sMatch) {
        throw Error(`Unsupported OCapN URI path: ${pathPart}`);
      }
      kind = 'sturdyref';
      swissNum = decodeBase64UrlSwissnum(decodeURIComponent(sMatch[1]));
    }
  }

  /** @type {OcapnLocation} */
  const location = {
    type: 'ocapn-peer',
    designator,
    transport,
    hints: Object.keys(hints).length === 0 ? false : hints,
  };

  return {
    location,
    swissNum,
    kind,
  };
};
