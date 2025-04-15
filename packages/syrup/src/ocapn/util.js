import { makeRecordCodec, makeRecordCodecFromDefinition } from '../codec.js';

/** @typedef {import('../decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../encode.js').SyrupWriter} SyrupWriter */
/** @typedef {import('../codec.js').SyrupRecordCodec} SyrupRecordCodec */
/** @typedef {import('../codec.js').SyrupType} SyrupType */
/** @typedef {import('../codec.js').SyrupCodec} SyrupCodec */

/**
 * @param {string} label
 * @param {Array<[string, SyrupType | SyrupCodec]>} definition
 * @returns {SyrupRecordCodec}
 */
export const makeOCapNRecordCodecFromDefinition = (label, definition) => {
  // Syrup Records as used in OCapN are always labeled with selectors
  return makeRecordCodecFromDefinition(label, 'selector', definition);
};

/**
 * @param {string} label
 * @param {function(SyrupReader): any} readBody
 * @param {function(any, SyrupWriter): void} writeBody
 * @returns {SyrupRecordCodec}
 */
export const makeOCapNRecordCodec = (label, readBody, writeBody) => {
  // Syrup Records as used in OCapN are always labeled with selectors
  return makeRecordCodec(label, 'selector', readBody, writeBody);
};
