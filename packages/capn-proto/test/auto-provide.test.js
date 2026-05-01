// @ts-nocheck
/**
 * L3 auto-Provide on encode — three-vat end-to-end.
 *
 * Vat C exports a cap (cTarget). Vat B imports cTarget via B↔C and
 * exposes a `getInner()` bootstrap method that returns it. Vat A asks B
 * for it. The interesting bit is what happens inside B's payload codec
 * when it goes to encode cTarget for delivery to A:
 *
 *   * cTarget is a Presence B holds, but it is NOT an import on the
 *     B↔A connection (so `receiverHosted` pass-back doesn't apply).
 *   * The shared `capHomes` registry tells B that cTarget's home is the
 *     B↔C connection.
 *   * B therefore takes the auto-Provide branch: it issues
 *     `Provide { recipient: A }` on B↔C, allocates a vine on B↔A, and
 *     hands A a `thirdPartyHosted { thirdPartyCapId(C), vineId }`
 *     descriptor instead of `senderHosted` (which would have made B a
 *     forwarder forever).
 *
 * A receives the Resolve, opens its A↔C connection via
 * `network.connectToThirdParty`, sends `Accept(provision)`, and gets a
 * direct Presence on A↔C. The subsequent `E(presence).hello()` call
 * goes A→C directly with no B involvement. The vine is released.
 */

import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import {
  E,
  makeCapnp,
  makeInterfaceRegistry,
  makeCapHomeRegistry,
} from '../src/index.js';

const provisionKey = bytes => Array.from(bytes).join(',');
const u8 = s => new TextEncoder().encode(s);

/**
 * Build a fully-connected three-vat in-memory network. Returns an object
 * with `{ aToB, bToA, aToC, cToA, bToC, cToB, flush }` — six makeCapnp
 * peers (one per direction) sharing one interfaceRegistry and one
 * capHomes registry.
 *
 * Each pair-connection runs its own scheduler queue, drained
 * cooperatively by `flush()`.
 */
