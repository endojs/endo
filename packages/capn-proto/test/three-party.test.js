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

// ---- L3 end-to-end (protocol-level, single vat acting as host C) ---------
//
// A full Level 3 flow involves three independent vats wired through a
// VatNetwork that knows how to dial peers. Building such a network is out
// of scope for a unit test, so we instead exercise the handshake at the
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
  const network = {
    ourVatId: () => new Uint8Array([0x43]),
    thirdPartyCapIdForHost: () => new Uint8Array(0),
    connectToThirdParty: () => {
      throw Error('host vat does not initiate connections');
    },
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
  };

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
  c.dispatch(
    /** @type {any} */ (
      (await import('../src/index.js')).encodeBootstrap({
        questionId: 100,
        deprecatedObjectId: null,
      })
    ),
  );
  cOut.length = 0; // discard the bootstrap Return; we're done with it.

  // Step 2: B → C: Provide. C should call network.acceptIncomingProvide.
  c.dispatch(
    encodeProvide({
      questionId: 200,
      target: { kind: 'importedCap', id: 0 },
      recipient: new Uint8Array([0x41]), // sentinel "A"
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
      provision: PROVISION,
      embargo: false,
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
  const network = {
    ourVatId: () => new Uint8Array(0),
    thirdPartyCapIdForHost: () => new Uint8Array(0),
    connectToThirdParty: () => {
      throw Error('unused');
    },
    provisionIdForHandoff: () => new Uint8Array(0),
    acceptIncomingProvide: () => {},
    consumeProvision: () => undefined,
  };
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
      provision: new Uint8Array([0xff]),
      embargo: false,
    }),
  );
  t.is(out.length, 1);
  const m = decodeMessage(out[0]);
  t.is(m.type, 'return');
  t.is(m.result.kind, 'exception');
  t.regex(m.result.exception.reason, /unknown provision/);
  c.abort('done');
});
