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
import {
  NonNegativeIntegerCodec,
  FalseCodec,
  PositiveIntegerCodec,
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

/** @type {import('../syrup/codec.js').SyrupCodec} */
const NonNegativeIntegerListCodec = makeCodec('NonNegativeIntegerList', {
  /**
   * @param {import('../syrup/decode.js').SyrupReader} syrupReader
   */
  read: syrupReader => {
    syrupReader.enterList();
    /** @type {bigint[]} */
    const result = [];
    while (!syrupReader.peekListEnd()) {
      result.push(NonNegativeIntegerCodec.read(syrupReader));
    }
    syrupReader.exitList();
    return result;
  },
  /**
   * @param {bigint[]} positions
   * @param {import('../syrup/encode.js').SyrupWriter} syrupWriter
   */
  write: (positions, syrupWriter) => {
    syrupWriter.enterList();
    for (const pos of positions) {
      NonNegativeIntegerCodec.write(pos, syrupWriter);
    }
    syrupWriter.exitList();
  },
});

/** @type {import('../syrup/codec.js').SyrupCodec} */
const PositiveIntegerListCodec = makeCodec('PositiveIntegerList', {
  /**
   * @param {import('../syrup/decode.js').SyrupReader} syrupReader
   */
  read: syrupReader => {
    syrupReader.enterList();
    /** @type {bigint[]} */
    const result = [];
    while (!syrupReader.peekListEnd()) {
      result.push(PositiveIntegerCodec.read(syrupReader));
    }
    syrupReader.exitList();
    return result;
  },
  /**
   * @param {bigint[]} deltas
   * @param {import('../syrup/encode.js').SyrupWriter} syrupWriter
   */
  write: (deltas, syrupWriter) => {
    syrupWriter.enterList();
    for (const d of deltas) {
      PositiveIntegerCodec.write(d, syrupWriter);
    }
    syrupWriter.exitList();
  },
});

const OpGcExportCodec = makeOcapnRecordCodecFromDefinition(
  'OpGcExport',
  'op:gc-export',
  {
    exportPositions: NonNegativeIntegerListCodec,
    wireDeltas: PositiveIntegerListCodec,
  },
);

const OpGcAnswerCodec = makeOcapnRecordCodecFromDefinition(
  'OpGcAnswer',
  'op:gc-answer',
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
    OpDeliverOnlyCodec,
    OpDeliverCodec,
    OpGetCodec,
    OpIndexCodec,
    OpUntagCodec,
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
