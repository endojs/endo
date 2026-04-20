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
