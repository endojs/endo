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

const OpStartSession = makeOCapNRecordCodecFromDefinition('op:start-session', [
  ['captpVersion', 'string'],
  ['sessionPublicKey', OCapNPublicKey],
  ['location', OCapNNode],
  ['locationSignature', OCapNSignature],
]);

const OCapNResolveMeDescCodec = makeRecordUnionCodec({
  DescImportObject,
  DescImportPromise,
});

const OpListen = makeOCapNRecordCodecFromDefinition('op:listen', [
  ['to', DescExport],
  ['resolveMeDesc', OCapNResolveMeDescCodec],
  ['wantsPartial', 'boolean'],
]);

const OCapNDeliverTargets = {
  DescExport,
  DescAnswer,
};

const OCapNDeliverTargetCodec = makeRecordUnionCodec(OCapNDeliverTargets);

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
    syrupWriter.writeSelector(methodName);
    for (const arg of args) {
      OCapNPassableUnionCodec.write(arg, syrupWriter);
    }
    syrupWriter.exitList();
  },
});

const OpDeliverOnly = makeOCapNRecordCodecFromDefinition('op:deliver-only', [
  ['to', OCapNDeliverTargetCodec],
  ['args', OpDeliverArgsCodec],
]);

// The OpDeliver answer is either a positive integer or false
const OpDeliverAnswerCodec = makeTypeHintUnionCodec(
  {
    'number-prefix': PositiveIntegerCodec,
    boolean: FalseCodec,
  },
  {
    bigint: PositiveIntegerCodec,
    boolean: FalseCodec,
  },
);

const OpDeliver = makeOCapNRecordCodecFromDefinition('op:deliver', [
  ['to', OCapNDeliverTargetCodec],
  ['args', OpDeliverArgsCodec],
  ['answerPosition', OpDeliverAnswerCodec],
  ['resolveMeDesc', OCapNResolveMeDescCodec],
]);

const OCapNPromiseRefCodec = makeRecordUnionCodec({
  DescAnswer,
  DescImportPromise,
});

const OpPick = makeOCapNRecordCodecFromDefinition('op:pick', [
  ['promisePosition', OCapNPromiseRefCodec],
  ['selectedValuePosition', 'integer'],
  ['newAnswerPosition', 'integer'],
]);

const OpAbort = makeOCapNRecordCodecFromDefinition('op:abort', [
  ['reason', 'string'],
]);

const OpGcExport = makeOCapNRecordCodecFromDefinition('op:gc-export', [
  ['exportPosition', 'integer'],
  ['wireDelta', 'integer'],
]);

const OpGcAnswer = makeOCapNRecordCodecFromDefinition('op:gc-answer', [
  ['answerPosition', 'integer'],
]);

export const OCapNMessageUnionCodec = makeRecordUnionCodec({
  OpStartSession,
  OpDeliverOnly,
  OpDeliver,
  OpPick,
  OpAbort,
  OpListen,
  OpGcExport,
  OpGcAnswer,
});

export const readOCapNMessage = syrupReader => {
  return OCapNMessageUnionCodec.read(syrupReader);
};

export const writeOCapNMessage = (message, syrupWriter) => {
  OCapNMessageUnionCodec.write(message, syrupWriter);
  return syrupWriter.bufferWriter.subarray(0, syrupWriter.bufferWriter.length);
};
