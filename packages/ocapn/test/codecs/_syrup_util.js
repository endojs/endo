// @ts-check

import { bytesFromText } from '@endo/bytes/from-string.js';
import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { concatImmutables } from '@endo/bytes/concat-immutables.js';

const textEncoder = new TextEncoder();

/**
 * @typedef {import('../../src/codecs/components.js').OcapnLocation} OcapnLocation
 * @typedef {import('../../src/client/types.js').SessionId} SessionId
 * @typedef {import('../../src/client/types.js').PublicKeyId} PublicKeyId
 * @typedef {import('../../src/cryptography.js').OcapnPublicKey} OcapnPublicKey
 */

/**
 * @param {string} s
 * @returns {ArrayBuffer}
 */
const selectorSyrup = s => {
  const b = textEncoder.encode(s);
  return bytesToImmutable(
    bytesFromText(`${b.length}'${String.fromCharCode(...b)}`),
  );
};

/**
 * @param {number} i
 * @returns {ArrayBuffer}
 */
export const intSyrup = i =>
  bytesToImmutable(
    bytesFromText(`${Math.floor(Math.abs(i))}${i < 0 ? '-' : '+'}`),
  );

/**
 * @param {string} label
 * @param {Array<ArrayBuffer>} items
 * @returns {ArrayBuffer}
 */
export const recordSyrup = (label, ...items) =>
  concatImmutables([
    bytesToImmutable(bytesFromText('<')),
    selectorSyrup(label),
    ...items,
    bytesToImmutable(bytesFromText('>')),
  ]);
