// @ts-nocheck
import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import {
  encodeProvide,
  encodeAccept,
  encodeResolve,
  encodeDisembargo,
  decodeMessage,
  makeCapnp,
  makeInterfaceRegistry,
} from '../src/index.js';
import {
  bytesAsDataEncoder,
  decodeDataFromSlot,
  bytesNetworkMock,
} from './fixtures/l3-bytes-network.js';

test('Provide/Accept/Disembargo all encode and decode', t => {
  const p = encodeProvide({
    questionId: 1,
    target: { kind: 'importedCap', id: 5 },
    encodeRecipient: bytesAsDataEncoder(new Uint8Array([0x01, 0x02, 0x03])),
  });
  t.is(decodeMessage(p).type, 'provide');

  const embargoBytes = new Uint8Array([0xee, 0x10]);
  const a = encodeAccept({
    questionId: 2,
    encodeProvision: bytesAsDataEncoder(new Uint8Array([0x04, 0x05])),
    embargoId: embargoBytes,
  });
  const am = decodeMessage(a);
  t.is(am.type, 'accept');
  t.deepEqual(Array.from(am.embargoId), Array.from(embargoBytes));

  // Disembargo{accept} now carries an embargoId byte string in 2.0-dev;
  // the previous Bool/Void shape was widened. An empty (or omitted) id
  // round-trips as a zero-length Uint8Array.
  const d = encodeDisembargo({
    target: { kind: 'importedCap', id: 1 },
    context: { kind: 'accept', embargoId: embargoBytes },
  });
  const dm = decodeMessage(d);
  t.is(dm.context.kind, 'accept');
  t.deepEqual(Array.from(dm.context.embargoId), Array.from(embargoBytes));

  // The pre-2.0 Disembargo `provide` arm was removed; B forwards
  // `Disembargo{accept}` with `target = promisedAnswer{provideQid}` instead.
  const d2 = encodeDisembargo({
    target: { kind: 'promisedAnswer', questionId: 42 },
    context: { kind: 'accept', embargoId: embargoBytes },
  });
  const d2m = decodeMessage(d2);
  t.is(d2m.context.kind, 'accept');
  t.is(d2m.target.kind, 'promisedAnswer');
  t.is(d2m.target.questionId, 42);
});

test('thirdPartyHosted CapDescriptor passes through Resolve unchanged', t => {
  const tpid = new Uint8Array([0xfe, 0xed, 0xfa, 0xce]);
  const f = encodeResolve({
    promiseId: 7,
    payload: {
      kind: 'cap',
      cap: {
        kind: 'thirdPartyHosted',
        vineId: 21,
        encodeId: bytesAsDataEncoder(tpid),
      },
    },
  });
  const m = decodeMessage(f);
  t.is(m.payload.cap.kind, 'thirdPartyHosted');
  t.is(m.payload.cap.vineId, 21);
  t.deepEqual(
    Array.from(decodeDataFromSlot(m.payload.cap.idSlot)),
    Array.from(tpid),
  );
});

// ---- L3 end-to-end (protocol-level, single vat acting as host C) ---------
//
// A full Level 3 flow involves three independent vats wired through a
// VatNetwork that knows how to dial peers. Building such a network is out
// of scope for a unit test (see test/interop-l3.test.js for the live
// version with a real C++ peer); here we exercise the handshake at the
// protocol layer: synthesize the messages a real Vat A and Vat B would
// have sent, feed them into Vat C's `dispatch`, and assert that Vat C
// reacts according to the spec — Provide is registered with the network,
// Accept yields a Return carrying the targeted cap, and a missing
// provision yields an exception Return.

test('L3 end-to-end (host side): Provide + Accept resolves to a senderHosted Return', async t => {
  const reg = makeInterfaceRegistry();

  // The cap C ultimately exposes via L3.
  const target = makeExo('target', undefined, {
    hello() {
      return 'hi from C';
    },
  });

  // Mock VatNetwork: C remembers any incoming Provide and matches Accepts
  // to it by provision id. recipientId/provision are opaque to us; we use
  // any sentinel buffer.
  /** @type {Map<string, { questionId: number, target: any }>} */
  const pendingProvides = new Map();
  const PROVISION = new Uint8Array([0xab, 0xcd]);
  const provisionKey = u8 => Array.from(u8).join(',');
  const network = bytesNetworkMock({
    provisionIdForHandoff: () => PROVISION,
    acceptIncomingProvide: (questionId, providedTarget /* , recipient */) => {
      pendingProvides.set(provisionKey(PROVISION), {
        questionId,
        target: providedTarget,
      });
    },
    consumeProvision: provision => {
      const p = pendingProvides.get(provisionKey(provision));
      if (p) pendingProvides.delete(provisionKey(provision));
      return p;
    },
  });

  // Vat C: connection bound to this network.
  /** @type {ArrayBuffer[]} */
  const cOut = [];
  const c = makeCapnp({
    send: framed => cOut.push(framed),
    bootstrap: target,
    interfaceRegistry: reg,
    network,
  });

  // Step 1: simulate Vat B sending a Provide telling C "hand the cap at
  // importedCap=0 to recipient Vat A". We have to first prime an export
  // on C for id 0 — handle a Bootstrap from B and discard the response.
  // For this test we already configured bootstrap=target, but the
  // bootstrap export id is allocated lazily by the bootstrap handler. We
  // exercise it explicitly so an export with id 0 exists for B to refer
  // to in the Provide target.
  const indexModule = await import('../src/index.js');
  c.dispatch(
    indexModule.encodeBootstrap({
      questionId: 100,
      deprecatedObjectId: null,
    }),
  );
  cOut.length = 0; // discard the bootstrap Return; we're done with it.

  // Step 2: B → C: Provide. C should call network.acceptIncomingProvide.
  c.dispatch(
    encodeProvide({
      questionId: 200,
      target: { kind: 'importedCap', id: 0 },
      encodeRecipient: bytesAsDataEncoder(new Uint8Array([0x41])), // sentinel "A"
    }),
  );
  t.is(pendingProvides.size, 1, 'C registered the provide with its network');

  // Step 3: A → C: Accept(provision). C should consume the provision,
  // export the targeted cap with a fresh id, and emit a Return carrying
  // a senderHosted CapDescriptor at index 0 of the Payload.capTable.
  cOut.length = 0;
  c.dispatch(
    encodeAccept({
      questionId: 300,
      encodeProvision: bytesAsDataEncoder(PROVISION),
    }),
  );
  // The Return is sent synchronously by handleAccept.
  t.is(cOut.length, 1, 'C emitted a Return for the Accept');
  const ret = decodeMessage(cOut[0]);
  t.is(ret.type, 'return');
  t.is(ret.answerId, 300);
  t.is(ret.result.kind, 'results');
  t.is(ret.result.payload.capTable.length, 1);
  t.is(ret.result.payload.capTable[0].kind, 'senderHosted');
  t.is(pendingProvides.size, 0, 'the provision was consumed (single-use)');
  c.abort('done');
});

