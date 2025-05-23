// @ts-check

/**
 * @typedef {import('../codecs/components.js').OCapNLocation} OCapNLocation
 * @typedef {import('./types.js').LocationId} LocationId
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
 * @param {OCapNLocation} location
 * @returns {LocationId}
 */
export const locationToLocationId = location => {
  return `${location.transport}:${location.address}`;
};
