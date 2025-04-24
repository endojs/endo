// @ts-check

import { makeRecordUnionCodec } from '../syrup/codec.js';
import { makeOCapNRecordCodecFromDefinition } from './util.js';

/** @typedef {import('../syrup/codec.js').SyrupCodec} SyrupCodec */

const { freeze } = Object;

/*
 * OCapN Components are used in both OCapN Messages and Descriptors
 */

/**
 * @param {string} expectedLabel
 * @returns {SyrupCodec}
 */
export const makeOCapNSignatureValueComponentCodec = expectedLabel => {
  /**
   * @param {import('../syrup/decode.js').SyrupReader} syrupReader
   * @returns {Uint8Array}
   */
  const read = syrupReader => {
    const label = syrupReader.readSelectorAsString();
    if (label !== expectedLabel) {
      throw Error(`Expected label ${expectedLabel}, got ${label}`);
    }
    const value = syrupReader.readBytestring();
    return value;
  };
  /**
   * @param {Uint8Array} value
   * @param {import('../syrup/encode.js').SyrupWriter} syrupWriter
   */
  const write = (value, syrupWriter) => {
    syrupWriter.writeSelectorFromString(expectedLabel);
    syrupWriter.writeBytestring(value);
  };
  return freeze({ read, write });
};

const OCapNSignatureRValue = makeOCapNSignatureValueComponentCodec('r');
const OCapNSignatureSValue = makeOCapNSignatureValueComponentCodec('s');

export const OCapNSignature = makeOCapNRecordCodecFromDefinition(
  'OCapNSignatureCodec',
  'sig-val',
  [
    ['scheme', 'selector'],
    ['r', OCapNSignatureRValue],
    ['s', OCapNSignatureSValue],
  ],
);

export const OCapNNode = makeOCapNRecordCodecFromDefinition(
  'OCapNNodeCodec',
  'ocapn-node',
  [
    ['transport', 'selector'],
    ['address', 'bytestring'],
    ['hints', 'boolean'],
  ],
);

export const OCapNSturdyRef = makeOCapNRecordCodecFromDefinition(
  'OCapNSturdyRefCodec',
  'ocapn-sturdyref',
  [
    ['node', OCapNNode],
    ['swissNum', 'string'],
  ],
);

export const OCapNPublicKey = makeOCapNRecordCodecFromDefinition(
  'OCapNPublicKeyCodec',
  'public-key',
  [
    ['scheme', 'selector'],
    ['curve', 'selector'],
    ['flags', 'selector'],
    ['q', 'bytestring'],
  ],
);

// TODO: delete?
export const OCapNComponentUnionCodec = makeRecordUnionCodec(
  'OCapNComponentUnionCodec',
  {
    OCapNNode,
    OCapNSturdyRef,
    OCapNPublicKey,
    OCapNSignature,
  },
);

export const readOCapComponent = syrupReader => {
  return OCapNComponentUnionCodec.read(syrupReader);
};

export const writeOCapComponent = (component, syrupWriter) => {
  OCapNComponentUnionCodec.write(component, syrupWriter);
  return syrupWriter.getBytes();
};