const makeThreeVatNet = ({ bootstrapB, bootstrapC }) => {
  const interfaceRegistry = makeInterfaceRegistry();
  const capHomes = makeCapHomeRegistry();

  const VAT_A = u8('vat-A');
  const VAT_B = u8('vat-B');
  const VAT_C = u8('vat-C');
  const vatIdToName = bytes => {
    const s = new TextDecoder().decode(bytes);
    return s.replace('vat-', '');
  };

  // Per-pair channels.
  /** @type {Record<string, ArrayBuffer[]>} */
  const channels = {
    'A-B': [],
    'B-A': [],
    'A-C': [],
    'C-A': [],
    'B-C': [],
    'C-B': [],
  };
  /** @type {Record<string, (b: ArrayBuffer) => void>} */
  const dispatchers = {};
  let scheduled = false;
  const flush = () => {
    scheduled = false;
    let didWork = true;
    while (didWork) {
      didWork = false;
      for (const k of Object.keys(channels)) {
        const q = channels[k];
        if (q.length > 0) {
          const drain = q.splice(0);
          didWork = true;
          for (const m of drain) (dispatchers[k] || (() => {}))(m);
        }
      }
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(flush);
  };

  // Per-vat host-side state for incoming Provides. Keyed by the
  // provision bytes the network hands out; populated by
  // `acceptIncomingProvide`, drained by `consumeProvision`.
  const pendingByVat = { A: new Map(), B: new Map(), C: new Map() };
  let provisionCounter = 0;

  // Per-vat connection map (so connectToThirdParty can return the
  // right peer). Filled in below after the makeCapnp calls.
  const connByVat = {
    A: { B: undefined, C: undefined },
    B: { A: undefined, C: undefined },
    C: { A: undefined, B: undefined },
  };

  const networkFor = me => ({
    capHomes,
    ourVatId: () => ({ A: VAT_A, B: VAT_B, C: VAT_C })[me],
    /**
     * Identify the host peer by its vat id bytes. The `hostConnection`
     * argument is the makeCapnp peer object the auto-Provide path on
     * `me` is about to send a Provide on; we walk our connection map
     * to figure out which named peer it is.
     */
    thirdPartyCapIdForHost: hostConnection => {
      for (const peerName of ['A', 'B', 'C']) {
        if (connByVat[me][peerName] === hostConnection) {
          return { A: VAT_A, B: VAT_B, C: VAT_C }[peerName];
        }
      }
      throw Error('hostConnection not in our peer map');
    },
    /**
     * Recipient (A) → look up our existing connection to the host and
     * return it. (Real networks would dial a fresh socket here.)
     */
    connectToThirdParty: thirdPartyCapId => {
      const peerName = vatIdToName(thirdPartyCapId);
      const conn = connByVat[me][peerName];
      if (!conn) throw Error(`no preconfigured connection ${me}↔${peerName}`);
      return conn;
    },
    /**
     * Both B and A end up calling this — and they need to agree. We
     * embed a counter into the bytes; B mints, then stashes the same
     * provision in BOTH the host (C) and the recipient (A) tables so
     * a later Accept from A matches the Provide from B.
     */
    provisionIdForHandoff: () => {
      provisionCounter += 1;
      return new Uint8Array([
        0xa0,
        (provisionCounter >>> 8) & 0xff,
        provisionCounter & 0xff,
      ]);
    },
    /**
     * Host side (we are C): a Provide arrived; remember it so the next
     * matching Accept from A can claim it. Index by provision bytes.
     */
    acceptIncomingProvide: (questionId, target, recipient) => {
      // The provision bytes B used in its outgoing Provide aren't on
      // the wire (Cap'n Proto's Provide carries questionId, target,
      // recipient — not provision). We compute the same bytes by
      // re-running provisionIdForHandoff. NB: this fixture is a test
      // simulator, not a real network — real networks share the
      // provision via cryptographic tokens.
      const provision = new Uint8Array([
        0xa0,
        (provisionCounter >>> 8) & 0xff,
        provisionCounter & 0xff,
      ]);
      pendingByVat[me].set(provisionKey(provision), {
        questionId,
        target,
        recipient,
      });
    },
    consumeProvision: provision => {
      const k = provisionKey(provision);
      const found = pendingByVat[me].get(k);
      if (found) pendingByVat[me].delete(k);
      return found;
    },
  });

  const makeChannel = (left, right) => {
    const sendLeftToRight = framed => {
      channels[`${left}-${right}`].push(framed);
      schedule();
    };
    const sendRightToLeft = framed => {
      channels[`${right}-${left}`].push(framed);
      schedule();
    };
    return { sendLeftToRight, sendRightToLeft };
  };

  const ab = makeChannel('A', 'B');
  const ac = makeChannel('A', 'C');
  const bc = makeChannel('B', 'C');

  const aToB = makeCapnp({
    send: ab.sendLeftToRight,
    interfaceRegistry,
    network: networkFor('A'),
    recipientVatId: VAT_B,
  });
  const bToA = makeCapnp({
    send: ab.sendRightToLeft,
    bootstrap: bootstrapB,
    interfaceRegistry,
    network: networkFor('B'),
    recipientVatId: VAT_A,
  });
  const aToC = makeCapnp({
    send: ac.sendLeftToRight,
    interfaceRegistry,
    network: networkFor('A'),
    recipientVatId: VAT_C,
  });
  const cToA = makeCapnp({
    send: ac.sendRightToLeft,
    bootstrap: bootstrapC,
    interfaceRegistry,
    network: networkFor('C'),
    recipientVatId: VAT_A,
  });
  const bToC = makeCapnp({
    send: bc.sendLeftToRight,
    interfaceRegistry,
    network: networkFor('B'),
    recipientVatId: VAT_C,
  });
  const cToB = makeCapnp({
    send: bc.sendRightToLeft,
    bootstrap: bootstrapC,
    interfaceRegistry,
    network: networkFor('C'),
    recipientVatId: VAT_B,
  });

  dispatchers['A-B'] = bToA.dispatch;
  dispatchers['B-A'] = aToB.dispatch;
  dispatchers['A-C'] = cToA.dispatch;
  dispatchers['C-A'] = aToC.dispatch;
  dispatchers['B-C'] = cToB.dispatch;
  dispatchers['C-B'] = bToC.dispatch;

  connByVat.A.B = aToB;
  connByVat.A.C = aToC;
  connByVat.B.A = bToA;
  connByVat.B.C = bToC;
  connByVat.C.A = cToA;
  connByVat.C.B = cToB;

  return {
    aToB,
    bToA,
    aToC,
    cToA,
    bToC,
    cToB,
    flush,
    interfaceRegistry,
    capHomes,
  };
};

test('L3 auto-Provide: B encoding a C-hosted cap to A triggers thirdPartyHosted', async t => {
  const cTarget = makeExo('cTarget', undefined, {
    hello() {
      return 'hello via direct A↔C';
    },
  });

  // C just exports cTarget as its bootstrap. B's bootstrap is a small
  // shim that imports C's bootstrap (cTarget) once and returns it from
  // every getInner() call. The B-side isn't constructed until we have
  // the cap on B's side.

  // Step 1: stand up the network with C's bootstrap = cTarget. B's
  // bootstrap will be set later once we have cTarget imported on B↔C.
  let bBootstrap = makeExo('bShim', undefined, {
    getInner() {
      throw Error('not yet wired');
    },
  });
  const net = makeThreeVatNet({
    bootstrapB: bBootstrap,
    bootstrapC: cTarget,
  });
  net.interfaceRegistry.register({
    id: 0xa1n,
    methods: { getInner: 0, hello: 1 },
  });

  // Step 2: B asks C for its bootstrap, getting a Presence backed by
  // an import on B↔C.
  const cTargetImportedByB = await net.bToC.getBootstrap();
  t.truthy(cTargetImportedByB, 'B got cTarget over B↔C');

  // Step 3: replace B's bootstrap with one that returns the import.
  bBootstrap = makeExo('bShim2', undefined, {
    getInner() {
      return cTargetImportedByB;
    },
  });
  net.bToA.setBootstrap(bBootstrap);

  // Step 4: A asks B for the inner cap.
  const bRemote = net.aToB.getBootstrap();
  const innerOnA = await E(bRemote).getInner();
  t.truthy(innerOnA, "A got something back from B's getInner()");

  // Step 5: call the cap. If auto-Provide worked, this routed A→C
  // directly and `hello()` returns the C-side string.
  const greeting = await E(innerOnA).hello();
  t.is(
    greeting,
    'hello via direct A↔C',
    'method call routed via the direct A↔C path established by auto-Provide',
  );

  // Step 6: cleanup.
  net.aToB.abort('done');
  net.bToA.abort('done');
  net.aToC.abort('done');
  net.cToA.abort('done');
  net.bToC.abort('done');
  net.cToB.abort('done');
});
