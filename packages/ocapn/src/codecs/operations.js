// @ts-check

import {
  makeRecordUnionCodec,
  makeTypeHintUnionCodec,
} from '../syrup/codec.js';
import { makeOCapNRecordCodecFromDefinition } from './util.js';
import { PositiveIntegerCodec, FalseCodec } from './subtypes.js';
import { OCapNNode, OCapNPublicKey, OCapNSignature } from './components.js';
import { OCapNPassableUnionCodec } from './passable.js';
import {
  DescImportObject,
  DescImportPromise,
  DescExport,
  DescAnswer,
} from './descriptors.js';

const { freeze } = Object;

/** @typedef {import('../syrup/decode.js').SyrupReader} SyrupReader */
/** @typedef {import('../syrup/encode.js').SyrupWriter} SyrupWriter */

/*
 * These are OCapN Operations, they are messages that are sent between OCapN Nodes
 */

const OpStartSession = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageStartSessionCodec',
  'op:start-session',
  [
    ['captpVersion', 'string'],
    ['sessionPublicKey', OCapNPublicKey],
    ['location', OCapNNode],
    ['locationSignature', OCapNSignature],
  ],
);

const OCapNResolveMeDescCodec = makeRecordUnionCodec(
  'OCapNResolveMeDescCodec',
  {
    DescImportObject,
    DescImportPromise,
  },
);

const OpListen = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageListenCodec',
  'op:listen',
  [
    ['to', DescExport],
    ['resolveMeDesc', OCapNResolveMeDescCodec],
    ['wantsPartial', 'boolean'],
  ],
);

const OCapNDeliverTargets = {
  DescExport,
  DescAnswer,
};

const OCapNDeliverTargetCodec = makeRecordUnionCodec(
  'OCapNDeliverTargetCodec',
  OCapNDeliverTargets,
);

/** @typedef {[string, ...any[]]} OpDeliverArgs */

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
    const result = [
      // method name
      syrupReader.readSelectorAsString(),
    ];
    while (!syrupReader.peekListEnd()) {
      result.push(OCapNPassableUnionCodec.read(syrupReader));
    }
    syrupReader.exitList();
    return result;
  },
  /**
   * @param {OpDeliverArgs} args
   * @param {SyrupWriter} syrupWriter
   */
  write: ([methodName, ...args], syrupWriter) => {
    syrupWriter.enterList();
    syrupWriter.writeSelectorFromString(methodName);
    for (const arg of args) {
      OCapNPassableUnionCodec.write(arg, syrupWriter);
    }
    syrupWriter.exitList();
  },
});

const OpDeliverOnly = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageDeliverOnlyCodec',
  'op:deliver-only',
  [
    ['to', OCapNDeliverTargetCodec],
    ['args', OpDeliverArgsCodec],
  ],
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
  [
    ['to', OCapNDeliverTargetCodec],
    ['args', OpDeliverArgsCodec],
    ['answerPosition', OpDeliverAnswerCodec],
    ['resolveMeDesc', OCapNResolveMeDescCodec],
  ],
);

const OCapNPromiseRefCodec = makeRecordUnionCodec('OCapNPromiseRefCodec', {
  DescAnswer,
  DescImportPromise,
});

const OpPick = makeOCapNRecordCodecFromDefinition(
  'OCapNMessagePickCodec',
  'op:pick',
  [
    ['promisePosition', OCapNPromiseRefCodec],
    ['selectedValuePosition', 'integer'],
    ['newAnswerPosition', 'integer'],
  ],
);

const OpAbort = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageAbortCodec',
  'op:abort',
  [['reason', 'string']],
);

const OpGcExport = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageGcExportCodec',
  'op:gc-export',
  [
    ['exportPosition', 'integer'],
    ['wireDelta', 'integer'],
  ],
);

const OpGcAnswer = makeOCapNRecordCodecFromDefinition(
  'OCapNMessageGcAnswerCodec',
  'op:gc-answer',
  [['answerPosition', 'integer']],
);

export const OCapNMessageUnionCodec = makeRecordUnionCodec(
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

export const readOCapNMessage = syrupReader => {
  return OCapNMessageUnionCodec.read(syrupReader);
};

export const writeOCapNMessage = (message, syrupWriter) => {
  OCapNMessageUnionCodec.write(message, syrupWriter);
  return syrupWriter.bufferWriter.subarray(0, syrupWriter.bufferWriter.length);
};
