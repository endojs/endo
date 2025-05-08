// @ts-check

/** @typedef {import('../syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../syrup/encode.js').SyrupWriter} SyrupWriter */

import {
  makeRecordUnionCodec,
  makeTypeHintUnionCodec,
} from '../syrup/codec.js';
import { makeOCapNRecordCodecFromDefinition } from './util.js';
import { PositiveIntegerCodec, FalseCodec } from './subtypes.js';
import { OCapNNode, OCapNPublicKey, OCapNSignature } from './components.js';
import { makeSyrupWriter } from '../syrup/encode.js';

const { freeze } = Object;

/*
 * These are OCapN Operations, they are messages that are sent between OCapN Nodes
 */

const OpStartSession = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageStartSessionCodec',
  'op:start-session',
  {
    captpVersion: 'string',
    sessionPublicKey: OCapNPublicKey,
    location: OCapNNode,
    locationSignature: OCapNSignature,
  },
);

const OpAbort = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageAbortCodec',
  'op:abort',
  {
    reason: 'string',
  },
);

const OpGcExport = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageGcExportCodec',
  'op:gc-export',
  {
    exportPosition: 'integer',
    wireDelta: 'integer',
  },
);

const OpGcAnswer = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageGcAnswerCodec',
  'op:gc-answer',
  {
    answerPosition: 'integer',
  },
);

export const OcapnUninitializedOperationsCodecs = makeRecordUnionCodec(
  'OcapnUninitializedOperationsCodecs',
  {
    OpStartSession,
    OpAbort,
  },
);

/**
 * @param {SyrupReader} syrupReader
 * @returns {any}
 */
export const readOcapnHandshakeMessage = syrupReader => {
  return OcapnUninitializedOperationsCodecs.read(syrupReader);
};

/**
 * @param {any} message
 * @returns {Uint8Array}
 */
export const writeOcapnHandshakeMessage = message => {
  const syrupWriter = makeSyrupWriter();
  OcapnUninitializedOperationsCodecs.write(message, syrupWriter);
  return syrupWriter.getBytes();
};

export const makeOcapnOperationsCodecs = (descCodecs, passableCodecs) => {
  const { DescImportPromise, DescAnswer, DeliverTarget, ResolveMeDesc } =
    descCodecs;
  const { PassableCodec } = passableCodecs;

  const OpListen = makeOCapNRecordCodecFromDefinition(
    'OCapNMessageListenCodec',
    'op:listen',
    {
      to: DeliverTarget,
      resolveMeDesc: ResolveMeDesc,
      wantsPartial: 'boolean',
    },
  );

  /** @typedef {[...any[]]} OpDeliverArgs */

  // Used by the deliver and deliver-only operations
  // First arg is method name, rest are Passables
  const OpDeliverArgsCodec = freeze({
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

  const OpDeliverOnly = makeOCapNRecordCodecFromDefinition(
    'OCapNMessageDeliverOnlyCodec',
    'op:deliver-only',
    {
      to: DeliverTarget,
      args: OpDeliverArgsCodec,
    },
  );

  // The OpDeliver answer is either a positive integer or false
  const OpDeliverAnswerCodec = makeTypeHintUnionCodec(
    'OpDeliverAnswerCodec',
    {
      'number-prefix': PositiveIntegerCodec,
      boolean: FalseCodec,
    },
    {
      bigint: PositiveIntegerCodec,
      boolean: FalseCodec,
    },
  );

  const OpDeliver = makeOCapNRecordCodecFromDefinition(
    'OCapNMessageDeliverCodec',
    'op:deliver',
    {
      to: DeliverTarget,
      args: OpDeliverArgsCodec,
      answerPosition: OpDeliverAnswerCodec,
      resolveMeDesc: ResolveMeDesc,
    },
  );

  const OCapNPromiseRefCodec = makeRecordUnionCodec('OCapNPromiseRefCodec', {
    DescAnswer,
    DescImportPromise,
  });

  const OpPick = makeOCapNRecordCodecFromDefinition(
    'OCapNMessagePickCodec',
    'op:pick',
    {
      promisePosition: OCapNPromiseRefCodec,
      selectedValuePosition: 'integer',
      newAnswerPosition: 'integer',
    },
  );

  const OCapNMessageUnionCodec = makeRecordUnionCodec(
    'OCapNMessageUnionCodec',
    {
      OpStartSession,
      OpDeliverOnly,
      OpDeliver,
      OpPick,
      OpAbort,
      OpListen,
      OpGcExport,
      OpGcAnswer,
    },
  );

  /**
   * @param {SyrupReader} syrupReader
   * @returns {any}
   */
  const readOCapNMessage = syrupReader => {
    return OCapNMessageUnionCodec.read(syrupReader);
  };

  /**
   * @param {any} message
   * @returns {Uint8Array}
   */
  const writeOCapNMessage = message => {
    const syrupWriter = makeSyrupWriter();
    OCapNMessageUnionCodec.write(message, syrupWriter);
    return syrupWriter.getBytes();
  };

  return {
    OCapNMessageCodec: OCapNMessageUnionCodec,
    readOCapNMessage,
    writeOCapNMessage,
  };
};
