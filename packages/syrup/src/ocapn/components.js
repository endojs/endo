import { makeRecordUnionCodec } from '../codec.js';
import { makeOCapNRecordCodecFromDefinition } from './util.js';

/** @typedef {import('../codec.js').SyrupCodec} SyrupCodec */

const { freeze } = Object;

/*
 * OCapN Components are used in both OCapN Messages and Descriptors
 */

/**
 * @param {string} expectedLabel
 * @returns {SyrupCodec}
 */
export const makeOCapNSignatureValueComponentCodec = expectedLabel => {
  const read = syrupReader => {
    const label = syrupReader.readSelectorAsString();
    if (label !== expectedLabel) {
      throw Error(`Expected label ${expectedLabel}, got ${label}`);
    }
    const value = syrupReader.readBytestring();
    return value;
  };
  const write = (value, syrupWriter) => {
    syrupWriter.writeSelector(expectedLabel);
    syrupWriter.writeBytestring(value);
  };
  return freeze({ read, write });
};

const OCapNSignatureRValue = makeOCapNSignatureValueComponentCodec('r');
const OCapNSignatureSValue = makeOCapNSignatureValueComponentCodec('s');

export const OCapNSignature = makeOCapNRecordCodecFromDefinition('sig-val', [
  ['scheme', 'selector'],
  ['r', OCapNSignatureRValue],
  ['s', OCapNSignatureSValue],
]);

export const OCapNNode = makeOCapNRecordCodecFromDefinition('ocapn-node', [
  ['transport', 'selector'],
  ['address', 'bytestring'],
  ['hints', 'boolean'],
]);

export const OCapNSturdyRef = makeOCapNRecordCodecFromDefinition(
  'ocapn-sturdyref',
  [
    ['node', OCapNNode],
    ['swissNum', 'string'],
  ],
);

export const OCapNPublicKey = makeOCapNRecordCodecFromDefinition('public-key', [
  ['scheme', 'selector'],
  ['curve', 'selector'],
  ['flags', 'selector'],
  ['q', 'bytestring'],
]);

export const OCapNComponentUnionCodec = makeRecordUnionCodec({
  OCapNNode,
  OCapNSturdyRef,
  OCapNPublicKey,
  OCapNSignature,
});

export const readOCapComponent = syrupReader => {
  return OCapNComponentUnionCodec.read(syrupReader);
};

export const writeOCapComponent = (component, syrupWriter) => {
  OCapNComponentUnionCodec.write(component, syrupWriter);
  return syrupWriter.getBytes();
};
