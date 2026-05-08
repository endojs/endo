// @ts-check

/**
 * @import { SyrupCodec } from '../syrup/codec.js'
 * @import { SyrupReader } from '../syrup/decode.js'
 * @import { SyrupWriter } from '../syrup/encode.js'
 * @import { DescCodecs } from './descriptors.js'
 * @import { PassableCodecs } from './passable.js'
 */

import { makeCodec, makeRecordUnionCodec } from '../syrup/codec.js';
import { makeOcapnRecordCodecFromDefinition } from './util.js';
import {
  NonNegativeIntegerCodec,
  NonNegativeIntegerListCodec,
  PositiveIntegerCodec,
  PositiveIntegerListCodec,
  makeOcapnFalseForOptionalCodec,
} from './subtypes.js';
import {
  OcapnPeerCodec,
  OcapnPublicKeyCodec,
  OcapnSignatureCodec,
} from './components.js';
import { makeSyrupWriter } from '../syrup/encode.js';

/*
 * These are OCapN Operations, they are messages that are sent between OCapN Nodes
 */

const OpStartSessionCodec = makeOcapnRecordCodecFromDefinition(
  'OpStartSession',
  'op:start-session',
  {
    captpVersion: 'string',
    sessionPublicKey: OcapnPublicKeyCodec,
    location: OcapnPeerCodec,
    locationSignature: OcapnSignatureCodec,
  },
);

const OpAbortCodec = makeOcapnRecordCodecFromDefinition('OpAbort', 'op:abort', {
  reason: 'string',
});

const OpGcExportsCodec = makeOcapnRecordCodecFromDefinition(
  'OpGcExports',
  'op:gc-exports',
  {
    exportPositions: NonNegativeIntegerListCodec,
    wireDeltas: PositiveIntegerListCodec,
  },
);

const OpGcAnswersCodec = makeOcapnRecordCodecFromDefinition(
  'OpGcAnswers',
  'op:gc-answers',
  {
    answerPositions: NonNegativeIntegerListCodec,
  },
);

export const OcapnPreSessionOperationsCodecs = makeRecordUnionCodec(
  'OcapnPreSessionOperations',
  {
    OpStartSession: OpStartSessionCodec,
    OpAbort: OpAbortCodec,
  },
);

/**
 * @param {SyrupReader} syrupReader
 * @returns {any}
 */
export const readOcapnHandshakeMessage = syrupReader => {
  return OcapnPreSessionOperationsCodecs.read(syrupReader);
};

/**
 * @param {any} message
 * @returns {Uint8Array}
 */
export const writeOcapnHandshakeMessage = message => {
  const syrupWriter = makeSyrupWriter();
  OcapnPreSessionOperationsCodecs.write(message, syrupWriter);
  return syrupWriter.getBytes();
};

/**
 * @typedef {object} OcapnOperationsCodecs
 * @property {SyrupCodec} OcapnMessageUnionCodec
 * @property {(message: any) => Uint8Array} writeOcapnMessage
 * @property {(syrupReader: SyrupReader) => any} readOcapnMessage
 */

/**
 * @param {DescCodecs} descCodecs
 * @param {PassableCodecs} passableCodecs
 * @returns {OcapnOperationsCodecs}
 */
