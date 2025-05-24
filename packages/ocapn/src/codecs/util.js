/** @typedef {import('../syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../syrup/encode.js').SyrupWriter} SyrupWriter */
/** @typedef {import('../syrup/codec.js').SyrupType} SyrupType */
/** @typedef {import('../syrup/codec.js').SyrupCodec} SyrupCodec */
/** @typedef {import('../syrup/codec.js').SyrupRecordCodec} SyrupRecordCodec */
/** @typedef {import('../syrup/codec.js').SyrupRecordDefinition} SyrupRecordDefinition */
/** @typedef {import('../syrup/codec.js').SyrupRecordUnionCodec} SyrupRecordUnionCodec */
/** @typedef {import('../client/ocapn.js').TableKit} TableKit */
/** @typedef {import('../client/ocapn.js').HandoffGiveDetails} HandoffGiveDetails */

import {
  makeCodec,
  makeCodecReadWithErrorWrapping,
  makeCodecWriteWithErrorWrapping,
  makeRecordCodec,
  makeRecordCodecFromDefinition,
  makeRecordUnionCodec,
} from '../syrup/codec.js';

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

/**
 * @typedef {'local:object' | 'local:promise' | 'local:question' | 'remote:object' | 'remote:promise' | 'third-party:sturdy-ref' | 'third-party:handoff'} ValueInfoTableKey
 */

/**
 * @param {string} codecName
 * @param {TableKit} tableKit
 * @param {Record<string, SyrupRecordCodec>} readRecordTypes
 * @param {Record<ValueInfoTableKey, SyrupRecordCodec>} writeRecordTypes
 * @returns {SyrupRecordUnionCodec}
 */
export const makeValueInfoRecordUnionCodec = (
  codecName,
  tableKit,
  readRecordTypes,
  writeRecordTypes,
) => {
  const readCodec = makeRecordUnionCodec(`${codecName}:Read`, readRecordTypes);

  /**
   * @param {string} label
   * @returns {boolean}
   */
  const supports = label => {
    return readCodec.supports(label);
  };

  /**
   * @returns {Record<string, SyrupRecordCodec>}
   */
  const getChildCodecs = () => {
    return readCodec.getChildCodecs();
  };

  /**
   * @param {SyrupReader} syrupReader
   * @returns {any}
   */
  const read = syrupReader => {
    return readCodec.read(syrupReader);
  };

  /**
   * @param {any} value
   * @param {SyrupWriter} syrupWriter
   */
  const write = (value, syrupWriter) => {
    const { type, isLocal, isThirdParty, grantDetails } =
      tableKit.getInfoForVal(value);
    if (isThirdParty) {
      if (grantDetails === undefined) {
        throw Error('Third party references must have grant details');
      }
      const { type: grantType } = grantDetails;
      const tableKey = `third-party:${grantType}`;
      const codec = writeRecordTypes[tableKey];
      if (!codec) {
        throw Error(`${codecName}: No write codec for table key ${tableKey}`);
      }
      // Pass only the HandoffGive details to the codec
      /** @type {HandoffGiveDetails} */
      const handoffGiveDetails = {
        value,
        grantDetails,
      };
      codec.write(handoffGiveDetails, syrupWriter);
    } else {
      const keyLocality = isLocal ? 'local' : 'remote';
      const tableKey = `${keyLocality}:${type}`;
      const codec = writeRecordTypes[tableKey];
      if (!codec) {
        throw Error(`${codecName}: No write codec for table key ${tableKey}`);
      }
      // Pass the whole value to the codec
      codec.write(value, syrupWriter);
    }
  };

  return harden({
    read: makeCodecReadWithErrorWrapping(codecName, read),
    write: makeCodecWriteWithErrorWrapping(codecName, write),
    supports,
    getChildCodecs,
  });
};
