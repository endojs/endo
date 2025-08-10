// @ts-check

/**
 * @typedef {import('../codecs/components.js').OcapnLocation} OcapnLocation
 * @typedef {import('./types.js').LocationId} LocationId
 */

import { Buffer } from 'buffer';
import {
  isByteArray,
  makeByteArray,
  makeUint8ArrayFromByteArray,
} from '../pass-style-helpers.js';

/**
 * @param {Uint8Array} value
 * @returns {string}
 */
export const uint8ArrayToHex = value => {
  return Buffer.from(value).toString('hex');
};

/**
 * @param {ArrayBuffer} value
 * @returns {string}
 */
export const arrayBufferToHex = value => {
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
 * @param {ArrayBuffer} value
 * @returns {string}
 */
export const decodeSwissnum = value => {
  if (!isByteArray(value)) {
    throw Error(`Expected ByteArray, got ${typeof value}`);
  }
  const buffer = makeUint8ArrayFromByteArray(value);
  return swissnumDecoder.decode(buffer);
};

/**
 * @param {string} value
 * @returns {ArrayBuffer}
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
  const bytes = swissnumEncoder.encode(value);
  return makeByteArray(bytes);
};
