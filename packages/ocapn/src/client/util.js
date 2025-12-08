// @ts-check

/**
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { LocationId } from './types.js'
 */

import { Buffer } from 'buffer';
import {
  immutableArrayBufferToUint8Array,
  uint8ArrayToImmutableArrayBuffer,
} from '../buffer-utils.js';

/**
 * @param {ArrayBufferLike} value
 * @returns {string}
 */
export const toHex = value => {
  return Buffer.from(immutableArrayBufferToUint8Array(value)).toString('hex');
};

/**
 * We need a unique and deterministic way to identify a location as a string, for internal use.
 * We use https://github.com/ocapn/ocapn/blob/main/draft-specifications/Locators.md#uri-serialization
 * @param {OcapnLocation} location
 * @returns {LocationId}
 */
export const locationToLocationId = location => {
  const { designator, transport, hints } = location;

  // Build the base URI: ocapn://<designator>.<transport>
  let uri = `ocapn://${designator}.${transport}`;

  // Add hints as query parameters if present
  if (hints && typeof hints === 'object') {
    // Sort keys deterministically
    const sortedKeys = Object.keys(hints).sort();
    if (sortedKeys.length > 0) {
      const params = sortedKeys
        .map(key => {
          const value = hints[key];
          return `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
        })
        .join('&');
      uri += `?${params}`;
    }
  }

  return uri;
};

const swissnumDecoder = new TextDecoder('ascii', { fatal: true });
const swissnumEncoder = new TextEncoder();

/**
 * @param {ArrayBufferLike} value
 * @returns {string}
 */
export const decodeSwissnum = value => {
  return swissnumDecoder.decode(immutableArrayBufferToUint8Array(value));
};

/**
 * @param {string} value
 * @returns {ArrayBufferLike}
 */
export const encodeSwissnum = value => {
  // Validate the value is strictly valid ASCII
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code > 127) {
      throw new Error(
        `Invalid ASCII character in swissnum at position ${i}: ${value[i]}`,
      );
    }
  }
  return uint8ArrayToImmutableArrayBuffer(swissnumEncoder.encode(value));
};
