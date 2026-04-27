import test from '@endo/ses-ava/test.js';
import {
  encodeBootstrap,
  encodeCall,
  encodeReturn,
  encodeFinish,
  encodeResolve,
  encodeRelease,
  encodeDisembargo,
  encodeProvide,
  encodeAccept,
  encodeAbort,
  encodeUnimplemented,
  decodeMessage,
} from '../../src/proto/messages.js';

test('Bootstrap round-trips', t => {
  const framed = encodeBootstrap({ questionId: 42, deprecatedObjectId: null });
  const m = decodeMessage(framed);
  t.is(m.type, 'bootstrap');
  t.is(m.questionId, 42);
});

test('Call round-trips', t => {
  const framed = encodeCall({
    questionId: 7,
    target: { kind: 'importedCap', id: 3 },
    interfaceId: 0xa1b2c3d4e5f60718n,
    methodId: 11,
    params: { contentBytes: new Uint8Array([1, 2, 3]), capTable: [
      { kind: 'senderHosted', id: 9 },
    ] },
  });
  const m = decodeMessage(framed);
  t.is(m.type, 'call');
  t.is(m.questionId, 7);
  t.is(m.target.kind, 'importedCap');
  t.is(m.target.id, 3);
  t.is(m.interfaceId, 0xa1b2c3d4e5f60718n);
  t.is(m.methodId, 11);
  t.deepEqual(Array.from(m.params.contentBytes), [1, 2, 3]);
  t.is(m.params.capTable.length, 1);
  t.is(m.params.capTable[0].kind, 'senderHosted');
  t.is(m.params.capTable[0].id, 9);
});

test('Call with promisedAnswer target round-trips', t => {
  const framed = encodeCall({
    questionId: 1,
    target: {
      kind: 'promisedAnswer',
      questionId: 99,
      transform: [{ op: 'getPointerField', fieldOrdinal: 5 }],
    },
    interfaceId: 0n,
    methodId: 0,
    params: { contentBytes: new Uint8Array(0), capTable: [] },
  });
  const m = decodeMessage(framed);
  t.is(m.target.kind, 'promisedAnswer');
  t.is(m.target.questionId, 99);
  t.deepEqual(m.target.transform, [{ op: 'getPointerField', fieldOrdinal: 5 }]);
});

test('Return with results round-trips', t => {
  const framed = encodeReturn({
    answerId: 12,
    result: { kind: 'results', payload: { contentBytes: new Uint8Array([9]), capTable: [] } },
  });
  const m = decodeMessage(framed);
  t.is(m.type, 'return');
  t.is(m.answerId, 12);
  t.is(m.result.kind, 'results');
  t.deepEqual(Array.from(m.result.payload.contentBytes), [9]);
});

test('Return with exception round-trips', t => {
  const framed = encodeReturn({
    answerId: 5,
    result: { kind: 'exception', exception: { type: 1, reason: 'boom' } },
  });
  const m = decodeMessage(framed);
  t.is(m.result.kind, 'exception');
  t.is(m.result.exception.type, 1);
  t.is(m.result.exception.reason, 'boom');
});

test('Finish round-trips', t => {
  const framed = encodeFinish({ questionId: 8, releaseResultCaps: true });
  const m = decodeMessage(framed);
  t.is(m.type, 'finish');
  t.is(m.questionId, 8);
  t.true(m.releaseResultCaps);
});

test('Resolve cap round-trips', t => {
  const framed = encodeResolve({
    promiseId: 4,
    payload: { kind: 'cap', cap: { kind: 'senderHosted', id: 17 } },
  });
  const m = decodeMessage(framed);
  t.is(m.type, 'resolve');
  t.is(m.promiseId, 4);
  t.is(m.payload.kind, 'cap');
  t.is(m.payload.cap.kind, 'senderHosted');
  t.is(m.payload.cap.id, 17);
});

test('Release round-trips', t => {
  const framed = encodeRelease({ id: 6, referenceCount: 3 });
  const m = decodeMessage(framed);
  t.is(m.type, 'release');
  t.is(m.id, 6);
  t.is(m.referenceCount, 3);
});

test('Disembargo senderLoopback round-trips', t => {
  const framed = encodeDisembargo({
    target: { kind: 'importedCap', id: 1 },
    context: { kind: 'senderLoopback', id: 99 },
  });
  const m = decodeMessage(framed);
  t.is(m.type, 'disembargo');
  t.is(m.context.kind, 'senderLoopback');
  t.is(m.context.id, 99);
  t.is(m.target.kind, 'importedCap');
  t.is(m.target.id, 1);
});

test('Disembargo receiverLoopback round-trips', t => {
  const framed = encodeDisembargo({
    target: { kind: 'importedCap', id: 1 },
    context: { kind: 'receiverLoopback', id: 99 },
  });
  const m = decodeMessage(framed);
  t.is(m.context.kind, 'receiverLoopback');
  t.is(m.context.id, 99);
});

test('Provide round-trips', t => {
  const framed = encodeProvide({
    questionId: 10,
    target: { kind: 'importedCap', id: 7 },
    recipient: new Uint8Array([1, 2, 3]),
  });
  const m = decodeMessage(framed);
  t.is(m.type, 'provide');
  t.is(m.questionId, 10);
  t.deepEqual(Array.from(m.recipient), [1, 2, 3]);
});

test('Accept round-trips', t => {
  const framed = encodeAccept({
    questionId: 22,
    provision: new Uint8Array([4, 5, 6]),
    embargo: true,
  });
  const m = decodeMessage(framed);
  t.is(m.type, 'accept');
  t.is(m.questionId, 22);
  t.true(m.embargo);
  t.deepEqual(Array.from(m.provision), [4, 5, 6]);
});

test('Abort round-trips', t => {
  const framed = encodeAbort({ exception: { type: 2, reason: 'shutdown' } });
  const m = decodeMessage(framed);
  t.is(m.type, 'abort');
  t.is(m.exception.type, 2);
  t.is(m.exception.reason, 'shutdown');
});

test('Unimplemented round-trips', t => {
  const original = new Uint8Array([10, 20, 30, 40]);
  const framed = encodeUnimplemented({ originalBytes: original });
  const m = decodeMessage(framed);
  t.is(m.type, 'unimplemented');
  t.deepEqual(Array.from(m.originalBytes), Array.from(original));
});

test('thirdPartyHosted CapDescriptor round-trips inside Resolve', t => {
  const framed = encodeResolve({
    promiseId: 1,
    payload: {
      kind: 'cap',
      cap: {
        kind: 'thirdPartyHosted',
        vineId: 13,
        thirdPartyCapId: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      },
    },
  });
  const m = decodeMessage(framed);
  t.is(m.payload.cap.kind, 'thirdPartyHosted');
  t.is(m.payload.cap.vineId, 13);
  t.deepEqual(Array.from(m.payload.cap.thirdPartyCapId), [0xde, 0xad, 0xbe, 0xef]);
});
