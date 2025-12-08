// @ts-check

/**
 * @import { HandoffGiveDetails, TableKit } from '../client/ocapn.js'
 * @import { SturdyRef } from '../client/sturdyrefs.js'
 * @import { SyrupCodec, SyrupRecordCodec, SyrupRecordUnionCodec } from '../syrup/codec.js'
 * @import { SyrupWriter } from '../syrup/encode.js'
 * @import { OcapnLocation, OcapnPublicKeyDescriptor, OcapnSignature } from './components.js'
 * @import { SessionId, PublicKeyId } from '../client/types.js'
 */

import { makeCodec, makeRecordUnionCodec } from '../syrup/codec.js';
import {
  makeOcapnRecordCodec,
  makeOcapnRecordCodecFromDefinition,
  makeValueInfoRecordUnionCodec,
} from './util.js';
import { NonNegativeIntegerCodec } from './subtypes.js';
import {
  OcapnPeerCodec,
  OcapnPublicKeyCodec,
  OcapnSignatureCodec,
} from './components.js';
import { makeSyrupWriter } from '../syrup/encode.js';
import { getSturdyRefDetails } from '../client/sturdyrefs.js';
import { uint8ArrayToImmutableArrayBuffer } from '../buffer-utils.js';

/**
 * @typedef {object} DescCodecs
 * @property {SyrupRecordCodec} DescImportObjectCodec
 * @property {SyrupRecordCodec} DescImportPromiseCodec
 * @property {SyrupRecordCodec} DescExportCodec
 * @property {SyrupRecordCodec} DescAnswerCodec
 * @property {SyrupCodec} ResolveMeDescCodec
 * @property {SyrupRecordUnionCodec} ReferenceCodec
 * @property {SyrupCodec} DeliverTargetCodec
 * @property {SyrupRecordCodec} OcapnSturdyRefCodec
 */

/**
 * @typedef {object} HandoffGive
 * @property {'desc:handoff-give'} type
 * @property {OcapnPublicKeyDescriptor} receiverKey
 * @property {OcapnLocation} exporterLocation
 * @property {SessionId} exporterSessionId
 * @property {PublicKeyId} gifterSideId
 * @property {ArrayBufferLike} giftId
 */

/**
 * @typedef {object} HandoffGiveSigEnvelope
 * @property {'desc:sig-envelope'} type
 * @property {HandoffGive} object
 * @property {OcapnSignature} signature
 */

/**
 * @typedef {object} HandoffReceive
 * @property {'desc:handoff-receive'} type
 * @property {SessionId} receivingSession
 * @property {PublicKeyId} receivingSide
 * @property {bigint} handoffCount
 * @property {HandoffGiveSigEnvelope} signedGive
 */

/**
 * @typedef {object} HandoffReceiveSigEnvelope
 * @property {'desc:sig-envelope'} type
 * @property {HandoffReceive} object
 * @property {OcapnSignature} signature
 */

const DescHandoffGiveCodec = makeOcapnRecordCodecFromDefinition(
  'DescHandoffGive',
  'desc:handoff-give',
  {
    // ReceiverKeyForGifter Public Key
    receiverKey: OcapnPublicKeyCodec,
    exporterLocation: OcapnPeerCodec,
    // Gifter-Exporter Session ID
    exporterSessionId: 'bytestring',
    // gifterKeyForExporter Public ID
    gifterSideId: 'bytestring',
    // Gifter-specified gift ID
    giftId: 'bytestring',
  },
);

const DescHandoffGiveSigEnvelopeCodec = makeOcapnRecordCodecFromDefinition(
  'DescHandoffGiveSigEnvelope',
  'desc:sig-envelope',
  {
    object: DescHandoffGiveCodec,
    signature: OcapnSignatureCodec,
  },
);

const DescHandoffReceiveCodec = makeOcapnRecordCodecFromDefinition(
  'DescHandoffReceive',
  'desc:handoff-receive',
  {
    receivingSession: 'bytestring',
    receivingSide: 'bytestring',
    handoffCount: NonNegativeIntegerCodec,
    signedGive: DescHandoffGiveSigEnvelopeCodec,
  },
);

const DescHandoffReceiveSigEnvelopeCodec = makeOcapnRecordCodecFromDefinition(
  'DescHandoffReceiveSigEnvelope',
  'desc:sig-envelope',
  {
    object: DescHandoffReceiveCodec,
    signature: OcapnSignatureCodec,
  },
);

