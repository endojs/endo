import { RecordUnionCodec, SyrupStructuredRecordCodecType, SimpleSyrupCodecType } from '../codec.js';
import { OCapNNode, OCapNPublicKey, OCapNSignature } from './components.js';
import { OCapNPassableUnionCodec } from './passable.js';
import { DescImportObject, DescImportPromise, DescExport, DescAnswer } from './descriptors.js';

/*
 * These are OCapN Operations, they are messages that are sent between OCapN Nodes
 */

const OpStartSession = new SyrupStructuredRecordCodecType(
  'op:start-session', [
  ['captpVersion', 'string'],
  ['sessionPublicKey', OCapNPublicKey],
  ['location', OCapNNode],
  ['locationSignature', OCapNSignature],
])

const OCapNResolveMeDescCodec = new RecordUnionCodec({
  DescImportObject,
  DescImportPromise,
});

const OpListen = new SyrupStructuredRecordCodecType(
  'op:listen', [
  ['to', DescExport],
  ['resolveMeDesc', OCapNResolveMeDescCodec],
  ['wantsPartial', 'boolean'],
])

const OCapNDeliverTargets = {
  DescExport,
  DescAnswer,
}

const OCapNDeliverTargetCodec = new RecordUnionCodec(OCapNDeliverTargets);

// Used by the deliver and deliver-only operations
// First arg is method name, rest are Passables
const OpDeliverArgsCodec = new SimpleSyrupCodecType({
  unmarshal: (syrupReader) => {
    syrupReader.enterList();
    const result = [
      // method name
      syrupReader.readSymbolAsString(),
    ];
    while (!syrupReader.peekListEnd()) {
      result.push(
        OCapNPassableUnionCodec.unmarshal(syrupReader)
      )
    }
    syrupReader.exitList();
    return result;
  },
  marshal: ([methodName, ...args], syrupWriter) => {
    syrupWriter.enterList();
    syrupWriter.writeSymbol(methodName);
    for (const arg of args) {
      OCapNPassableUnionCodec.marshal(arg, syrupWriter);
    }
    syrupWriter.exitList();
  },
})

const OpDeliverOnly = new SyrupStructuredRecordCodecType(
  'op:deliver-only', [
  ['to', OCapNDeliverTargetCodec],
  ['args', OpDeliverArgsCodec],
])

const OpDeliverAnswerCodec = new SimpleSyrupCodecType({
  unmarshal: (syrupReader) => {
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
  marshal: (value, syrupWriter) => {
    if (typeof value === 'bigint') {
      syrupWriter.writeInteger(value);
    } else if (typeof value === 'boolean') {
      syrupWriter.writeBoolean(value);
    } else {
      throw Error(`Expected integer or boolean, got ${typeof value}`);
    }
  },
});

const OpDeliver = new SyrupStructuredRecordCodecType(
  'op:deliver', [
  ['to', OCapNDeliverTargetCodec],
  ['args', OpDeliverArgsCodec],
  ['answerPosition', OpDeliverAnswerCodec],
  ['resolveMeDesc', OCapNResolveMeDescCodec],
])

const OCapNPromiseRefCodec = new RecordUnionCodec({
  DescAnswer,
  DescImportPromise,
});

const OpPick = new SyrupStructuredRecordCodecType(
  'op:pick', [
  ['promisePosition', OCapNPromiseRefCodec],
  ['selectedValuePosition', 'integer'],
  ['newAnswerPosition', 'integer'],
])

const OpAbort = new SyrupStructuredRecordCodecType(
  'op:abort', [
  ['reason', 'string'],
])

const OpGcExport = new SyrupStructuredRecordCodecType(
  'op:gc-export', [
  ['exportPosition', 'integer'],
  ['wireDelta', 'integer'],
])

const OpGcAnswer = new SyrupStructuredRecordCodecType(
  'op:gc-answer', [
  ['answerPosition', 'integer'],
])

export const OCapNMessageUnionCodec = new RecordUnionCodec({
  OpStartSession,
  OpDeliverOnly,
  OpDeliver,
  OpPick,
  OpAbort,
  OpListen,
  OpGcExport,
  OpGcAnswer,
});

export const readOCapNMessage = (syrupReader) => {
  return OCapNMessageUnionCodec.unmarshal(syrupReader);
}

export const writeOCapNMessage = (message, syrupWriter) => {
  OCapNMessageUnionCodec.marshal(message, syrupWriter);
  return syrupWriter.bufferWriter.subarray(0, syrupWriter.bufferWriter.length);
}

