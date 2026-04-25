// @ts-check

/**
 * Base64url (RFC 4648 §5) wrappers around `@endo/base64`. The OCapN
 * sturdyref URI grammar carries the swiss-num path segment in base64url
 * without padding, so we keep the conversion in one place rather than
 * sprinkling Node `Buffer` calls (and therefore a Node coupling) through
 * the host/parse code paths.
 */

import { decodeBase64, encodeBase64 } from '@endo/base64';

/**
 * Encode bytes as base64url without trailing padding.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export const encodeBase64Url = bytes =>
  encodeBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');

/**
 * Decode a base64url string (with or without padding) into bytes. The
 * input alphabet is validated by `decodeBase64` after the URL-alphabet
 * substitutions.
 *
 * @param {string} value
 * @param {string} [name]
 * @returns {Uint8Array}
 */
export const decodeBase64Url = (value, name) => {
  const standard = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4);
  return decodeBase64(padded, name);
};
