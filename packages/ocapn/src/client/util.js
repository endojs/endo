// @ts-check

/**
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { LocationId } from './types.js'
 */

import { Buffer } from 'buffer';

/**
 * @param {Uint8Array} value
 * @returns {string}
 */
export const toHex = value => {
  return Buffer.from(value).toString('hex');
};

/**
 * @param {OcapnLocation} location
 * @returns {LocationId}
 */
export const locationToLocationId = location => {
  return `${location.transport}:${location.address}`;
};

const swissnumDecoder = new TextDecoder('ascii', { fatal: true });
const swissnumEncoder = new TextEncoder();

/**
 * @param {Uint8Array} value
 * @returns {string}
 */
export const decodeSwissnum = value => {
  return swissnumDecoder.decode(value);
};

/**
 * @param {string} value
 * @returns {Uint8Array}
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
  return swissnumEncoder.encode(value);
};
