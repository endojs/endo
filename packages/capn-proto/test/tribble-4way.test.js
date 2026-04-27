// @ts-check
/**
 * Tribble 4-way race ordering invariant.
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
 * This test wires four independent makeCapnp instances and 6 directed
 * channels, lets B's bootstrap return a promise that resolves to a cap
 * hosted in C (and C in turn returns one hosted in D), and asserts that
 * Bob receives N pipelined calls in caller-issue order.
 */

import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeCapnp, makeInterfaceRegistry } from '../src/index.js';

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
  // eslint-disable-next-line prefer-const
  let a;
  // eslint-disable-next-line prefer-const
  let b;
  a = makeCapnp({
    send: framed => {
      bIn.push(() => b.dispatch(framed));
      schedule();
    },
    bootstrap: aBootstrap,
    interfaceRegistry: reg,
  });
  b = makeCapnp({
    send: framed => {
      aIn.push(() => a.dispatch(framed));
      schedule();
    },
    bootstrap: bBootstrap,
    interfaceRegistry: reg,
  });
  return { a, b };
};

test('Tribble 4-way: pipelined calls preserve E-order through 3 forwarders', async t => {
  const reg = makeInterfaceRegistry();
  reg.register({ id: IFACE, methods: { ping: 0, getNext: 1 } });

  // Vat D: hosts Bob.
  const observed = [];
  const bob = makeExo('bob', undefined, {
    ping(seq) {
      observed.push(seq);
      return seq;
    },
  });

  // Vat C: bootstrap forwards to Bob in D via E(D).getNext().
  const cToD = pair(reg, undefined, bob);
  const cBootstrap = makeExo('cBootstrap', undefined, {
    getNext() {
      return cToD.a.getBootstrap();
    },
    ping(seq) {
      return E(cToD.a.getBootstrap()).ping(seq);
    },
  });

  // Vat B: bootstrap forwards to C's bootstrap.
  const bToC = pair(reg, undefined, cBootstrap);
  const bBootstrap = makeExo('bBootstrap', undefined, {
    getNext() {
      return bToC.a.getBootstrap();
    },
    ping(seq) {
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

  t.deepEqual(
    observed,
    [0, 1, 2, 3, 4],
    'Bob received calls in caller-issue order despite 3-hop forwarding',
  );
});
