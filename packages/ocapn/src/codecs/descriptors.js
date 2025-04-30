import { makeRecordUnionCodec } from '../syrup/codec.js';
import { makeOCapNRecordCodecFromDefinition } from './util.js';
import { PositiveIntegerCodec } from './subtypes.js';
import { OCapNNode, OCapNPublicKey, OCapNSignature } from './components.js';

/** @typedef {import('../syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../syrup/encode.js').SyrupWriter} SyrupWriter */

/*
 * These are OCapN Descriptors, they are Passables that are used both
 * directly in OCapN Messages and as part of Passable structures.
 */

export const DescImportObject = makeOCapNRecordCodecFromDefinition(
  'DescImportObject',
  'desc:import-object',
  {
    position: PositiveIntegerCodec,
  },
);

export const DescImportPromise = makeOCapNRecordCodecFromDefinition(
  'DescImportPromise',
  'desc:import-promise',
  {
    position: PositiveIntegerCodec,
  },
);

export const DescExport = makeOCapNRecordCodecFromDefinition(
  'DescExport',
  'desc:export',
  {
    position: PositiveIntegerCodec,
  },
);

export const DescAnswer = makeOCapNRecordCodecFromDefinition(
  'DescAnswer',
  'desc:answer',
  {
    position: PositiveIntegerCodec,
  },
);

export const DescHandoffGive = makeOCapNRecordCodecFromDefinition(
  'DescHandoffGive',
  'desc:handoff-give',
  {
    receiverKey: OCapNPublicKey,
    exporterLocation: OCapNNode,
    exporterSessionId: 'bytestring',
    gifterSideId: 'bytestring',
    giftId: 'bytestring',
  },
);

export const DescSigGiveEnvelope = makeOCapNRecordCodecFromDefinition(
  'DescSigGiveEnvelope',
  'desc:sig-envelope',
  {
    object: DescHandoffGive,
    signature: OCapNSignature,
  },
);

export const DescHandoffReceive = makeOCapNRecordCodecFromDefinition(
  'DescHandoffReceive',
  'desc:handoff-receive',
  {
    receivingSession: 'bytestring',
    receivingSide: 'bytestring',
    handoffCount: PositiveIntegerCodec,
    signedGive: DescSigGiveEnvelope,
  },
);

export const DescSigReceiveEnvelope = makeOCapNRecordCodecFromDefinition(
  'DescSigReceiveEnvelope',
  'desc:sig-envelope',
  {
    object: DescHandoffReceive,
    signature: OCapNSignature,
  },
);

// Note: this may only be useful for testing
export const OCapNDescriptorUnionCodec = makeRecordUnionCodec(
  'OCapNDescriptorUnionCodec',
  {
    OCapNNode,
    DescSigGiveEnvelope,
    // TODO: ambiguous record label for DescSigGiveEnvelope and DescSigReceiveEnvelope
    // DescSigReceiveEnvelope,
    DescImportObject,
    DescImportPromise,
    DescExport,
    DescAnswer,
    DescHandoffGive,
    DescHandoffReceive,
  },
);

/**
 * @param {SyrupReader} syrupReader
 * @returns {any}
 */
export const readOCapDescriptor = syrupReader => {
  return OCapNDescriptorUnionCodec.read(syrupReader);
};

/**
 * @param {any} descriptor
 * @param {SyrupWriter} syrupWriter
 * @returns {Uint8Array}
 */
export const writeOCapDescriptor = (descriptor, syrupWriter) => {
  OCapNDescriptorUnionCodec.write(descriptor, syrupWriter);
  return syrupWriter.getBytes();
};
