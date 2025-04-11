import {
  makeRecordUnionCodec,
  makeRecordCodecFromDefinition,
} from '../codec.js';
import { OCapNNode, OCapNPublicKey, OCapNSignature } from './components.js';
import { OCapNPassableUnionCodec } from './passable.js';
import {
  DescImportObject,
  DescImportPromise,
  DescExport,
  DescAnswer,
} from './descriptors.js';

const { freeze } = Object;

/*
 * These are OCapN Operations, they are messages that are sent between OCapN Nodes
 */

const OpStartSession = makeRecordCodecFromDefinition('op:start-session', [
  ['captpVersion', 'string'],
  ['sessionPublicKey', OCapNPublicKey],
  ['location', OCapNNode],
  ['locationSignature', OCapNSignature],
]);

const OCapNResolveMeDescCodec = makeRecordUnionCodec({
  DescImportObject,
  DescImportPromise,
});

const OpListen = makeRecordCodecFromDefinition('op:listen', [
  ['to', DescExport],
  ['resolveMeDesc', OCapNResolveMeDescCodec],
  ['wantsPartial', 'boolean'],
]);

const OCapNDeliverTargets = {
  DescExport,
  DescAnswer,
};

const OCapNDeliverTargetCodec = makeRecordUnionCodec(OCapNDeliverTargets);

// Used by the deliver and deliver-only operations
// First arg is method name, rest are Passables
const OpDeliverArgsCodec = freeze({
  read: syrupReader => {
    syrupReader.enterList();
    const result = [
      // method name
      syrupReader.readSymbolAsString(),
    ];
    while (!syrupReader.peekListEnd()) {
      result.push(OCapNPassableUnionCodec.read(syrupReader));
    }
    syrupReader.exitList();
    return result;
  },
  write: ([methodName, ...args], syrupWriter) => {
    syrupWriter.enterList();
    syrupWriter.writeSymbol(methodName);
    for (const arg of args) {
      OCapNPassableUnionCodec.write(arg, syrupWriter);
    }
    syrupWriter.exitList();
  },
});

const OpDeliverOnly = makeRecordCodecFromDefinition('op:deliver-only', [
  ['to', OCapNDeliverTargetCodec],
  ['args', OpDeliverArgsCodec],
]);

const OpDeliverAnswerCodec = freeze({
  read: syrupReader => {
    const typeHint = syrupReader.peekTypeHint();
    if (typeHint === 'number-prefix') {
      // should be an integer
      return syrupReader.readInteger();
    }
    if (typeHint === 'boolean') {
      return syrupReader.readBoolean();
    }
    throw Error(`Expected integer or boolean, got ${typeHint}`);
  },
  write: (value, syrupWriter) => {
    if (typeof value === 'bigint') {
      syrupWriter.writeInteger(value);
    } else if (typeof value === 'boolean') {
      syrupWriter.writeBoolean(value);
    } else {
      throw Error(`Expected integer or boolean, got ${typeof value}`);
    }
  },
});

const OpDeliver = makeRecordCodecFromDefinition('op:deliver', [
  ['to', OCapNDeliverTargetCodec],
  ['args', OpDeliverArgsCodec],
  ['answerPosition', OpDeliverAnswerCodec],
  ['resolveMeDesc', OCapNResolveMeDescCodec],
]);

const OCapNPromiseRefCodec = makeRecordUnionCodec({
  DescAnswer,
  DescImportPromise,
});

const OpPick = makeRecordCodecFromDefinition('op:pick', [
  ['promisePosition', OCapNPromiseRefCodec],
  ['selectedValuePosition', 'integer'],
  ['newAnswerPosition', 'integer'],
]);

const OpAbort = makeRecordCodecFromDefinition('op:abort', [
  ['reason', 'string'],
]);

const OpGcExport = makeRecordCodecFromDefinition('op:gc-export', [
  ['exportPosition', 'integer'],
  ['wireDelta', 'integer'],
]);

const OpGcAnswer = makeRecordCodecFromDefinition('op:gc-answer', [
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
