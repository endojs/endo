// @ts-check

/**
 * @import { SyrupCodec } from '../syrup/codec.js'
 * @import { OcapnReader, OcapnWriter, OcapnCodec } from '../codec-interface.js'
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
  NonNegativeIntegerListCodec,
  FalseCodec,
  PositiveIntegerCodec,
  PositiveIntegerListCodec,
  makeOcapnFalseForOptionalCodec,
} from './subtypes.js';
import {
  OcapnPeerCodec,
  OcapnPublicKeyCodec,
  OcapnSignatureCodec,
} from './components.js';

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

// Spritely Goblins (and the OCapN draft spec since PR #29) batch GC
// hints into list-payload `op:gc-exports` / `op:gc-answers`. The
// singular forms our refactor originally emitted are not accepted by
// other peers; keep the names plural and the payloads list-shaped.
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
 * @param {import('../codec-interface.js').OcapnReader} reader
 * @returns {any}
 */
export const readOcapnHandshakeMessage = reader => {
  return OcapnPreSessionOperationsCodecs.read(reader);
};

/**
 * @param {any} message
 * @param {OcapnCodec} codec
 * @returns {Uint8Array}
 */
export const writeOcapnHandshakeMessage = (message, codec) => {
  const writer = codec.makeWriter();
  OcapnPreSessionOperationsCodecs.write(message, writer);
  return writer.getBytes();
};

/**
 * @typedef {object} OcapnOperationsCodecs
 * @property {SyrupCodec} OcapnMessageUnionCodec
 * @property {(message: any) => Uint8Array} writeOcapnMessage
 * @property {(reader: OcapnReader) => any} readOcapnMessage
 */

/**
 * @param {DescCodecs} descCodecs
 * @param {PassableCodecs} passableCodecs
 * @param {OcapnCodec} codec
 * @returns {OcapnOperationsCodecs}
 */
export const makeOcapnOperationsCodecs = (
  descCodecs,
  passableCodecs,
  codec,
) => {
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
     * @param {OcapnReader} reader
     * @returns {OpDeliverArgs}
     */
    read: reader => {
      reader.enterList();
      /** @type {OpDeliverArgs} */
      const result = [];
      while (!reader.peekListEnd()) {
        result.push(PassableCodec.read(reader));
      }
      reader.exitList();
      return result;
    },
    /**
     * @param {OpDeliverArgs} args
     * @param {OcapnWriter} writer
     */
    write: (args, writer) => {
      writer.enterList(args.length);
      for (const arg of args) {
        PassableCodec.write(arg, writer);
      }
      writer.exitList();
    },
  });

  // OCapN folded `op:deliver-only` into `op:deliver` (with both
  // `answerPosition` and `resolveMeDesc` set to `false` for the
  // fire-and-forget case). Spritely Goblins follows the same shape,
  // so we no longer accept or emit a separate `op:deliver-only`.

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

  // OCapN allows `op:deliver` to carry `false` for `resolveMeDesc`
  // (no resolver to fulfill) — Spritely Goblins emits this for
  // fire-and-forget calls that nonetheless use the `op:deliver`
  // framing. Wrap the descriptor codec so the wire `false` byte
  // doesn't force the reader into the record-start path.
  const OptionalResolveMeDescCodec = makeOcapnFalseForOptionalCodec(
    'OptionalResolveMeDesc',
    ResolveMeDescCodec,
  );

  const OpDeliverCodec = makeOcapnRecordCodecFromDefinition(
    'OpDeliver',
    'op:deliver',
    {
      to: DeliverTargetCodec,
      args: OpDeliverArgsCodec,
      answerPosition: OpDeliverAnswerCodec,
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
   * @param {import('../codec-interface.js').OcapnReader} reader
   * @returns {any}
   */
  const readOcapnMessage = reader => {
    return OcapnMessageUnionCodec.read(reader);
  };

  /**
   * @param {any} message
   * @returns {Uint8Array}
   */
  const writeOcapnMessage = message => {
    const writer = codec.makeWriter();
    OcapnMessageUnionCodec.write(message, writer);
    return writer.getBytes();
  };

  return {
    OcapnMessageUnionCodec,
    readOcapnMessage,
    writeOcapnMessage,
  };
};
