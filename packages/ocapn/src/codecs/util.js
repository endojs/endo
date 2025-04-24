import {
  makeRecordCodec,
  makeRecordCodecFromDefinition,
} from '../syrup/codec.js';

/** @typedef {import('../syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../syrup/encode.js').SyrupWriter} SyrupWriter */
/** @typedef {import('../syrup/codec.js').SyrupRecordCodec} SyrupRecordCodec */
/** @typedef {import('../syrup/codec.js').SyrupType} SyrupType */
/** @typedef {import('../syrup/codec.js').SyrupCodec} SyrupCodec */
/** @typedef {Record<string, SyrupType | SyrupCodec>} SyrupRecordDefinition */

/**
 * @param {string} codecName
 * @param {string} label
 * @param {SyrupRecordDefinition} definition
 * @returns {SyrupRecordCodec}
 */
export const makeOCapNRecordCodecFromDefinition = (
  codecName,
  label,
  definition,
) => {
  // Syrup Records as used in OCapN are always labeled with selectors
  return makeRecordCodecFromDefinition(
    codecName,
    label,
    'selector',
    definition,
  );
};

/**
 * @param {string} codecName
 * @param {string} label
 * @param {function(SyrupReader): any} readBody
 * @param {function(any, SyrupWriter): void} writeBody
 * @returns {SyrupRecordCodec}
 */
export const makeOCapNRecordCodec = (codecName, label, readBody, writeBody) => {
  // Syrup Records as used in OCapN are always labeled with selectors
  return makeRecordCodec(codecName, label, 'selector', readBody, writeBody);
};
