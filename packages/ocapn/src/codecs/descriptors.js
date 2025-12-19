// @ts-check

/**
 * @import { ReferenceKit } from '../client/ref-kit.js'
 * @import { HandoffGiveDetails } from '../client/grant-tracker.js'
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
 * @property {SyrupCodec} RemotePromiseCodec
 * @property {SyrupRecordCodec} OcapnSturdyRefCodec
 * @property {SyrupRecordCodec} HandOffUnionCodec
 * @property {SyrupRecordCodec} DescSigEnvelopeReadCodec
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
 * @param {ReferenceKit} referenceKit
 * @returns {DescCodecs}
 */
export const makeDescCodecs = referenceKit => {
  const DescImportObjectCodec = makeOcapnRecordCodec(
    'DescImportObject',
    'desc:import-object',
    syrupReader => {
      // when reading: import = remote to us
      const position = NonNegativeIntegerCodec.read(syrupReader);
      return referenceKit.provideRemoteObjectValue(position);
    },
    (value, syrupWriter) => {
      // when writing: import = local to us
      const position = referenceKit.provideLocalObjectPosition(value);
      NonNegativeIntegerCodec.write(position, syrupWriter);
    },
  );

  const DescImportPromiseCodec = makeOcapnRecordCodec(
    'DescImportPromise',
    'desc:import-promise',
    syrupReader => {
      // when reading: import = remote to us
      const position = NonNegativeIntegerCodec.read(syrupReader);
      return referenceKit.provideRemotePromiseValue(position);
    },
    (value, syrupWriter) => {
      // when writing: import = local to us
      const position = referenceKit.provideLocalPromisePosition(value);
      NonNegativeIntegerCodec.write(position, syrupWriter);
    },
  );

  const DescExportCodec = makeOcapnRecordCodec(
    'DescExport',
    'desc:export',
    syrupReader => {
      // when reading: export = local to us
      const position = NonNegativeIntegerCodec.read(syrupReader);
      return referenceKit.provideLocalExportValue(position);
    },
    (value, syrupWriter) => {
      // when writing: export = remote to us
      const position = referenceKit.provideRemoteExportPosition(value);
      NonNegativeIntegerCodec.write(position, syrupWriter);
    },
  );

  const DescAnswerCodec = makeOcapnRecordCodec(
    'DescAnswer',
    'desc:answer',
    syrupReader => {
      // when reading: answer = local to us
      const position = NonNegativeIntegerCodec.read(syrupReader);
      return referenceKit.provideLocalAnswerValue(position);
    },
    (value, syrupWriter) => {
      // when writing: answer = remote to us
      const position = referenceKit.provideRemoteAnswerPosition(value);
      NonNegativeIntegerCodec.write(position, syrupWriter);
    },
  );

  // RemotePromiseCodec is used to constrain the target Reference to a promise
  const RemotePromiseCodec = makeValueInfoRecordUnionCodec(
    'RemotePromise',
    referenceKit,
    {
      DescAnswerCodec,
      DescExportCodec,
    },
    {
      'remote:promise': DescExportCodec,
      'remote:answer': DescAnswerCodec,
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
        return referenceKit.provideHandoff(signedEnvelope);
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
        const signedHandoffGive = referenceKit.sendHandoff(handoffGiveDetails);
        DescHandoffGiveSigEnvelopeCodec.writeBody(
          signedHandoffGive,
          syrupWriter,
        );
      } else {
        throw Error(`Unknown Handoff object ${value}`);
      }
    },
  );

  const DeliverTargetCodec = makeValueInfoRecordUnionCodec(
    'DeliverTarget',
    referenceKit,
    {
      DescExport: DescExportCodec,
      DescAnswer: DescAnswerCodec,
    },
    {
      'remote:object': DescExportCodec,
      'remote:promise': DescExportCodec,
      'remote:answer': DescAnswerCodec,
    },
  );

  const ResolveMeDescCodec = makeCodec('ResolveMeDesc', {
    read(syrupReader) {
      syrupReader.enterRecord();
      syrupReader.readSelectorAsString();
      const position = NonNegativeIntegerCodec.read(syrupReader);
      syrupReader.exitRecord();
      const value = referenceKit.provideRemoteResolverValue(position);
      const { isLocal, slot } = referenceKit.getInfoForVal(value);
      if (isLocal) {
        throw new Error(`ResolveMeDesc must be remote. Got slot ${slot}`);
      }
      return value;
    },
    write(value, syrupWriter) {
      const { type, isLocal, slot } = referenceKit.getInfoForVal(value);
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
      const value = referenceKit.makeSturdyRef(node, swissNum);
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
    referenceKit,
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
      'local:answer': DescImportPromiseCodec,
      'remote:object': DescExportCodec,
      'remote:promise': DescExportCodec,
      'remote:answer': DescAnswerCodec,
      'third-party:handoff': HandOffUnionCodec,
    },
  );

  return {
    DescImportObjectCodec,
    DescImportPromiseCodec,
    DescExportCodec,
    DescAnswerCodec,
    DeliverTargetCodec,
    RemotePromiseCodec,
    ReferenceCodec,
    ResolveMeDescCodec,
    OcapnSturdyRefCodec,
    HandOffUnionCodec,
    DescSigEnvelopeReadCodec,
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
