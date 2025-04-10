import { RecordUnionCodec, SyrupStructuredRecordCodecType } from '../codec.js';
import { OCapNNode, OCapNPublicKey, OCapNSignature } from './components.js';

/*
 * These are OCapN Descriptors, they are Passables that are used both
 * directly in OCapN Messages and as part of Passable structures.
 */

export const DescImportObject = new SyrupStructuredRecordCodecType(
  'desc:import-object',
  [['position', 'integer']],
);

export const DescImportPromise = new SyrupStructuredRecordCodecType(
  'desc:import-promise',
  [['position', 'integer']],
);

export const DescExport = new SyrupStructuredRecordCodecType('desc:export', [
  ['position', 'integer'],
]);

export const DescAnswer = new SyrupStructuredRecordCodecType('desc:answer', [
  ['position', 'integer'],
]);

export const DescHandoffGive = new SyrupStructuredRecordCodecType(
  'desc:handoff-give',
  [
    ['receiverKey', OCapNPublicKey],
    ['exporterLocation', OCapNNode],
    ['session', 'bytestring'],
    ['gifterSide', OCapNPublicKey],
    ['giftId', 'bytestring'],
  ],
);

export const DescSigGiveEnvelope = new SyrupStructuredRecordCodecType(
  'desc:sig-envelope',
  [
    ['object', DescHandoffGive],
    ['signature', OCapNSignature],
  ],
);

export const DescHandoffReceive = new SyrupStructuredRecordCodecType(
  'desc:handoff-receive',
  [
    ['receivingSession', 'bytestring'],
    ['receivingSide', 'bytestring'],
    ['handoffCount', 'integer'],
    ['signedGive', DescSigGiveEnvelope],
  ],
);

export const DescSigReceiveEnvelope = new SyrupStructuredRecordCodecType(
  'desc:sig-envelope',
  [
    ['object', DescHandoffReceive],
    ['signature', OCapNSignature],
  ],
);

// Note: this may only be useful for testing
export const OCapNDescriptorUnionCodec = new RecordUnionCodec({
  OCapNNode,
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
});

export const readOCapDescriptor = syrupReader => {
  return OCapNDescriptorUnionCodec.unmarshal(syrupReader);
};

export const writeOCapDescriptor = (descriptor, syrupWriter) => {
  OCapNDescriptorUnionCodec.marshal(descriptor, syrupWriter);
  return syrupWriter.bufferWriter.subarray(0, syrupWriter.bufferWriter.length);
};
