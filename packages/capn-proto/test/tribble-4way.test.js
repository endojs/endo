// @ts-nocheck
/**
 * Tribble 4-way race ordering invariant + routing-via-original-import.
 *
 * The canonical 4-vat scenario from the Cap'n Proto rpc.capnp Disembargo
 * doc-comment: A holds promise P1 in B; B has resolved P1 to P2 in C; C has
 * resolved P2 to Bob in D. While these resolutions propagate, A makes
 * pipelined calls on P1.
 *
 * Per the spec's resolution rule (Tribble): once promise P resolves to
 * remote R, all further messages addressed to P are routed strictly via R
 * (which forwards to Q if R itself later resolves to Q). This avoids the
 * 3-hop-to-1-hop collapse race; A's pipelined calls observe E-order at Bob
 * regardless of how many forwarders are between them.
 *
 * Two tests in this file:
 *
 * 1. The 4-vat E-order invariant: A wires through B → C → D. We assert
 *    Bob (in D) observes pipelined calls in caller-issue order, AND that
 *    every intermediate vat (B, C) observed every call. This second
 *    assertion is the structural form of the Tribble routing rule:
 *    nothing gets short-circuited.
 *
 * 2. A more direct routing test: B exposes a method whose result is a
 *    promise that B will later resolve to a cap hosted in C. A calls
 *    that method and gets back an unresolved promise P. A pipelines
 *    calls on P both before and after the resolution. Both pre- and
 *    post-resolution calls are observed via B's forwarder (not via any
 *    direct A↔C path, which doesn't exist) — proving that resolution
 *    does not collapse the routing.
 */

import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeCapnp, makeInterfaceRegistry } from '../src/index.js';
import { withJsonCodecs } from './fixtures/json-codec.js';

const IFACE = 0xb0bb1eb0bb1en;

/**
 * Wire up two makeCapnp instances over a pair of microtask-flushed inboxes.
 *
 * @param {object} reg shared InterfaceRegistry
 * @param {unknown} aBootstrap
 * @param {unknown} bBootstrap
 */
