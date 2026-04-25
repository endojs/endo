// @ts-check

/**
 * @import { OcapnLocation, SwissNum } from '@endo/ocapn'
 */

import { swissnumFromBytes } from '@endo/ocapn';

import { decodeBase64Url } from './base64url.js';

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
 * Validation is strict: the alphabet check rejects characters that the
 * underlying decoder would silently skip, which would otherwise let
 * typos slip through and produce a wrong-but-plausible swissnum that
 * fails far from the parser.
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
  return swissnumFromBytes(decodeBase64Url(value, 'swiss-num'));
};

/**
 * @typedef {object} ParsedOcapnLocator
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
 * The host portion of an `ocapn://` URI encodes a `<designator>.<transport>`
 * pair, with the transport occupying the last dot-separated label. We
 * lean on the standard `URL` parser for the heavy lifting (scheme,
 * percent-decoding, query parameters) and only special-case that split.
 *
 * @param {string} uri
 * @returns {ParsedOcapnLocator}
 */
export const parseLocator = uri => {
  const trimmed = uri.trim();
  if (!URL.canParse(trimmed)) {
    throw Error(`Not a valid ocapn:// URI: ${uri}`);
  }
  const url = new URL(trimmed);
  if (url.protocol !== 'ocapn:') {
    throw Error(`Not a valid ocapn:// URI: ${uri}`);
  }
  // `URL` does not parse a host for arbitrary schemes; OCapN URIs use
  // `ocapn://`, but Node's URL parser exposes the authority via `host`
  // for hierarchical schemes. Empty host means a malformed URI.
  const hostPart = url.host;
  if (!hostPart) {
    throw Error(`OCapN URI is missing a host: ${uri}`);
  }
  if (url.username || url.password || url.port) {
    throw Error(`OCapN URI must not carry userinfo or port: ${uri}`);
  }

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
  for (const [key, value] of url.searchParams) {
    hints[key] = value;
  }

  /** @type {'peer' | 'sturdyref'} */
  let kind = 'peer';
  /** @type {SwissNum | undefined} */
  let swissNum;
  const path = url.pathname.replace(/\/+$/u, '');
  if (path.length > 0) {
    const sMatch = path.match(/^\/s\/(.+)$/u);
    if (!sMatch) {
      throw Error(`Unsupported OCapN URI path: ${url.pathname}`);
    }
    kind = 'sturdyref';
    swissNum = decodeBase64UrlSwissnum(decodeURIComponent(sMatch[1]));
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
