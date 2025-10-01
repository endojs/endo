/**
 * @import { HandoffGiveDetails, TableKit } from '../client/ocapn.js'
 * @import { SyrupCodec, SyrupRecordCodec, SyrupRecordDefinition, SyrupRecordUnionCodec, SyrupType } from '../syrup/codec.js'
 * @import { SyrupReader } from '../syrup/decode.js'
 * @import { SyrupWriter } from '../syrup/encode.js'
 */

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
export const makeOcapnRecordCodecFromDefinition = (
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
export const makeOcapnRecordCodec = (codecName, label, readBody, writeBody) => {
  // Syrup Records as used in OCapN are always labeled with selectors
  return makeRecordCodec(codecName, label, 'selector', readBody, writeBody);
};

/**
 * @typedef {SyrupCodec & {
 *   label: string;
 *   readBody: (SyrupReader) => any;
 *   writeBody: (any, SyrupWriter) => void;
 * }} OcapnListComponentCodec
 */

/**
 * @param {string} codecName
 * @param {string} label
 * @param {function(SyrupReader): any} readBody
 * @param {function(any, SyrupWriter): void} writeBody
 * @returns {OcapnListComponentCodec}
 */
export const makeOcapnListComponentCodec = (
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
 * @param {Record<string, OcapnListComponentCodec>} listComponentTypes
 * @returns {SyrupCodec & {
 *   supports: (label: string) => boolean;
 * }}
 */
export const makeOcapnListComponentUnionCodec = (
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
