import {
  makeRecordCodec,
  makeRecordCodecFromDefinition,
} from '../syrup/codec.js';

/** @typedef {import('../syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../syrup/encode.js').SyrupWriter} SyrupWriter */
/** @typedef {import('../syrup/codec.js').SyrupRecordCodec} SyrupRecordCodec */
/** @typedef {import('../syrup/codec.js').SyrupType} SyrupType */
/** @typedef {import('../syrup/codec.js').SyrupCodec} SyrupCodec */

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
