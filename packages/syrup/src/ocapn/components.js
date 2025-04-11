import {
  makeRecordCodecFromDefinition,
  makeRecordUnionCodec,
} from '../codec.js';
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
    const label = syrupReader.readSymbolAsString();
    if (label !== expectedLabel) {
      throw Error(`Expected label ${expectedLabel}, got ${label}`);
    }
    const value = syrupReader.readBytestring();
    return value;
  };
  const write = (value, syrupWriter) => {
    syrupWriter.writeSymbol(expectedLabel);
    syrupWriter.writeBytestring(value);
  };
  return freeze({ read, write });
};

const OCapNSignatureRValue = makeOCapNSignatureValueComponentCodec('r');
const OCapNSignatureSValue = makeOCapNSignatureValueComponentCodec('s');

export const OCapNSignature = makeRecordCodecFromDefinition('sig-val', [
  ['scheme', 'symbol'],
  ['r', OCapNSignatureRValue],
  ['s', OCapNSignatureSValue],
]);

export const OCapNNode = makeRecordCodecFromDefinition('ocapn-node', [
  ['transport', 'symbol'],
  ['address', 'bytestring'],
  ['hints', 'boolean'],
]);

export const OCapNSturdyRef = makeRecordCodecFromDefinition('ocapn-sturdyref', [
  ['node', OCapNNode],
  ['swissNum', 'string'],
]);

export const OCapNPublicKey = makeRecordCodecFromDefinition('public-key', [
  ['scheme', 'symbol'],
  ['curve', 'symbol'],
  ['flags', 'symbol'],
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
  return syrupWriter.bufferWriter.subarray(0, syrupWriter.bufferWriter.length);
};