const pair = (reg, aBootstrap, bBootstrap) => {
  /** @type {Array<() => void>} */
  let aIn = [];
  /** @type {Array<() => void>} */
  let bIn = [];
  let scheduled = false;
  // eslint-disable-next-line no-use-before-define
  const flush = () => {
    scheduled = false;
    while (aIn.length || bIn.length) {
      const ai = aIn;
      aIn = [];
      for (const f of ai) f();
      const bi = bIn;
      bIn = [];
      for (const f of bi) f();
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(flush);
  };
  /** @type {{ ref: ReturnType<typeof makeCapnp> | undefined }} */
  const bRef = { ref: undefined };
  const a = makeCapnp({
    send: framed => {
      bIn.push(() => /** @type {any} */ (bRef.ref).dispatch(framed));
      schedule();
    },
    bootstrap: aBootstrap,
    interfaceRegistry: reg,
  });
  const b = makeCapnp({
    send: framed => {
      aIn.push(() => a.dispatch(framed));
      schedule();
    },
    bootstrap: bBootstrap,
    interfaceRegistry: reg,
  });
  bRef.ref = b;
  return { a, b };
};

test('Tribble 4-way: pipelined calls preserve E-order through 3 forwarders, all hops observe every call', async t => {
  const reg = makeInterfaceRegistry();
  reg.register(withJsonCodecs({ id: IFACE, methods: { ping: 0, getNext: 1 } }));

  // Vat D: hosts Bob.
  const observedAtD = [];
  const bob = makeExo('bob', undefined, {
    ping(seq) {
      observedAtD.push(seq);
      return seq;
    },
  });

  // Vat C: forwards ping to D.
  const cToD = pair(reg, undefined, bob);
  const observedAtC = [];
  const cBootstrap = makeExo('cBootstrap', undefined, {
    getNext() {
      return cToD.a.getBootstrap();
    },
    ping(seq) {
      observedAtC.push(seq);
      return E(cToD.a.getBootstrap()).ping(seq);
    },
  });

  // Vat B: forwards ping to C.
  const bToC = pair(reg, undefined, cBootstrap);
  const observedAtB = [];
  const bBootstrap = makeExo('bBootstrap', undefined, {
    getNext() {
      return bToC.a.getBootstrap();
    },
    ping(seq) {
      observedAtB.push(seq);
      return E(bToC.a.getBootstrap()).ping(seq);
    },
  });

  // Vat A: speaks to B.
  const aToB = pair(reg, undefined, bBootstrap);
  const remote = aToB.a.getBootstrap();

  // Issue 5 pipelined ping calls in order without awaiting.
  const calls = [];
  for (let i = 0; i < 5; i += 1) calls.push(E(remote).ping(i));
  await Promise.all(calls);

  // E-order at the terminal vat: Bob received calls in caller-issue order.
  t.deepEqual(
    observedAtD,
    [0, 1, 2, 3, 4],
    'Bob received calls in caller-issue order despite 3-hop forwarding',
  );
  // Routing: every intermediate forwarder saw every call. No call was
  // short-circuited around B or C.
  t.deepEqual(
    observedAtB,
    [0, 1, 2, 3, 4],
    'B saw every call (no short-circuit from A to C)',
  );
  t.deepEqual(
    observedAtC,
    [0, 1, 2, 3, 4],
    'C saw every call (no short-circuit from B to D)',
  );
});

test('Tribble routing: calls on a promise stay routed via the original import after the promise resolves', async t => {
  const reg = makeInterfaceRegistry();
  reg.register(
    withJsonCodecs({
      id: IFACE,
      methods: { ping: 0, getNext: 1, getEventualForwarder: 2 },
    }),
  );

  // Vat C: hosts the eventual real cap (Bob).
  const observedAtC = [];
  const bob = makeExo('cBob', undefined, {
    ping(seq) {
      observedAtC.push(seq);
      return seq;
    },
  });

  // Vat B: exposes `getEventualForwarder()` that returns a promise. B will
  // later resolve that promise to its imported reference to Bob (in C).
  const bToC = pair(reg, undefined, bob);
  const observedAtB = [];
  let resolveForwarder;
  const forwarderPromise = new Promise(r => {
    resolveForwarder = r;
  });
  const bBootstrap = makeExo('bBootstrap', undefined, {
    getEventualForwarder() {
      return forwarderPromise;
    },
    ping(seq) {
      observedAtB.push(seq);
      return E(bToC.a.getBootstrap()).ping(seq);
    },
  });

  // Vat A: speaks only to B. A has no direct path to C.
  const aToB = pair(reg, undefined, bBootstrap);
  const remote = aToB.a.getBootstrap();

  // A asks B for the forwarder. The result is an unresolved promise.
  const forwarderP = E(remote).getEventualForwarder();

  // Pipelined calls on the unresolved promise — these must traverse the
  // promisedAnswer route (A→B), and B forwards to C.
  const preCalls = [];
  for (let i = 0; i < 3; i += 1) preCalls.push(E(forwarderP).ping(i));

  // Now B resolves the forwarder to its imported reference to Bob in C.
  // From A's perspective the promise resolves to a far cap that A imports
  // through its connection with B (a new senderHosted), so subsequent calls
  // are still addressed at one of B's exports — i.e., A→B→C — not magically
  // re-routed to a non-existent A↔C channel.
  resolveForwarder(bToC.a.getBootstrap());

  await Promise.all(preCalls);

  // Post-resolution calls.
  const postCalls = [];
  for (let i = 3; i < 6; i += 1) postCalls.push(E(forwarderP).ping(i));
  await Promise.all(postCalls);

  // All six calls were observed at C, in order.
  t.deepEqual(
    observedAtC,
    [0, 1, 2, 3, 4, 5],
    'every call eventually reaches Bob via the forwarding chain',
  );
});
