import {
  RecordUnionCodec,
  SyrupCodec,
  SyrupStructuredRecordCodecType,
} from '../codec.js';

/*
 * OCapN Components are used in both OCapN Messages and Descriptors
 */

export class OCapNSignatureValueCodec extends SyrupCodec {
  /**
   * @param {string} expectedLabel
   */
  constructor(expectedLabel) {
    super();
    this.expectedLabel = expectedLabel;
  }

  read(syrupReader) {
    const label = syrupReader.readSymbolAsString();
    if (label !== this.expectedLabel) {
      throw Error(`Expected label ${this.expectedLabel}, got ${label}`);
    }
    const value = syrupReader.readBytestring();
    return value;
  }

  write(value, syrupWriter) {
    syrupWriter.writeSymbol(this.expectedLabel);
    syrupWriter.writeBytestring(value);
  }
}

const OCapNSignatureRValue = new OCapNSignatureValueCodec('r');
const OCapNSignatureSValue = new OCapNSignatureValueCodec('s');

export const OCapNSignature = new SyrupStructuredRecordCodecType('sig-val', [
  ['scheme', 'symbol'],
  ['r', OCapNSignatureRValue],
  ['s', OCapNSignatureSValue],
]);

export const OCapNNode = new SyrupStructuredRecordCodecType('ocapn-node', [
  ['transport', 'symbol'],
  ['address', 'bytestring'],
  ['hints', 'boolean'],
]);

export const OCapNSturdyRef = new SyrupStructuredRecordCodecType(
  'ocapn-sturdyref',
  [
    ['node', OCapNNode],
    ['swissNum', 'string'],
  ],
);

export const OCapNPublicKey = new SyrupStructuredRecordCodecType('public-key', [
  ['scheme', 'symbol'],
  ['curve', 'symbol'],
  ['flags', 'symbol'],
  ['q', 'bytestring'],
]);

export const OCapNComponentUnionCodec = new RecordUnionCodec({
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
