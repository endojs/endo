// @ts-check

/** @typedef {import('../syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../syrup/encode.js').SyrupWriter} SyrupWriter */
/** @typedef {import('../syrup/codec.js').SyrupCodec} SyrupCodec */
/** @typedef {import('../syrup/codec.js').SyrupRecordCodec} SyrupRecordCodec */
/** @typedef {import('../client/ocapn.js').TableKit} TableKit */

import { makeCodec, makeRecordUnionCodec } from '../syrup/codec.js';
import {
  makeOCapNRecordCodec,
  makeOCapNRecordCodecFromDefinition,
} from './util.js';
import { PositiveIntegerCodec } from './subtypes.js';
import { OCapNNode, OCapNPublicKey, OCapNSignature } from './components.js';

export const swissnumDecoder = new TextDecoder('ascii', { fatal: true });

/**
 * @typedef {object} DescCodecs
 * @property {SyrupRecordCodec} DescImportObject
 * @property {SyrupRecordCodec} DescImportPromise
 * @property {SyrupRecordCodec} DescExport
 * @property {SyrupRecordCodec} DescAnswer
 * @property {SyrupRecordCodec} DescHandoffGive
 * @property {SyrupRecordCodec} DescSigGiveEnvelope
 * @property {SyrupRecordCodec} DescHandoffReceive
 * @property {SyrupRecordCodec} DescSigReceiveEnvelope
 * @property {SyrupRecordCodec} OCapNSturdyRef
 * @property {SyrupCodec} ResolveMeDesc
 * @property {SyrupCodec} ReferenceCodec
 * @property {SyrupCodec} DeliverTarget
 */

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

  const DescHandoffGive = makeOCapNRecordCodecFromDefinition(
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

  const DescSigGiveEnvelope = makeOCapNRecordCodecFromDefinition(
    'DescSigGiveEnvelope',
    'desc:sig-envelope',
    {
      object: DescHandoffGive,
      signature: OCapNSignature,
    },
  );

  const DescHandoffReceive = makeOCapNRecordCodecFromDefinition(
    'DescHandoffReceive',
    'desc:handoff-receive',
    {
      receivingSession: 'bytestring',
      receivingSide: 'bytestring',
      handoffCount: PositiveIntegerCodec,
      signedGive: DescSigGiveEnvelope,
    },
  );

  const DescSigReceiveEnvelope = makeOCapNRecordCodecFromDefinition(
    'DescSigReceiveEnvelope',
    'desc:sig-envelope',
    {
      object: DescHandoffReceive,
      signature: OCapNSignature,
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
    (grantDetails, syrupWriter) => {
      const { location, swissNum } = grantDetails;
      OCapNNode.write(location, syrupWriter);
      syrupWriter.writeBytestring(swissNum);
    },
  );

  const ReferenceCodecReadCodec = makeRecordUnionCodec(
    'ReferenceCodecReadCodec',
    {
      DescExport,
      DescAnswer,
      DescImportObject,
      DescImportPromise,
      OCapNSturdyRef,
    },
  );

  // ReferenceCodec is handles any kind of Reference (Promise or Target),
  // as well as SturdyRefs and Handoffs.
  // when reading: export = local to us
  // when writing: export = remote to us
  const ReferenceCodec = makeCodec('ReferenceCodec', {
    read(syrupReader) {
      return ReferenceCodecReadCodec.read(syrupReader);
    },
    write(value, syrupWriter) {
      const { type, isLocal, isThirdParty, grantDetails } =
        tableKit.getInfoForVal(value);
      if (isLocal) {
        if (type === 'object') {
          DescImportObject.write(value, syrupWriter);
        } else if (type === 'promise') {
          DescImportPromise.write(value, syrupWriter);
        } else if (type === 'question') {
          throw Error('Codec for "import-answer" not implemented');
        } else {
          throw Error(`Unknown type ${type}`);
        }
      } else if (isThirdParty) {
        if (!grantDetails) {
          throw Error('Third party references must have grant details');
        }
        const { type: grantType } = grantDetails;
        // Remote, third party handoff
        if (grantType === 'sturdy-ref') {
          OCapNSturdyRef.write(grantDetails, syrupWriter);
        } else if (grantType === 'handoff') {
          throw Error('Handoff not implemented');
        } else {
          throw Error(`Unknown grant type ${grantType}`);
        }
      } else {
        // Remote, this session is the grantee
        // eslint-disable-next-line no-lonely-if
        if (type === 'object' || type === 'promise') {
          DescExport.write(value, syrupWriter);
        } else if (type === 'question') {
          DescAnswer.write(value, syrupWriter);
        } else {
          throw Error(`Unknown type ${type}`);
        }
      }
    },
  });

  return {
    DescImportObject,
    DescImportPromise,
    DescExport,
    DescAnswer,
    DeliverTarget,
    DescHandoffGive,
    DescSigGiveEnvelope,
    DescHandoffReceive,
    DescSigReceiveEnvelope,
    ResolveMeDesc,
    ReferenceCodec,
    OCapNSturdyRef,
  };
};
