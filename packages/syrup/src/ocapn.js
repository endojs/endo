import { SyrupCodec, RecordUnionCodec, SyrupStructuredRecordCodecType, SimpleSyrupCodecType } from './codec.js';
import { OCapNPassableUnionCodec } from './passable.js';
import { DescImportObject, DescImportPromise, DescExport, DescAnswer } from './import-export.js';

// OCapN Components

export class OCapNSignatureValueCodec extends SyrupCodec {
  /**
   * @param {string} expectedLabel
   */
  constructor(expectedLabel) {
    super();
    this.expectedLabel = expectedLabel;
  }
  unmarshal(syrupReader) {
    const label = syrupReader.readSymbolAsString();
    if (label !== this.expectedLabel) {
      throw Error(`Expected label ${this.expectedLabel}, got ${label}`);
    }
    const value = syrupReader.readBytestring();
    return value;
  }
  marshal(value, syrupWriter) {
    syrupWriter.writeSymbol(this.expectedLabel);
    syrupWriter.writeBytestring(value);
  }
}

const OCapNSignatureRValue = new OCapNSignatureValueCodec('r');
const OCapNSignatureSValue = new OCapNSignatureValueCodec('s');

const OCapNSignature = new SyrupStructuredRecordCodecType(
  'sig-val', [
  ['scheme', 'symbol'],
  ['r', OCapNSignatureRValue],
  ['s', OCapNSignatureSValue],
])

const OCapNNode = new SyrupStructuredRecordCodecType(
  'ocapn-node', [
  ['transport', 'symbol'],
  ['address', 'bytestring'],
  ['hints', 'boolean'],
])

const OCapNSturdyRef = new SyrupStructuredRecordCodecType(
  'ocapn-sturdyref', [
  ['node', OCapNNode],
  ['swissNum', 'string'],
])

const OCapNPublicKey = new SyrupStructuredRecordCodecType(
  'public-key', [
  ['scheme', 'symbol'],
  ['curve', 'symbol'],
  ['flags', 'symbol'],
  ['q', 'bytestring'],
])


const OCapNComponentCodecs = {
  OCapNNode,
  OCapNSturdyRef,
  OCapNPublicKey,
  OCapNSignature,
}

// OCapN Descriptors

const DescHandoffGive = new SyrupStructuredRecordCodecType(
  'desc:handoff-give', [
  ['receiverKey', OCapNPublicKey],
  ['exporterLocation', OCapNNode],
  ['session', 'bytestring'],
  ['gifterSide', OCapNPublicKey],
  ['giftId', 'bytestring'],
])

const DescSigGiveEnvelope = new SyrupStructuredRecordCodecType(
  'desc:sig-envelope', [
  // TODO: verify union type, can be DescHandoffReceive, DescHandoffGive, ...
  ['object', DescHandoffGive],
  ['signature', OCapNSignature],
])

const DescHandoffReceive = new SyrupStructuredRecordCodecType(
  'desc:handoff-receive', [
  ['receivingSession', 'bytestring'],
  ['receivingSide', 'bytestring'],
  ['handoffCount', 'integer'],
  ['signedGive', DescSigGiveEnvelope],
])

const DescSigReceiveEnvelope = new SyrupStructuredRecordCodecType(
  'desc:sig-envelope', [
  // TODO: verify union type, can be DescHandoffReceive, DescHandoffGive, ...
  ['object', DescHandoffReceive],
  ['signature', OCapNSignature],
])


// Note: this may only be useful for testing
const OCapNDescriptorCodecs = {
  OCapNNode,
  OCapNSturdyRef,
  OCapNPublicKey,
  OCapNSignature,
  DescSigGiveEnvelope,
  // TODO: ambiguous record label for DescSigGiveEnvelope and DescSigReceiveEnvelope
  // DescSigReceiveEnvelope,
  DescImportObject,
  DescImportPromise,
  DescExport,
  DescAnswer,
  DescHandoffGive,
  DescHandoffReceive,
}

// OCapN Operations

const OpStartSession = new SyrupStructuredRecordCodecType(
  'op:start-session', [
  ['captpVersion', 'string'],
  ['sessionPublicKey', OCapNPublicKey],
  ['location', OCapNNode],
  ['locationSignature', OCapNSignature],
])


const OCapNDeliverResolveMeDescs = {
  DescImportObject,
  DescImportPromise,
}

const OCapNResolveMeDescCodec = new RecordUnionCodec(OCapNDeliverResolveMeDescs);

const OpListen = new SyrupStructuredRecordCodecType(
  'op:listen', [
  ['to', DescExport],
  ['resolveMeDesc', OCapNResolveMeDescCodec],
  ['wantsPartial', 'boolean'],
])