const SignedEnvelopeContentUnionCodec = makeRecordUnionCodec(
  'SignedEnvelopeContentUnionCodec',
  {
    DescHandoffGiveCodec,
    DescHandoffReceiveCodec,
  },
);

const DescSigEnvelopeReadCodec = makeOcapnRecordCodecFromDefinition(
  'DescSigEnvelope',
  'desc:sig-envelope',
  {
    object: SignedEnvelopeContentUnionCodec,
    signature: OcapnSignatureCodec,
  },
);

/**
 * @param {TableKit} tableKit
 * @returns {DescCodecs}
 */
export const makeDescCodecs = tableKit => {
  // when writing: import = local to us
  // when reading: import = remote to us
  const DescImportObjectCodec = makeOcapnRecordCodec(
    'DescImportObject',
    'desc:import-object',
    syrupReader => {
      const position = NonNegativeIntegerCodec.read(syrupReader);
      return tableKit.convertPositionToRemoteVal(position);
    },
    (value, syrupWriter) => {
      const position = tableKit.convertRemoteValToPosition(value);
      NonNegativeIntegerCodec.write(position, syrupWriter);
    },
  );

  const DescImportPromiseCodec = makeOcapnRecordCodec(
    'DescImportPromise',
    'desc:import-promise',
    syrupReader => {
      const position = NonNegativeIntegerCodec.read(syrupReader);
      return tableKit.provideRemotePromise(position);
    },
    (value, syrupWriter) => {
      const position = tableKit.convertRemotePromiseToPosition(value);
      NonNegativeIntegerCodec.write(position, syrupWriter);
    },
  );

  // when reading: export = local to us
  // when writing: export = remote to us
  const DescExportCodec = makeOcapnRecordCodec(
    'DescExport',
    'desc:export',
    syrupReader => {
      const position = NonNegativeIntegerCodec.read(syrupReader);
      return tableKit.convertPositionToLocal(position);
    },
    (value, syrupWriter) => {
      const position = tableKit.convertRemoteValToPosition(value);
      NonNegativeIntegerCodec.write(position, syrupWriter);
    },
  );

  // when reading: answer = local to us
  // when writing: answer = remote to us
  const DescAnswerCodec = makeOcapnRecordCodec(
    'DescAnswer',
    'desc:answer',
    syrupReader => {
      const position = NonNegativeIntegerCodec.read(syrupReader);
      return tableKit.provideLocalAnswer(position);
    },
    (value, syrupWriter) => {
      const position = tableKit.positionForRemoteAnswer(value);
      NonNegativeIntegerCodec.write(position, syrupWriter);
    },
  );

  // When reading: Handles both HandoffGive (returning the signed give) and
  // HandoffReceive (returning a promise for the gift).
  // When writing: Two possible types:
  //  SignedHandoffReceive, sends this directly.
  //  GrantDetails, deposits the gist and sends a SignedHandoffGive.
  const HandOffUnionCodec = makeOcapnRecordCodec(
    'HandOffUnion',
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

  const DeliverTargetReadCodec = makeRecordUnionCodec('DeliverTargetRead', {
    DescExport: DescExportCodec,
    DescAnswer: DescAnswerCodec,
  });

  // DeliverTarget is more limited in scope than ReferenceCodec,
  // as it does not handle SturdyRefs or Handoffs.
  const DeliverTargetCodec = makeCodec('DeliverTarget', {
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
        DescAnswerCodec.write(value, syrupWriter);
      } else {
        DescExportCodec.write(value, syrupWriter);
      }
    },
  });

  const ResolveMeDescCodec = makeCodec('ResolveMeDesc', {
    read(syrupReader) {
      syrupReader.enterRecord();
      syrupReader.readSelectorAsString();
      const position = NonNegativeIntegerCodec.read(syrupReader);
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
        DescImportObjectCodec.write(value, syrupWriter);
      } else {
        DescImportPromiseCodec.write(value, syrupWriter);
      }
    },
  });

  const OcapnSturdyRefCodec = makeOcapnRecordCodec(
    'OcapnSturdyRef',
    'ocapn-sturdyref',
    syrupReader => {
      const node = OcapnPeerCodec.read(syrupReader);
      const swissNum = syrupReader.readBytestring();
      // @ts-expect-error - Branded type: SwissNum is ArrayBufferLike at runtime
      const value = tableKit.makeSturdyRef(node, swissNum);
      return value;
    },
    /**
     * @param {SturdyRef} sturdyRef
     * @param {SyrupWriter} syrupWriter
     */
    (sturdyRef, syrupWriter) => {
      const details = getSturdyRefDetails(sturdyRef);
      if (!details) {
        throw Error('Cannot serialize: not a valid SturdyRef object');
      }
      const { location, swissNum } = details;
      OcapnPeerCodec.write(location, syrupWriter);
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
      DescExportCodec,
      DescAnswerCodec,
      DescImportObjectCodec,
      DescImportPromiseCodec,
      OcapnSturdyRefCodec,
      HandOffUnionCodec,
    },
    {
      'local:object': DescImportObjectCodec,
      'local:promise': DescImportPromiseCodec,
      'local:question': DescAnswerCodec,
      'local:sturdyref': OcapnSturdyRefCodec,
      'remote:object': DescExportCodec,
      'remote:promise': DescExportCodec,
      'third-party:handoff': HandOffUnionCodec,
    },
  );

  return {
    DescImportObjectCodec,
    DescImportPromiseCodec,
    DescExportCodec,
    DescAnswerCodec,
    DeliverTargetCodec,
    ReferenceCodec,
    ResolveMeDescCodec,
    OcapnSturdyRefCodec,
  };
};

