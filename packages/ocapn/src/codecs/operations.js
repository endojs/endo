// @ts-check

/**
 * @import { SyrupCodec } from '../syrup/codec.js'
 * @import { SyrupReader } from '../syrup/decode.js'
 * @import { SyrupWriter } from '../syrup/encode.js'
 * @import { DescCodecs } from './descriptors.js'
 * @import { PassableCodecs } from './passable.js'
 */

import {
  makeCodec,
  makeRecordUnionCodec,
  makeTypeHintUnionCodec,
} from '../syrup/codec.js';
import { makeOcapnRecordCodecFromDefinition } from './util.js';
import { NonNegativeIntegerCodec, FalseCodec } from './subtypes.js';
import {
  OcapnNodeCodec,
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
    location: OcapnNodeCodec,
    locationSignature: OcapnSignatureCodec,
  },
);

const OpAbortCodec = makeOcapnRecordCodecFromDefinition('OpAbort', 'op:abort', {
  reason: 'string',
});

const OpGcExportCodec = makeOcapnRecordCodecFromDefinition(
  'OpGcExport',
  'op:gc-export',
  {
    exportPosition: 'integer',
    wireDelta: 'integer',
  },
);

const OpGcAnswerCodec = makeOcapnRecordCodecFromDefinition(
  'OpGcAnswer',
  'op:gc-answer',
  {
    answerPosition: 'integer',
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
  const {
    DescImportPromiseCodec,
    DescAnswerCodec,
    DeliverTargetCodec,
    ResolveMeDescCodec,
  } = descCodecs;
  const { PassableCodec } = passableCodecs;

  const OpListenCodec = makeOcapnRecordCodecFromDefinition(
    'OpListen',
    'op:listen',
    {
      to: DeliverTargetCodec,
      resolveMeDesc: ResolveMeDescCodec,
      wantsPartial: 'boolean',
    },
  );

  /** @typedef {[...any[]]} OpDeliverArgs */

  // Used by the deliver and deliver-only operations
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

  const OpDeliverOnlyCodec = makeOcapnRecordCodecFromDefinition(
    'OpDeliverOnly',
    'op:deliver-only',
    {
      to: DeliverTargetCodec,
      args: OpDeliverArgsCodec,
    },
  );

  // The OpDeliver answer is either a positive integer or false
  const OpDeliverAnswerCodec = makeTypeHintUnionCodec(
    'OpDeliverAnswer',
    {
      'number-prefix': NonNegativeIntegerCodec,
      boolean: FalseCodec,
    },
    {
      bigint: NonNegativeIntegerCodec,
      boolean: FalseCodec,
    },
  );

  const OpDeliverCodec = makeOcapnRecordCodecFromDefinition(
    'OpDeliver',
    'op:deliver',
    {
      to: DeliverTargetCodec,
      args: OpDeliverArgsCodec,
      answerPosition: OpDeliverAnswerCodec,
      resolveMeDesc: ResolveMeDescCodec,
    },
  );

  const OcapnPromiseRefUnionCodec = makeRecordUnionCodec('OcapnPromiseRef', {
    DescAnswerCodec,
    DescImportPromiseCodec,
  });

  const OpPickCodec = makeOcapnRecordCodecFromDefinition('OpPick', 'op:pick', {
    promisePosition: OcapnPromiseRefUnionCodec,
    selectedValuePosition: 'integer',
    newAnswerPosition: 'integer',
  });

  const OcapnMessageUnionCodec = makeRecordUnionCodec('OcapnMessageUnion', {
    OpStartSessionCodec,
    OpDeliverOnlyCodec,
    OpDeliverCodec,
    OpPickCodec,
    OpAbortCodec,
    OpListenCodec,
    OpGcExportCodec,
    OpGcAnswerCodec,
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