test('L3 end-to-end: Accept with unknown provision returns an exception', async t => {
  const reg = makeInterfaceRegistry();
  const network = bytesNetworkMock();
  /** @type {ArrayBuffer[]} */
  const out = [];
  const c = makeCapnp({
    send: framed => out.push(framed),
    interfaceRegistry: reg,
    network,
  });

  c.dispatch(
    encodeAccept({
      questionId: 1,
      encodeProvision: bytesAsDataEncoder(new Uint8Array([0xff])),
    }),
  );
  t.is(out.length, 1);
  const m = decodeMessage(out[0]);
  t.is(m.type, 'return');
  t.is(m.result.kind, 'exception');
  t.regex(m.result.exception.reason, /unknown provision/);
  c.abort('done');
});

test('L3 host: Accept{embargoId} defers Return until Disembargo{accept,embargoId}', async t => {
  const reg = makeInterfaceRegistry();
  const target = makeExo('target', undefined, {
    hello() {
      return 'hi';
    },
  });

  const PROVISION = new Uint8Array([0xea, 0xea]);
  const PROVIDE_QID = 7100;
  /** @type {Map<string, { questionId: number, target: any }>} */
  const pending = new Map();
  const network = bytesNetworkMock({
    provisionIdForHandoff: () => PROVISION,
    acceptIncomingProvide: (questionId, providedTarget) => {
      pending.set(Array.from(PROVISION).join(','), {
        questionId,
        target: providedTarget,
      });
    },
    consumeProvision: provision => {
      const k = Array.from(provision).join(',');
      const found = pending.get(k);
      if (found) pending.delete(k);
      return found;
    },
  });

  /** @type {ArrayBuffer[]} */
  const out = [];
  const c = makeCapnp({
    send: framed => out.push(framed),
    bootstrap: target,
    interfaceRegistry: reg,
    network,
  });

  // Materialise the bootstrap export (id 0) so Provide can refer to it.
  const indexModule = await import('../src/index.js');
  c.dispatch(
    indexModule.encodeBootstrap({ questionId: 9999, deprecatedObjectId: null }),
  );
  out.length = 0;

  // B → C: Provide. C parks it under our PROVISION key with PROVIDE_QID.
  c.dispatch(
    encodeProvide({
      questionId: PROVIDE_QID,
      target: { kind: 'importedCap', id: 0 },
      encodeRecipient: bytesAsDataEncoder(new Uint8Array([0x41])),
    }),
  );

  // A → C: Accept with embargoId set. C must NOT emit a Return yet.
  const EMBARGO_ID = new Uint8Array([0xe0, 0x77]);
  out.length = 0;
  c.dispatch(
    encodeAccept({
      questionId: 9100,
      encodeProvision: bytesAsDataEncoder(PROVISION),
      embargoId: EMBARGO_ID,
    }),
  );
  // Drain microtasks so any spurious Return would have been emitted.
  await Promise.resolve();
  await Promise.resolve();
  t.is(out.length, 0, 'C parked the Accept Return until disembargo lifts');

  // B → C: Disembargo{target: promisedAnswer{PROVIDE_QID}, context: accept{embargoId}}.
  // 2.0-dev replaced the bespoke `provide` arm with this shape: B forwards
  // the same `accept`-arm Disembargo it received from A, rewriting the
  // target into C's coordinate space (the Provide questionId).
  c.dispatch(
    indexModule.encodeDisembargo({
      target: { kind: 'promisedAnswer', questionId: PROVIDE_QID },
      context: { kind: 'accept', embargoId: EMBARGO_ID },
    }),
  );
  // The drain is one microtask; await two ticks to be safe.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  t.is(out.length, 1, 'C emitted the deferred Accept Return');
  const ret = decodeMessage(out[0]);
  t.is(ret.type, 'return');
  t.is(ret.answerId, 9100);
  t.is(ret.result.kind, 'results');
  t.is(ret.result.payload.capTable[0].kind, 'senderHosted');

  c.abort('done');
});
