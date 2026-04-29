// @ts-nocheck
/**
 * Level 3 recipient-side Accept end-to-end.
 *
 * This test exercises the path from
 *   `peer.sendAccept(provision)` → C's `handleAccept` → C's Return →
 *   A's `handleReturn` → resolves A's promise to a Presence on A↔C →
 *   E(presence).method() → routed A→C
 *
 * which is the entire happy path the recipient (Vat A) takes when it
 * receives a `thirdPartyHosted` cap descriptor and decides to dial the
 * host (Vat C) directly. The introducer (Vat B) is not modelled here —
 * see `test/three-party.test.js` for the host-side handshake test that
 * synthesizes B's Provide manually. The bit being exercised here is the
 * machinery added to `connection.js` for `sendAccept` and to
 * `three-party.js` for `acceptThirdParty` to drive that machinery.
 */
import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeCapnp, makeInterfaceRegistry } from '../src/index.js';

const provisionKey = bytes => Array.from(bytes).join(',');

/**
 * A small in-memory loopback transport that pumps messages between two
 * makeCapnp peers on a shared microtask scheduler. Returns `{ wireA, wireB }`
 * — each side passes its `send` callback to its `makeCapnp` constructor.
 */
const makeLoopbackPair = () => {
  const inbox = { A: [], B: [] };
  let scheduled = false;
  /** @type {{ A: (b: ArrayBuffer) => void, B: (b: ArrayBuffer) => void }} */
  const dispatchOf = { A: () => {}, B: () => {} };
  const flush = () => {
    scheduled = false;
    while (inbox.A.length || inbox.B.length) {
      const a = inbox.A.splice(0);
      for (const m of a) dispatchOf.A(m);
      const b = inbox.B.splice(0);
      for (const m of b) dispatchOf.B(m);
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(flush);
  };
  return {
    sendFromA: framed => {
      inbox.B.push(framed);
      schedule();
    },
    sendFromB: framed => {
      inbox.A.push(framed);
      schedule();
    },
    setDispatchA: cb => {
      dispatchOf.A = cb;
    },
    setDispatchB: cb => {
      dispatchOf.B = cb;
    },
    flush,
  };
};

test('L3 recipient sendAccept(provision) resolves to a usable Presence on A↔C', async t => {
  const interfaceRegistry = makeInterfaceRegistry();
  interfaceRegistry.register({
    id: 0xc0n,
    methods: { hello: 0, double: 1 },
  });

  // The cap C exposes via L3.
  const cTarget = makeExo('cTarget', undefined, {
    hello() {
      return 'hello from C';
    },
    double(n) {
      return n * 2;
    },
  });

  // C's per-network state: a single stashed provision matching `cTarget`.
  /** @type {Map<string, { target: any }>} */
  const cPending = new Map();
  const PROVISION = new Uint8Array([0xab, 0xcd, 0xef]);
  cPending.set(provisionKey(PROVISION), { target: cTarget });

  const cNetwork = {
    ourVatId: () => new Uint8Array([0x43]),
    thirdPartyCapIdForHost: () => new Uint8Array(0),
    connectToThirdParty: () => {
      throw Error('C does not initiate L3');
    },
    provisionIdForHandoff: () => PROVISION,
    acceptIncomingProvide: () => {},
    consumeProvision: provision => {
      const k = provisionKey(provision);
      const found = cPending.get(k);
      if (found) cPending.delete(k);
      return found;
    },
  };

  // Wire A↔C as a single loopback pair. (In a real L3 setup A would also
  // have an A↔B connection; we're not exercising that side here.)
  const wire = makeLoopbackPair();

  // C must export the target before the Accept arrives so that
  // `tables.exports.get(provided.target.id)` finds it. We model this by
  // setting `bootstrap: cTarget` on C and hand-dispatching a Bootstrap to
  // C from A so the export is materialised at id 0 (which our stashed
  // provision references via a wrapper). Simpler: use a custom variant of
  // `consumeProvision` that returns `{ target: { id: <export id> } }`. We
  // export the target into C's table by sending a Bootstrap.
  const c = makeCapnp({
    send: wire.sendFromB,
    bootstrap: cTarget,
    interfaceRegistry,
    network: cNetwork,
  });
  wire.setDispatchB(c.dispatch);

  const a = makeCapnp({
    send: wire.sendFromA,
    interfaceRegistry,
    // A's network is unused in this test (sendAccept is invoked directly).
  });
  wire.setDispatchA(a.dispatch);

  // Bootstrap dance to materialise the cTarget export at a known id on C.
  const bootP = a.getBootstrap();
  await bootP;
  // Now C has exported cTarget. The first export id is 0.
  cPending.clear();
  cPending.set(provisionKey(PROVISION), { target: { id: 0 } });

  // The actual L3 recipient-side Accept.
  const cap = await a.sendAccept(PROVISION);
  t.truthy(cap, 'sendAccept resolved to a Presence');

  // Use the cap — the call rides on the same A↔C connection.
  const greeting = await E(cap).hello();
  t.is(greeting, 'hello from C');

  const doubled = await E(cap).double(21);
  t.is(doubled, 42);

  a.abort('done');
  c.abort('done');
});

test('L3 recipient sendAccept(unknown provision) rejects', async t => {
  const interfaceRegistry = makeInterfaceRegistry();
  const cNetwork = {
    ourVatId: () => new Uint8Array(0),
    thirdPartyCapIdForHost: () => new Uint8Array(0),
    connectToThirdParty: () => {
      throw Error('unused');
    },
    provisionIdForHandoff: () => new Uint8Array(0),
    acceptIncomingProvide: () => {},
    consumeProvision: () => undefined,
  };
  const wire = makeLoopbackPair();
  const c = makeCapnp({
    send: wire.sendFromB,
    interfaceRegistry,
    network: cNetwork,
  });
  wire.setDispatchB(c.dispatch);
  const a = makeCapnp({
    send: wire.sendFromA,
    interfaceRegistry,
  });
  wire.setDispatchA(a.dispatch);

  await t.throwsAsync(() => a.sendAccept(new Uint8Array([0x00])), {
    message: /unknown provision/,
  });
  a.abort('done');
  c.abort('done');
});
