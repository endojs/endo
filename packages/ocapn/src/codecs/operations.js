// @ts-check

/** @typedef {import('../syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../syrup/encode.js').SyrupWriter} SyrupWriter */
/** @typedef {import('../syrup/codec.js').SyrupCodec} SyrupCodec */
/** @typedef {import('./descriptors.js').DescCodecs} DescCodecs */
/** @typedef {import('./passable.js').PassableCodecs} PassableCodecs */

import {
  makeCodec,
  makeRecordUnionCodec,
  makeTypeHintUnionCodec,
} from '../syrup/codec.js';
import { makeOCapNRecordCodecFromDefinition } from './util.js';
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

const OpStartSessionCodec = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageStartSession',
  'op:start-session',
  {
    captpVersion: 'string',
    sessionPublicKey: OcapnPublicKeyCodec,
    location: OcapnNodeCodec,
    locationSignature: OcapnSignatureCodec,
  },
);

const OpAbortCodec = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageAbort',
  'op:abort',
  {
    reason: 'string',
  },
);

const OpGcExportCodec = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageGcExport',
  'op:gc-export',
  {
    exportPosition: 'integer',
    wireDelta: 'integer',
  },
);

const OpGcAnswerCodec = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageGcAnswer',
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
 * @property {SyrupCodec} OCapNMessageUnionCodec
 * @property {(message: any) => Uint8Array} writeOCapNMessage
 * @property {(syrupReader: SyrupReader) => any} readOCapNMessage
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

  const OpListenCodec = makeOCapNRecordCodecFromDefinition(
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

  const OpDeliverOnlyCodec = makeOCapNRecordCodecFromDefinition(
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

  const OpDeliverCodec = makeOCapNRecordCodecFromDefinition(
    'OpDeliver',
    'op:deliver',
    {
      to: DeliverTargetCodec,
      args: OpDeliverArgsCodec,
      answerPosition: OpDeliverAnswerCodec,
      resolveMeDesc: ResolveMeDescCodec,
    },
  );

  const OCapNPromiseRefUnionCodec = makeRecordUnionCodec('OCapNPromiseRef', {
    DescAnswerCodec,
    DescImportPromiseCodec,
  });

  const OpPickCodec = makeOCapNRecordCodecFromDefinition('OpPick', 'op:pick', {
    promisePosition: OCapNPromiseRefUnionCodec,
    selectedValuePosition: 'integer',
    newAnswerPosition: 'integer',
  });

  const OCapNMessageUnionCodec = makeRecordUnionCodec('OcapnMessageUnion', {
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
    OCapNMessageUnionCodec,
    readOCapNMessage,
    writeOCapNMessage,
  };
};
