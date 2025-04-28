import {
  makeCodec,
  makeRecordCodec,
  makeRecordCodecFromDefinition,
} from '../syrup/codec.js';

/** @typedef {import('../syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../syrup/encode.js').SyrupWriter} SyrupWriter */
/** @typedef {import('../syrup/codec.js').SyrupRecordCodec} SyrupRecordCodec */
/** @typedef {import('../syrup/codec.js').SyrupType} SyrupType */
/** @typedef {import('../syrup/codec.js').SyrupCodec} SyrupCodec */
/** @typedef {Record<string, SyrupType | SyrupCodec>} SyrupRecordDefinition */

const { freeze } = Object;

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

/**
 * @typedef {SyrupCodec & {
 *   label: string;
 *   readBody: (SyrupReader) => any;
 *   writeBody: (any, SyrupWriter) => void;
 * }} OCapNListComponentCodec
 */

/**
 * @param {string} codecName
 * @param {string} label
 * @param {function(SyrupReader): any} readBody
 * @param {function(any, SyrupWriter): void} writeBody
 * @returns {OCapNListComponentCodec}
 */
export const makeOCapNListComponentCodec = (
  codecName,
  label,
  readBody,
  writeBody,
) => {
  const { read, write } = makeCodec(codecName, {
    read: syrupReader => {
      syrupReader.enterList();
      const actualLabel = syrupReader.readSelectorAsString();
      if (actualLabel !== label) {
        throw Error(`Expected label ${label}, got ${actualLabel}`);
      }
      const result = readBody(syrupReader);
      syrupReader.exitList();
      return result;
    },
    write: (value, syrupWriter) => {
      syrupWriter.enterList();
      syrupWriter.writeSelectorFromString(label);
      writeBody(value, syrupWriter);
      syrupWriter.exitList();
    },
  });
  return freeze({
    label,
    read,
    readBody,
    write,
    writeBody,
  });
};

/**
 * @param {string} codecName
 * @param {Record<string, OCapNListComponentCodec>} listComponentTypes
 * @returns {SyrupCodec & {
 *   supports: (label: string) => boolean;
 * }}
 */
export const makeOCapNListComponentUnionCodec = (
  codecName,
  listComponentTypes,
) => {
  const codecTable = Object.fromEntries(
    Object.values(listComponentTypes).map(listComponentType => {
      return [listComponentType.label, listComponentType];
    }),
  );
  const { read, write } = makeCodec(codecName, {
    read: syrupReader => {
      syrupReader.enterList();
      const actualLabel = syrupReader.readSelectorAsString();
      const codec = codecTable[actualLabel];
      if (!codec) {
        throw Error(`Unknown label ${actualLabel}`);
      }
      return codec.readBody(syrupReader);
    },
    write: (value, syrupWriter) => {
      syrupWriter.enterList();
      const label = value.type;
      if (typeof label !== 'string') {
        throw Error(`Expected label, got ${typeof label}`);
      }
      const codec = codecTable[label];
      if (!codec) {
        throw Error(`Unknown label ${label}`);
      }
      syrupWriter.writeSelectorFromString(label);
      codec.writeBody(value, syrupWriter);
      syrupWriter.exitList();
    },
  });
  const supports = label => {
    return codecTable[label] !== undefined;
  };
  return freeze({
    read,
    write,
    supports,
  });
};
