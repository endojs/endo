// @ts-check

/**
 * @import { GrantDetails, HandoffGiveDetails, TableKit } from '../client/ocapn.js'
 * @import { SyrupCodec, SyrupRecordCodec, SyrupRecordUnionCodec } from '../syrup/codec.js'
 * @import { SyrupReader } from '../syrup/decode.js'
 * @import { SyrupWriter } from '../syrup/encode.js'
 * @import { OcapnLocation, OcapnPublicKeyData, OcapnSignature } from './components.js'
 * @import { OcapnPublicKey, OcapnKeyPair } from '../cryptography.js'
 */

import { makeCodec, makeRecordUnionCodec } from '../syrup/codec.js';
import {
  makeOcapnRecordCodec,
  makeOcapnRecordCodecFromDefinition,
  makeValueInfoRecordUnionCodec,
} from './util.js';
import { NonNegativeIntegerCodec } from './subtypes.js';
import {
  OcapnNodeCodec,
  OcapnPublicKeyCodec,
  OcapnSignatureCodec,
} from './components.js';
import { makeSyrupWriter } from '../syrup/encode.js';

/**
 * @typedef {object} DescCodecs
 * @property {SyrupRecordCodec} DescImportObjectCodec
 * @property {SyrupRecordCodec} DescImportPromiseCodec
 * @property {SyrupRecordCodec} DescExportCodec
 * @property {SyrupRecordCodec} DescAnswerCodec
 * @property {SyrupCodec} ResolveMeDescCodec
 * @property {SyrupRecordUnionCodec} ReferenceCodec
 * @property {SyrupCodec} DeliverTargetCodec
 */

/**
 * @typedef {object} HandoffGive
 * @property {'desc:handoff-give'} type
 * @property {OcapnPublicKeyData} receiverKey
 * @property {OcapnLocation} exporterLocation
 * @property {Uint8Array} exporterSessionId
 * @property {Uint8Array} gifterSideId
 * @property {Uint8Array} giftId
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
 * @property {Uint8Array} receivingSession
 * @property {Uint8Array} receivingSide
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
    exporterLocation: OcapnNodeCodec,
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
 * @param {OcapnPublicKey} pubKeyForExporter
 * @param {OcapnKeyPair} privKeyForGifter
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
      const node = OcapnNodeCodec.read(syrupReader);
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
      OcapnNodeCodec.write(location, syrupWriter);
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
      'remote:object': DescExportCodec,
      'remote:promise': DescExportCodec,
      'third-party:sturdy-ref': OcapnSturdyRefCodec,
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
  };
};