export const makeOcapnOperationsCodecs = (descCodecs, passableCodecs) => {
  const { DeliverTargetCodec, RemotePromiseCodec, ResolveMeDescCodec } =
    descCodecs;
  const { PassableCodec } = passableCodecs;

  /** `false` or a local resolver import for op:deliver */
  const OptionalResolveMeDescCodec = makeOcapnFalseForOptionalCodec(
    'OptionalResolveMeDesc',
    ResolveMeDescCodec,
  );

  const OpListenCodec = makeOcapnRecordCodecFromDefinition(
    'OpListen',
    'op:listen',
    {
      to: RemotePromiseCodec,
      resolveMeDesc: ResolveMeDescCodec,
      wantsPartial: 'boolean',
    },
  );

  /** @typedef {[...any[]]} OpDeliverArgs */

  // Used by op:deliver
  // First arg is method name, rest are Passables
  const OpDeliverArgsCodec = makeCodec('OpDeliverArgs', {
    /**
     * @param {SyrupReader} syrupReader
     * @returns {OpDeliverArgs}
     */
    read: syrupReader => {
      syrupReader.enterList();
      /** @type {OpDeliverArgs} */
      const result = [];
      while (!syrupReader.peekListEnd()) {
        result.push(PassableCodec.read(syrupReader));
      }
      syrupReader.exitList();
      return result;
    },
    /**
     * @param {OpDeliverArgs} args
     * @param {SyrupWriter} syrupWriter
     */
    write: (args, syrupWriter) => {
      syrupWriter.enterList();
      for (const arg of args) {
        PassableCodec.write(arg, syrupWriter);
      }
      syrupWriter.exitList();
    },
  });

  /** `false` or a non-negative integer answer slot for op:deliver */
  const OptionalAnswerPositionCodec = makeOcapnFalseForOptionalCodec(
    'OptionalAnswerPosition',
    NonNegativeIntegerCodec,
  );

  const OpDeliverCodec = makeOcapnRecordCodecFromDefinition(
    'OpDeliver',
    'op:deliver',
    {
      to: DeliverTargetCodec,
      args: OpDeliverArgsCodec,
      answerPosition: OptionalAnswerPositionCodec,
      resolveMeDesc: OptionalResolveMeDescCodec,
    },
  );

  const OpGetCodec = makeOcapnRecordCodecFromDefinition('OpGet', 'op:get', {
    receiverDesc: RemotePromiseCodec,
    fieldName: 'string',
    answerPosition: PositiveIntegerCodec,
  });

  const OpIndexCodec = makeOcapnRecordCodecFromDefinition(
    'OpIndex',
    'op:index',
    {
      receiverDesc: RemotePromiseCodec,
      index: NonNegativeIntegerCodec,
      answerPosition: PositiveIntegerCodec,
    },
  );

  const OpUntagCodec = makeOcapnRecordCodecFromDefinition(
    'OpUntag',
    'op:untag',
    {
      receiverDesc: RemotePromiseCodec,
      tag: 'string',
      answerPosition: PositiveIntegerCodec,
    },
  );

  // Disembargo (capnproto-style) preserves per-reference FIFO order across
  // promise shortening.
  //
  // Level 1 (loopback) handles two-party shortening: a remote promise resolves
  // to a sender-hosted capability. The sender allocates an embargoId and emits
  // sender-loopback addressed to the original promise; the receiver echoes
  // receiver-loopback once all already-queued pipelined messages on that
  // target have been processed.
  //
  // Level 3 (accept/provide) handles three-party handoff shortening: a remote
  // promise resolves to a third-party reference (delivered as a HandoffGive).
  // The receiver of the gift sends `accept` to the gifter on the same wire as
  // its earlier pipelined messages; the gifter forwards as `provide` on its
  // wire with the exporter, which travels behind any pipelined messages the
  // gifter forwarded to the exporter on that wire. The exporter holds back
  // its `withdraw-gift` response until the `provide` message arrives, so by
  // the time the receiver gets the cap, every earlier pipelined message has
  // already been applied to it.
  const OpDisembargoSenderLoopbackCodec = makeOcapnRecordCodecFromDefinition(
    'OpDisembargoSenderLoopback',
    'sender-loopback',
    {
      target: RemotePromiseCodec,
      embargoId: NonNegativeIntegerCodec,
    },
  );

  const OpDisembargoReceiverLoopbackCodec = makeOcapnRecordCodecFromDefinition(
    'OpDisembargoReceiverLoopback',
    'receiver-loopback',
    {
      embargoId: NonNegativeIntegerCodec,
    },
  );

  // The receiver (A) names the handoff by (gifterExporterSessionId, giftId)
  // both pieces are also carried in the HandoffGive A originally received,
  // and they uniquely identify the gift in the exporter's gift table.
  const OpDisembargoAcceptCodec = makeOcapnRecordCodecFromDefinition(
    'OpDisembargoAccept',
    'accept',
    {
      gifterExporterSessionId: 'bytestring',
      giftId: 'bytestring',
    },
  );

  const OpDisembargoProvideCodec = makeOcapnRecordCodecFromDefinition(
    'OpDisembargoProvide',
    'provide',
    {
      gifterExporterSessionId: 'bytestring',
      giftId: 'bytestring',
    },
  );

  const OpDisembargoContextCodec = makeRecordUnionCodec(
    'OpDisembargoContext',
    {
      OpDisembargoSenderLoopbackCodec,
      OpDisembargoReceiverLoopbackCodec,
      OpDisembargoAcceptCodec,
      OpDisembargoProvideCodec,
    },
  );

  const OpDisembargoCodec = makeOcapnRecordCodecFromDefinition(
    'OpDisembargo',
    'op:disembargo',
    {
      context: OpDisembargoContextCodec,
    },
  );

  const OcapnMessageUnionCodec = makeRecordUnionCodec('OcapnMessageUnion', {
    OpStartSessionCodec,
    OpDeliverCodec,
    OpGetCodec,
    OpIndexCodec,
    OpUntagCodec,
    OpAbortCodec,
    OpListenCodec,
    OpGcExportsCodec,
    OpGcAnswersCodec,
    OpDisembargoCodec,
  });

  /**
   * @param {SyrupReader} syrupReader
   * @returns {any}
   */
  const readOcapnMessage = syrupReader => {
    return OcapnMessageUnionCodec.read(syrupReader);
  };

  /**
   * @param {any} message
   * @returns {Uint8Array}
   */
  const writeOcapnMessage = message => {
    const syrupWriter = makeSyrupWriter();
    OcapnMessageUnionCodec.write(message, syrupWriter);
    return syrupWriter.getBytes();
  };

  return {
    OcapnMessageUnionCodec,
    readOcapnMessage,
    writeOcapnMessage,
  };
};
