import { makeRecordUnionCodec } from '../syrup/codec.js';
import { makeOCapNRecordCodecFromDefinition } from './util.js';
import { PositiveIntegerCodec } from './subtypes.js';
import { OCapNNode, OCapNPublicKey, OCapNSignature } from './components.js';

/*
 * These are OCapN Descriptors, they are Passables that are used both
 * directly in OCapN Messages and as part of Passable structures.
 */

export const DescImportObject = makeOCapNRecordCodecFromDefinition(
  'desc:import-object',
  [['position', PositiveIntegerCodec]],
);

export const DescImportPromise = makeOCapNRecordCodecFromDefinition(
  'desc:import-promise',
  [['position', PositiveIntegerCodec]],
);

export const DescExport = makeOCapNRecordCodecFromDefinition('desc:export', [
  ['position', PositiveIntegerCodec],
]);

export const DescAnswer = makeOCapNRecordCodecFromDefinition('desc:answer', [
  ['position', PositiveIntegerCodec],
]);

export const DescHandoffGive = makeOCapNRecordCodecFromDefinition(
  'desc:handoff-give',
  [
    ['receiverKey', OCapNPublicKey],
    ['exporterLocation', OCapNNode],
    ['session', 'bytestring'],
    ['gifterSide', OCapNPublicKey],
    ['giftId', 'bytestring'],
  ],
);

export const DescSigGiveEnvelope = makeOCapNRecordCodecFromDefinition(
  'desc:sig-envelope',
  [
    ['object', DescHandoffGive],
    ['signature', OCapNSignature],
  ],
);

export const DescHandoffReceive = makeOCapNRecordCodecFromDefinition(
  'desc:handoff-receive',
  [
    ['receivingSession', 'bytestring'],
    ['receivingSide', 'bytestring'],
    ['handoffCount', PositiveIntegerCodec],
    ['signedGive', DescSigGiveEnvelope],
  ],
);

export const DescSigReceiveEnvelope = makeOCapNRecordCodecFromDefinition(
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
