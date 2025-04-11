import {
  makeRecordCodecFromDefinition,
  makeRecordUnionCodec,
} from '../codec.js';
import { OCapNNode, OCapNPublicKey, OCapNSignature } from './components.js';

/*
 * These are OCapN Descriptors, they are Passables that are used both
 * directly in OCapN Messages and as part of Passable structures.
 */

export const DescImportObject = makeRecordCodecFromDefinition(
  'desc:import-object',
  [['position', 'integer']],
);

export const DescImportPromise = makeRecordCodecFromDefinition(
  'desc:import-promise',
  [['position', 'integer']],
);

export const DescExport = makeRecordCodecFromDefinition('desc:export', [
  ['position', 'integer'],
]);

export const DescAnswer = makeRecordCodecFromDefinition('desc:answer', [
  ['position', 'integer'],
]);

export const DescHandoffGive = makeRecordCodecFromDefinition(
  'desc:handoff-give',
  [
    ['receiverKey', OCapNPublicKey],
    ['exporterLocation', OCapNNode],
    ['session', 'bytestring'],
    ['gifterSide', OCapNPublicKey],
    ['giftId', 'bytestring'],
  ],
);

export const DescSigGiveEnvelope = makeRecordCodecFromDefinition(
  'desc:sig-envelope',
  [
    ['object', DescHandoffGive],
    ['signature', OCapNSignature],
  ],
);

export const DescHandoffReceive = makeRecordCodecFromDefinition(
  'desc:handoff-receive',
  [
    ['receivingSession', 'bytestring'],
    ['receivingSide', 'bytestring'],
    ['handoffCount', 'integer'],
    ['signedGive', DescSigGiveEnvelope],
  ],
);

export const DescSigReceiveEnvelope = makeRecordCodecFromDefinition(
  'desc:sig-envelope',
  [
    ['object', DescHandoffReceive],
    ['signature', OCapNSignature],
  ],
);

// Note: this may only be useful for testing
export const OCapNDescriptorUnionCodec = makeRecordUnionCodec({
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
  return OCapNDescriptorUnionCodec.read(syrupReader);
};

export const writeOCapDescriptor = (descriptor, syrupWriter) => {
  OCapNDescriptorUnionCodec.write(descriptor, syrupWriter);
  return syrupWriter.bufferWriter.subarray(0, syrupWriter.bufferWriter.length);
};
