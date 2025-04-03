import { SyrupRecordCodecType, SyrupCodec, RecordUnionCodec } from './codec.js';

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

const OCapNSignature = new SyrupRecordCodecType(
  'sig-val', [
  ['scheme', 'symbol'],
  ['r', OCapNSignatureRValue],
  ['s', OCapNSignatureSValue],
])

const OCapNNode = new SyrupRecordCodecType(
  'ocapn-node', [
  ['transport', 'symbol'],
  ['address', 'bytestring'],
  ['hints', 'boolean'],
])

const OCapNSturdyRef = new SyrupRecordCodecType(
  'ocapn-sturdyref', [
  ['node', OCapNNode],
  ['swissNum', 'string'],
])

const OCapNPublicKey = new SyrupRecordCodecType(
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

const DescSigEnvelope = new SyrupRecordCodecType(
  'desc:sig-envelope', [
  // TODO: union type, can be DescHandoffReceive, DescHandoffGive, ...
  ['object', 'any'],
  ['signature', OCapNSignature],
])

const DescImportObject = new SyrupRecordCodecType(
  'desc:import-object', [
  ['position', 'integer'],
])

const DescImportPromise = new SyrupRecordCodecType(
  'desc:import-promise', [
  ['position', 'integer'],
])

const DescExport = new SyrupRecordCodecType(
  'desc:export', [
  ['position', 'integer'],
])

const DescAnswer = new SyrupRecordCodecType(
  'desc:answer', [
  ['position', 'integer'],
])

const DescHandoffGive = new SyrupRecordCodecType(
  'desc:handoff-give', [
  ['receiverKey', OCapNPublicKey],
  ['exporterLocation', OCapNNode],
  ['session', 'bytestring'],
  ['gifterSide', OCapNPublicKey],
  ['giftId', 'bytestring'],
])

const DescHandoffReceive = new SyrupRecordCodecType(
  'desc:handoff-receive', [
  ['receivingSession', 'bytestring'],
  ['receivingSide', 'bytestring'],
  ['handoffCount', 'integer'],
  ['signedGive', DescSigEnvelope],
])

const OCapNDescriptorCodecs = {
  OCapNNode,
  OCapNSturdyRef,
  OCapNPublicKey,
  OCapNSignature,
  DescSigEnvelope,
  DescImportObject,
  DescImportPromise,
  DescExport,
  DescAnswer,
  DescHandoffGive,
  DescHandoffReceive,
}

// OCapN Operations

const OpStartSession = new SyrupRecordCodecType(
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

const OpListen = new SyrupRecordCodecType(
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


const OpDeliverOnly = new SyrupRecordCodecType(
  'op:deliver-only', [
  ['to', OCapNDeliverTargetCodec],
  // TODO: list type, can include OCapNSturdyRef, ...
  ['args', 'list'],
])

const OpDeliver = new SyrupRecordCodecType(
  'op:deliver', [
  ['to', OCapNDeliverTargetCodec],
  // TODO: list type, can be DescSigEnvelope
  ['args', 'list'],
  ['answerPosition', 'integer'],
  ['resolveMeDesc', OCapNResolveMeDescCodec],
])

const OpAbort = new SyrupRecordCodecType(
  'op:abort', [
  ['reason', 'string'],
])

const OpGcExport = new SyrupRecordCodecType(
  'op:gc-export', [
  ['exportPosition', 'integer'],
  ['wireDelta', 'integer'],
])

const OpGcAnswer = new SyrupRecordCodecType(
  'op:gc-answer', [
  ['answerPosition', 'integer'],
])

const OpGcSession = new SyrupRecordCodecType(
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
