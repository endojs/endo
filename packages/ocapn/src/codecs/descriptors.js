// @ts-check

/** @typedef {import('../syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../syrup/encode.js').SyrupWriter} SyrupWriter */
/** @typedef {import('../syrup/codec.js').SyrupCodec} SyrupCodec */
/** @typedef {import('../syrup/codec.js').SyrupRecordCodec} SyrupRecordCodec */
/** @typedef {import('../syrup/codec.js').SyrupRecordUnionCodec} SyrupRecordUnionCodec */
/** @typedef {import('../client/ocapn.js').TableKit} TableKit */
/** @typedef {import('../client/types.js').OCapNPublicKey} OCapNPublicKey */
/** @typedef {import('../client/types.js').OCapNLocation} OCapNLocation */
/** @typedef {import('../client/types.js').OCapNKeyPair} OCapNKeyPair */
/** @typedef {import('./components.js').OCapNPublicKeyData} OCapNPublicKeyData */
/** @typedef {import('../client/ocapn.js').GrantDetails} GrantDetails */
/** @typedef {import('../client/ocapn.js').HandoffGiveDetails} HandoffGiveDetails */

import { makeCodec, makeRecordUnionCodec } from '../syrup/codec.js';
import {
  makeOCapNRecordCodec,
  makeOCapNRecordCodecFromDefinition,
  makeValueInfoRecordUnionCodec,
} from './util.js';
import { PositiveIntegerCodec } from './subtypes.js';
import { OCapNNode, OCapNPublicKey, OCapNSignature } from './components.js';
import { makeSyrupWriter } from '../syrup/encode.js';

/**
 * @typedef {object} DescCodecs
 * @property {SyrupRecordCodec} DescImportObject
 * @property {SyrupRecordCodec} DescImportPromise
 * @property {SyrupRecordCodec} DescExport
 * @property {SyrupRecordCodec} DescAnswer
 * @property {SyrupCodec} ResolveMeDesc
 * @property {SyrupRecordUnionCodec} ReferenceCodec
 * @property {SyrupCodec} DeliverTarget
 */

/**
 * @typedef {object} HandoffGive
 * @property {'desc:handoff-give'} type
 * @property {OCapNPublicKeyData} receiverKey
 * @property {OCapNLocation} exporterLocation
 * @property {Uint8Array} exporterSessionId
 * @property {Uint8Array} gifterSideId
 * @property {Uint8Array} giftId
 */

/**
 * @typedef {object} HandoffGiveSigEnvelope
 * @property {'desc:sig-envelope'} type
 * @property {HandoffGive} object
 * @property {OCapNSignature} signature
 */

/**
 * @typedef {object} HandoffReceive
 * @property {'desc:handoff-receive'} type
 * @property {Uint8Array} receivingSession
 * @property {Uint8Array} receivingSide
 * @property {bigint} handoffCount
 * @property {HandoffGiveSigEnvelope} signedGive
 */

/**
 * @typedef {object} HandoffReceiveSigEnvelope
 * @property {'desc:sig-envelope'} type
 * @property {HandoffReceive} object
 * @property {OCapNSignature} signature
 */

const DescHandoffGiveCodec = makeOCapNRecordCodecFromDefinition(
  'DescHandoffGive',
  'desc:handoff-give',
  {
    // ReceiverKeyForGifter Public Key
    receiverKey: OCapNPublicKey,
    exporterLocation: OCapNNode,
    // Gifter-Exporter Session ID
    exporterSessionId: 'bytestring',
    // gifterKeyForExporter Public ID
    gifterSideId: 'bytestring',
    // Gifter-specified gift ID
    giftId: 'bytestring',
  },
);

const DescHandoffGiveSigEnvelopeCodec = makeOCapNRecordCodecFromDefinition(
  'DescHandoffGiveSigEnvelope',
  'desc:sig-envelope',
  {
    object: DescHandoffGiveCodec,
    signature: OCapNSignature,
  },
);

const DescHandoffReceiveCodec = makeOCapNRecordCodecFromDefinition(
  'DescHandoffReceive',
  'desc:handoff-receive',
  {
    receivingSession: 'bytestring',
    receivingSide: 'bytestring',
    handoffCount: PositiveIntegerCodec,
    signedGive: DescHandoffGiveSigEnvelopeCodec,
  },
);

const DescHandoffReceiveSigEnvelopeCodec = makeOCapNRecordCodecFromDefinition(
  'DescHandoffReceiveSigEnvelope',
  'desc:sig-envelope',
  {
    object: DescHandoffReceiveCodec,
    signature: OCapNSignature,
  },
);

const SignedEnvelopeContentUnionCodec = makeRecordUnionCodec(
  'SignedEnvelopeContentUnionCodec',
  {
    DescHandoffGiveCodec,
    DescHandoffReceiveCodec,
  },
);