const OCapNDeliverTargets = {
  DescExport,
  DescAnswer,
}

const OCapNDeliverTargetCodec = new RecordUnionCodec(OCapNDeliverTargets);

// Used by the deliver and deliver-only operations
// First arg is method name, rest are Passables
const OpDeliverArgsCodec = new SimpleSyrupCodecType({
  unmarshal: (syrupReader) => {
    syrupReader.enterList();
    const result = [
      // method name
      syrupReader.readSymbolAsString(),
    ];
    while (!syrupReader.peekListEnd()) {
      result.push(
        OCapNPassableUnionCodec.unmarshal(syrupReader)
      )
    }
    syrupReader.exitList();
    return result;
  },
  marshal: ([methodName, ...args], syrupWriter) => {
    syrupWriter.enterList();
    syrupWriter.writeSymbol(methodName);
    for (const arg of args) {
      OCapNPassableUnionCodec.marshal(arg, syrupWriter);
    }
    syrupWriter.exitList();
  },
})

const OpDeliverOnly = new SyrupStructuredRecordCodecType(
  'op:deliver-only', [
  ['to', OCapNDeliverTargetCodec],
  ['args', OpDeliverArgsCodec],
])

const OpDeliverAnswerCodec = new SimpleSyrupCodecType({
  unmarshal: (syrupReader) => {
    const typeHint = syrupReader.peekTypeHint();
    if (typeHint === 'number-prefix') {
      // should be an integer
      return syrupReader.readInteger();
    }
    if (typeHint === 'boolean') {
      return syrupReader.readBoolean();
    }
    throw Error(`Expected integer or boolean, got ${typeHint}`);
  },
  marshal: (value, syrupWriter) => {
    if (typeof value === 'bigint') {
      syrupWriter.writeInteger(value);
    } else if (typeof value === 'boolean') {
      syrupWriter.writeBoolean(value);
    } else {
      throw Error(`Expected integer or boolean, got ${typeof value}`);
    }
  },
});

const OpDeliver = new SyrupStructuredRecordCodecType(
  'op:deliver', [
  ['to', OCapNDeliverTargetCodec],
  ['args', OpDeliverArgsCodec],
  ['answerPosition', OpDeliverAnswerCodec],
  ['resolveMeDesc', OCapNResolveMeDescCodec],
])

const OpAbort = new SyrupStructuredRecordCodecType(
  'op:abort', [
  ['reason', 'string'],
])

const OpGcExport = new SyrupStructuredRecordCodecType(
  'op:gc-export', [
  ['exportPosition', 'integer'],
  ['wireDelta', 'integer'],
])

const OpGcAnswer = new SyrupStructuredRecordCodecType(
  'op:gc-answer', [
  ['answerPosition', 'integer'],
])

const OpGcSession = new SyrupStructuredRecordCodecType(
  'op:gc-session', [
  ['session', 'bytestring'],
])

const OCapNOpCodecs = {
  OpStartSession,
  OpListen,
  OpDeliverOnly,
  OpDeliver,
  OpAbort,
  OpGcExport,
  OpGcAnswer,
  OpGcSession,
}

export const OCapNMessageUnionCodec = new RecordUnionCodec(OCapNOpCodecs);
export const OCapNDescriptorUnionCodec = new RecordUnionCodec(OCapNDescriptorCodecs);
export const OCapNComponentUnionCodec = new RecordUnionCodec(OCapNComponentCodecs);

export const readOCapNMessage = (syrupReader) => {
  return OCapNMessageUnionCodec.unmarshal(syrupReader);
}

export const readOCapDescriptor = (syrupReader) => {
  return OCapNDescriptorUnionCodec.unmarshal(syrupReader);
}

export const readOCapComponent = (syrupReader) => {
  return OCapNComponentUnionCodec.unmarshal(syrupReader);
}

export const writeOCapNMessage = (message, syrupWriter) => {
  OCapNMessageUnionCodec.marshal(message, syrupWriter);
  return syrupWriter.bufferWriter.subarray(0, syrupWriter.bufferWriter.length);
}

export const writeOCapDescriptor = (descriptor, syrupWriter) => {
  OCapNDescriptorUnionCodec.marshal(descriptor, syrupWriter);
  return syrupWriter.bufferWriter.subarray(0, syrupWriter.bufferWriter.length);
}

export const writeOCapComponent = (component, syrupWriter) => {
  OCapNComponentUnionCodec.marshal(component, syrupWriter);
  return syrupWriter.bufferWriter.subarray(0, syrupWriter.bufferWriter.length);
}