const makeSigEnvelope = (object, signature) => {
  return harden({
    type: 'desc:sig-envelope',
    object,
    signature,
  });
};

/**
 * @param {OcapnPublicKeyDescriptor} receiverPublicKeyDescriptor
 * @param {OcapnLocation} exporterLocation
 * @param {SessionId} exporterSessionId
 * @param {PublicKeyId} gifterSideId
 * @param {ArrayBufferLike} giftId
 * @returns {HandoffGive}
 */
export const makeHandoffGiveDescriptor = (
  receiverPublicKeyDescriptor,
  exporterLocation,
  exporterSessionId,
  gifterSideId,
  giftId,
) => {
  return harden({
    type: 'desc:handoff-give',
    receiverKey: receiverPublicKeyDescriptor,
    exporterLocation,
    exporterSessionId,
    gifterSideId,
    giftId,
  });
};

/**
 * @param {HandoffGive} handoffGive
 * @returns {ArrayBufferLike}
 */
export const serializeHandoffGive = handoffGive => {
  const syrupWriter = makeSyrupWriter();
  DescHandoffGiveCodec.write(handoffGive, syrupWriter);
  return uint8ArrayToImmutableArrayBuffer(syrupWriter.getBytes());
};

/**
 * @param {HandoffGive} handoffGive
 * @param {OcapnSignature} signature
 * @returns {HandoffGiveSigEnvelope}
 */
export const makeHandoffGiveSigEnvelope = (handoffGive, signature) => {
  // @ts-expect-error we're doing type checking
  return makeSigEnvelope(handoffGive, signature);
};

/**
 * @param {HandoffGiveSigEnvelope} signedGive
 * @param {bigint} handoffCount
 * @param {SessionId} sessionId
 * @param {PublicKeyId} receiverPeerId
 * @returns {HandoffReceive}
 */
export const makeHandoffReceiveDescriptor = (
  signedGive,
  handoffCount,
  sessionId,
  receiverPeerId,
) => {
  return harden({
    type: 'desc:handoff-receive',
    receivingSession: sessionId,
    receivingSide: receiverPeerId,
    handoffCount,
    signedGive,
  });
};

/**
 * @param {HandoffReceive} handoffReceive
 * @param {OcapnSignature} signature
 * @returns {HandoffReceiveSigEnvelope}
 */
export const makeHandoffReceiveSigEnvelope = (handoffReceive, signature) => {
  // @ts-expect-error we're doing type checking
  return makeSigEnvelope(handoffReceive, signature);
};

/**
 * @param {HandoffReceive} handoffReceive
 * @returns {ArrayBufferLike}
 */
export const serializeHandoffReceive = handoffReceive => {
  const syrupWriter = makeSyrupWriter();
  DescHandoffReceiveCodec.write(handoffReceive, syrupWriter);
  return uint8ArrayToImmutableArrayBuffer(syrupWriter.getBytes());
};