const DescSigEnvelopeReadCodec = makeOCapNRecordCodecFromDefinition(
  'DescSigEnvelope',
  'desc:sig-envelope',
  {
    object: SignedEnvelopeContentUnionCodec,
    signature: OCapNSignature,
  },
);

/**
 * @param {HandoffGive} handoffGive
 * @returns {Uint8Array}
 */
export const serializeHandoffGive = handoffGive => {
  const syrupWriter = makeSyrupWriter();
  DescHandoffGiveCodec.write(handoffGive, syrupWriter);
  return syrupWriter.getBytes();
};

/**
 * @param {HandoffReceive} handoffReceive
 * @returns {Uint8Array}
 */
export const serializeHandoffReceive = handoffReceive => {
  const syrupWriter = makeSyrupWriter();
  DescHandoffReceiveCodec.write(handoffReceive, syrupWriter);
  return syrupWriter.getBytes();
};

/**
 * @param {HandoffGiveSigEnvelope} signedGive
 * @param {bigint} handoffCount
 * @param {Uint8Array} sessionId
 * @param {OCapNPublicKey} pubKeyForExporter
 * @param {OCapNKeyPair} privKeyForGifter
 * @returns {HandoffReceiveSigEnvelope}
 */
export const makeWithdrawGiftDescriptor = (
  signedGive,
  handoffCount,
  sessionId,
  pubKeyForExporter,
  privKeyForGifter,
) => {
  /** @type {HandoffReceive} */
  const handoffReceive = {
    type: 'desc:handoff-receive',
    receivingSession: sessionId,
    // This should be removed from the spec
    receivingSide: pubKeyForExporter.bytes,
    handoffCount,
    signedGive,
  };
  const handoffReceiveBytes = serializeHandoffReceive(handoffReceive);
  const signature = privKeyForGifter.sign(handoffReceiveBytes);
  /** @type {HandoffReceiveSigEnvelope} */
  const signedEnvelope = {
    type: 'desc:sig-envelope',
    object: handoffReceive,
    signature,
  };
  return harden(signedEnvelope);
};

/**
 * @param {TableKit} tableKit
 * @returns {DescCodecs}
 */
