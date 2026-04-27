// @ts-nocheck
import test from '@endo/ses-ava/test.js';
import {
  encodeProvide,
  encodeAccept,
  encodeResolve,
  encodeDisembargo,
  decodeMessage,
} from '../src/index.js';

test('Provide/Accept/Disembargo all encode and decode', t => {
  const p = encodeProvide({
    questionId: 1,
    target: { kind: 'importedCap', id: 5 },
    recipient: new Uint8Array([0x01, 0x02, 0x03]),
  });
  t.is(decodeMessage(p).type, 'provide');

  const a = encodeAccept({
    questionId: 2,
    provision: new Uint8Array([0x04, 0x05]),
    embargo: true,
  });
  const am = decodeMessage(a);
  t.is(am.type, 'accept');
  t.true(am.embargo);

  const d = encodeDisembargo({
    target: { kind: 'importedCap', id: 1 },
    context: { kind: 'accept' },
  });
  t.is(decodeMessage(d).context.kind, 'accept');

  const d2 = encodeDisembargo({
    target: { kind: 'importedCap', id: 1 },
    context: { kind: 'provide', questionId: 42 },
  });
  const d2m = decodeMessage(d2);
  t.is(d2m.context.kind, 'provide');
  t.is(d2m.context.questionId, 42);
});

test('thirdPartyHosted CapDescriptor passes through Resolve unchanged', t => {
  const tpid = new Uint8Array([0xfe, 0xed, 0xfa, 0xce]);
  const f = encodeResolve({
    promiseId: 7,
    payload: {
      kind: 'cap',
      cap: { kind: 'thirdPartyHosted', vineId: 21, thirdPartyCapId: tpid },
    },
  });
  const m = decodeMessage(f);
  t.is(m.payload.cap.kind, 'thirdPartyHosted');
  t.is(m.payload.cap.vineId, 21);
  t.deepEqual(Array.from(m.payload.cap.thirdPartyCapId), Array.from(tpid));
});
