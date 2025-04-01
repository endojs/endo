
class Codec {
  marshal(value) {
    throw Error('Virtual method: marshal');
  }
  unmarshal(parser) {
    throw Error('Virtual method: unmarshal');
  }
}

class OcapnRecordCodec extends Codec {
  constructor(label, definition) {
    super();
    this.label = label;
    this.definition = definition;
    for (const [fieldName] of definition) {
      if (fieldName === 'type') {
        throw new Error('OcapnRecordCodec: The "type" field is reserved for internal use.');
      }
    }
  }
  unmarshal(parser) {
    parser.enterRecord();
    const label = parser.readSymbolAsString();
    if (label !== this.label) {
      throw Error(`Expected label ${this.label}, got ${label}`);
    }
    const result = this.unmarshalBody(parser);
    parser.exitRecord();
    return result;
  }
  unmarshalBody(parser) {
    const result = {};
    for (const field of this.definition) {
      const [fieldName, fieldType] = field;
      let fieldValue;
      if (typeof fieldType === 'string') {
        fieldValue = parser.readOfType(fieldType);
      } else {
        const fieldDefinition = fieldType;
        fieldValue = fieldDefinition.unmarshal(parser);
      }
      result[fieldName] = fieldValue;
    }
    result.type = this.label;
    return result;
  }
  marshal(value) {
    const result = [];
    for (const field of this.definition) {
      const [fieldName, fieldType] = field;
      let fieldValue;
      if (typeof fieldType === 'string') {
        // TODO: WRONG
        fieldValue = value[fieldName];
      } else {
        const fieldDefinition = fieldType;
        fieldValue = fieldDefinition.marshal(value[fieldName]);
      }
      result.push(fieldValue);
    }
    return result;
  }
}

// OCapN Descriptors and Subtypes

const OCapNNode = new OcapnRecordCodec(
  'ocapn-node', [
  ['transport', 'symbol'],
  ['address', 'bytestring'],
  ['hints', 'boolean'],
])

const OCapNSturdyRef = new OcapnRecordCodec(
  'ocapn-sturdyref', [
  ['node', OCapNNode],
  ['swissNum', 'string'],
])

const OCapNPublicKey = new OcapnRecordCodec(
  'public-key', [
  ['scheme', 'symbol'],
  ['curve', 'symbol'],
  ['flags', 'symbol'],
  ['q', 'bytestring'],
])

const OCapNSignature = new OcapnRecordCodec(
  'sig-val', [
  ['scheme', 'symbol'],
  // TODO: list type
  ['r', [
    ['label', 'symbol'],
    ['value', 'bytestring'],
  ]],
  ['s', [
    ['label', 'symbol'],
    ['value', 'bytestring'],
  ]],
])

const DescSigEnvelope = new OcapnRecordCodec(
  'desc:sig-envelope', [
  // TODO: union type, can be DescHandoffReceive, DescHandoffGive, ...
  ['object', 'any'],
  ['signature', OCapNSignature],
])


const DescImportObject = new OcapnRecordCodec(
  'desc:import-object', [
  ['position', 'integer'],
])

const DescImportPromise = new OcapnRecordCodec(
  'desc:import-promise', [
  ['position', 'integer'],
])

const DescExport = new OcapnRecordCodec(
  'desc:export', [
  ['position', 'integer'],
])

const DescAnswer = new OcapnRecordCodec(
  'desc:answer', [
  ['position', 'integer'],
])

const DescHandoffGive = new OcapnRecordCodec(
  'desc:handoff-give', [
  ['receiverKey', OCapNPublicKey],
  ['exporterLocation', OCapNNode],
  ['session', 'bytestring'],
  ['gifterSide', OCapNPublicKey],
  ['giftId', 'bytestring'],
])

const DescHandoffReceive = new OcapnRecordCodec(
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

const OpStartSession = new OcapnRecordCodec(
  'op:start-session', [
  ['captpVersion', 'string'],
  ['sessionPublicKey', OCapNPublicKey],
  ['location', OCapNNode],
  ['locationSignature', OCapNSignature],
])

const OpListen = new OcapnRecordCodec(
  'op:listen', [
  ['to', DescExport],
  // TODO: union type
  ['resolveMeDesc', [DescImportObject, DescImportPromise]],
  ['wantsPartial', 'boolean'],
])

const OpDeliverOnly = new OcapnRecordCodec(
  'op:deliver-only', [
  // TODO: union type
  ['to', [DescExport, DescAnswer]],
  // TODO: list type, can include OCapNSturdyRef, ...
  ['args', 'list'],
])

const OpDeliver = new OcapnRecordCodec(
  'op:deliver', [
  // TODO: union type
  ['to', [DescExport, DescAnswer]],
  // TODO: list type, can be DescSigEnvelope
  ['args', 'list'],
  ['answerPosition', 'integer'],
  // TODO: union type
  ['resolveMeDesc', [DescImportObject, DescImportPromise]],
])

const OpAbort = new OcapnRecordCodec(
  'op:abort', [
  ['reason', 'string'],
])

const OpGcExport = new OcapnRecordCodec(
  'op:gc-export', [
  ['exportPosition', 'integer'],
  ['wireDelta', 'integer'],
])

const OpGcAnswer = new OcapnRecordCodec(
  'op:gc-answer', [
  ['answerPosition', 'integer'],
])

const OpGcSession = new OcapnRecordCodec(
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

const OCapNMessageCodecTable = Object.fromEntries(
  Object.values(OCapNOpCodecs).map(recordCodec => [recordCodec.label, recordCodec])
);

const OCapNDescriptorCodecTable = Object.fromEntries(
  Object.values(OCapNDescriptorCodecs).map(recordCodec => [recordCodec.label, recordCodec])
);

export const readOCapNMessage = (parser) => {
  parser.enterRecord();
  const label = parser.readSymbolAsString();
  const recordCodec = OCapNMessageCodecTable[label];
  if (!recordCodec) {
    throw Error(`Unknown OCapN message type: ${label}`);
  }
  const result = recordCodec.unmarshalBody(parser);
  parser.exitRecord();
  return result;
}

export const readOCapDescriptor = (parser) => {
  parser.enterRecord();
  const label = parser.readSymbolAsString();
  const recordCodec = OCapNDescriptorCodecTable[label];
  if (!recordCodec) {
    throw Error(`Unknown OCapN descriptor type: ${label}`);
  }
  const result = recordCodec.unmarshalBody(parser);
  parser.exitRecord();
  return result;
}