export const makeDescCodecs = tableKit => {
  // when writing: import = local to us
  // when reading: import = remote to us
  const DescImportObject = makeOCapNRecordCodec(
    'DescImportObject',
    'desc:import-object',
    syrupReader => {
      const position = PositiveIntegerCodec.read(syrupReader);
      return tableKit.convertPositionToRemoteVal(position);
    },
    (value, syrupWriter) => {
      const position = tableKit.convertRemoteValToPosition(value);
      PositiveIntegerCodec.write(position, syrupWriter);
    },
  );

  const DescImportPromise = makeOCapNRecordCodec(
    'DescImportPromise',
    'desc:import-promise',
    syrupReader => {
      const position = PositiveIntegerCodec.read(syrupReader);
      return tableKit.provideRemotePromise(position);
    },
    (value, syrupWriter) => {
      const position = tableKit.convertRemotePromiseToPosition(value);
      PositiveIntegerCodec.write(position, syrupWriter);
    },
  );

  // when reading: export = local to us
  // when writing: export = remote to us
  const DescExport = makeOCapNRecordCodec(
    'DescExport',
    'desc:export',
    syrupReader => {
      const position = PositiveIntegerCodec.read(syrupReader);
      return tableKit.convertPositionToLocal(position);
    },
    (value, syrupWriter) => {
      const position = tableKit.convertRemoteValToPosition(value);
      PositiveIntegerCodec.write(position, syrupWriter);
    },
  );

  // when reading: answer = local to us
  // when writing: answer = remote to us
  const DescAnswer = makeOCapNRecordCodec(
    'DescAnswer',
    'desc:answer',
    syrupReader => {
      const position = PositiveIntegerCodec.read(syrupReader);
      return tableKit.provideLocalAnswer(position);
    },
    (value, syrupWriter) => {
      const position = tableKit.positionForRemoteAnswer(value);
      PositiveIntegerCodec.write(position, syrupWriter);
    },
  );

  // When reading: Handles both HandoffGive (returning the signed give) and
  // HandoffReceive (returning a promise for the gift).
  // When writing: Two possible types:
  //  SignedHandoffReceive, sends this directly.
  //  GrantDetails, deposits the gist and sends a SignedHandoffGive.
  const HandOffUnionCodec = makeOCapNRecordCodec(
    'HandOffUnionCodec',
    'desc:sig-envelope',
    syrupReader => {
      const signedEnvelope = DescSigEnvelopeReadCodec.readBody(syrupReader);
      const content = signedEnvelope.object;
      if (content.type === 'desc:handoff-give') {
        return tableKit.provideHandoff(signedEnvelope);
      } else if (content.type === 'desc:handoff-receive') {
        return signedEnvelope;
      }
      throw Error(`Unknown type ${content.type}`);
    },
    /**
     * @param {HandoffGiveDetails | HandoffReceiveSigEnvelope} value
     * @param {SyrupWriter} syrupWriter
     */
    (value, syrupWriter) => {
      // @ts-expect-error we're doing type checking
      if (value.type === 'desc:sig-envelope') {
        const signedHandoffReceive = /** @type {HandoffReceiveSigEnvelope} */ (
          value
        );
        DescHandoffReceiveSigEnvelopeCodec.writeBody(
          signedHandoffReceive,
          syrupWriter,
        );
        // @ts-expect-error we're doing type checking
      } else if (value.grantDetails !== undefined) {
        const handoffGiveDetails = /** @type {HandoffGiveDetails} */ (value);
        const { grantDetails } = handoffGiveDetails;
        if (grantDetails.type !== 'handoff') {
          throw Error('HandOffUnionCodec should only be used for handoffs');
        }
        // Write SignedHandoffGive
        const signedHandoffGive = tableKit.sendHandoff(handoffGiveDetails);
        DescHandoffGiveSigEnvelopeCodec.writeBody(
          signedHandoffGive,
          syrupWriter,
        );
      } else {
        throw Error(`Unknown Handoff object ${value}`);
      }
    },
  );

  const DeliverTargetReadCodec = makeRecordUnionCodec(
    'DeliverTargetReadCodec',
    {
      DescExport,
      DescAnswer,
    },
  );

  // DeliverTarget is more limited in scope than ReferenceCodec,
  // as it does not handle SturdyRefs or Handoffs.
  const DeliverTarget = makeCodec('DeliverTarget', {
    read(syrupReader) {
      const value = DeliverTargetReadCodec.read(syrupReader);
      const { isLocal, slot } = tableKit.getInfoForVal(value);
      if (!isLocal) {
        throw Error(`DeliverTarget must be local. Got slot ${slot}`);
      }
      return value;
    },
    write(value, syrupWriter) {
      const { type, isLocal, slot } = tableKit.getInfoForVal(value);
      if (isLocal) {
        throw Error(`DeliverTarget must be remote. Got slot ${slot}`);
      }
      if (type === 'question') {
        DescAnswer.write(value, syrupWriter);
      } else {
        DescExport.write(value, syrupWriter);
      }
    },
  });

  const ResolveMeDesc = makeCodec('ResolveMeDesc', {
    read(syrupReader) {
      syrupReader.enterRecord();
      syrupReader.readSelectorAsString();
      const position = PositiveIntegerCodec.read(syrupReader);
      syrupReader.exitRecord();
      const value = tableKit.provideRemoteResolver(position);
      const { isLocal, slot } = tableKit.getInfoForVal(value);
      if (isLocal) {
        throw new Error(`ResolveMeDesc must be remote. Got slot ${slot}`);
      }
      return value;
    },
    write(value, syrupWriter) {
      const { type, isLocal, slot } = tableKit.getInfoForVal(value);
      if (!isLocal) {
        throw new Error(`ResolveMeDesc must be local. Got slot ${slot}`);
      }
      if (type === 'object') {
        DescImportObject.write(value, syrupWriter);
      } else {
        DescImportPromise.write(value, syrupWriter);
      }
    },
  });

  const OCapNSturdyRef = makeOCapNRecordCodec(
    'OCapNSturdyRef',
    'ocapn-sturdyref',
    syrupReader => {
      const node = OCapNNode.read(syrupReader);
      const swissNum = syrupReader.readBytestring();
      const value = tableKit.provideSturdyRef(node, swissNum);
      return value;
    },
    /**
     * @param {HandoffGiveDetails} handoffGiveDetails
     * @param {SyrupWriter} syrupWriter
     */
    (handoffGiveDetails, syrupWriter) => {
      const { grantDetails } = handoffGiveDetails;
      const { location, swissNum } = grantDetails;
      if (swissNum === undefined) {
        throw Error('SwissNum is required for SturdyRefs');
      }
      OCapNNode.write(location, syrupWriter);
      syrupWriter.writeBytestring(swissNum);
    },
  );

  // ReferenceCodec is handles any kind of Reference (Promise or Target),
  // as well as SturdyRefs and Handoffs.
  // when reading: export = local to us
  // when writing: export = remote to us
  const ReferenceCodec = makeValueInfoRecordUnionCodec(
    'ReferenceCodec',
    tableKit,
    {
      DescExport,
      DescAnswer,
      DescImportObject,
      DescImportPromise,
      OCapNSturdyRef,
      HandOffUnionCodec,
    },
    {
      'local:object': DescImportObject,
      'local:promise': DescImportPromise,
      'local:question': DescAnswer,
      'remote:object': DescExport,
      'remote:promise': DescExport,
      'third-party:sturdy-ref': OCapNSturdyRef,
      'third-party:handoff': HandOffUnionCodec,
    },
  );

  return {
    DescImportObject,
    DescImportPromise,
    DescExport,
    DescAnswer,
    DeliverTarget,
    ReferenceCodec,
    ResolveMeDesc,
  };
};
