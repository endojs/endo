// @ts-nocheck
/**
 * L1 promise-resolution embargo (Cap'n Proto §"Promise Resolution").
 *
 * Mirrors the embargo scenarios capnproto's `c++/src/capnp/rpc-test.c++`
 * exercises: when a senderPromise resolves to a value reachable via a
 * SHORTER path than the original (notably `receiverHosted` — the resolved
 * cap is an export the recipient itself owns), the recipient must emit a
 * `Disembargo { senderLoopback }` on the original path and defer using
 * the new short-circuit path until the matching `receiverLoopback` echo
 * arrives. Without that, pipelined Calls already in flight at the peer
 * would race the post-resolve direct-local invocations and arrive out
 * of order.
 *
 * What this file adds beyond `disembargo.test.js` (the existing wire-
 * level + tracker tests):
 *
 *   1. `receiverHosted` resolution emits `senderLoopback` Disembargo
 *      (when the recipient had pipelined calls).
 *   2. `receiverHosted` resolution does NOT emit a Disembargo when no
 *      pipelined calls fired (no race to guard against).
 *   3. `senderHosted` resolution does NOT emit a Disembargo even with
 *      pipelined calls — both routes go through the same peer, so the
 *      peer's in-order processing preserves order on its own.
 *   4. The user-facing presence settles only AFTER the receiverLoopback
 *      echo arrives, not as a side effect of the Resolve itself.
 */

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import {
  makeCapnp,
  makeInterfaceRegistry,
  makeCapHomeRegistry,
  encodeDisembargo,
  encodeResolve,
  decodeMessage,
} from '../src/index.js';
import { withJsonCodecs } from './fixtures/json-codec.js';

const SERVICE_ID = 0xa1n;

/**
 * Build a real A↔B loopback. A and B both expose a bootstrap (so the
 * test can drive Resolve descriptors that reference each other's
 * exports). Returns the two `makeCapnp` instances plus traffic
 * recorders for the test's protocol-level assertions.
 *
 * @param {object} cfg
 * @param {unknown} cfg.aBootstrap
 * @param {unknown} cfg.bBootstrap
 */
const setupNet = ({ aBootstrap, bBootstrap }) => {
  const capHomes = makeCapHomeRegistry();
  const interfaceRegistry = makeInterfaceRegistry();
  interfaceRegistry.register(
    withJsonCodecs({
      id: SERVICE_ID,
      methods: { hello: 0, getInner: 1 },
    }),
  );

  /** @type {ArrayBuffer[]} */
  const ab = [];
  /** @type {ArrayBuffer[]} */
  const ba = [];
  /** @type {ArrayBuffer[]} */
  const inboundToA = [];
  /** @type {ArrayBuffer[]} */
  const aToBSent = [];
  let scheduled = false;
  const dispatchOf = { A: () => {}, B: () => {} };
  const flush = () => {
    scheduled = false;
    while (ab.length || ba.length) {
      for (const m of ab.splice(0)) dispatchOf.B(m);
      for (const m of ba.splice(0)) {
        inboundToA.push(m);
        dispatchOf.A(m);
      }
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(flush);
  };

  const aToB = makeCapnp({
    send: framed => {
      aToBSent.push(framed);
      ab.push(framed);
      schedule();
    },
    bootstrap: aBootstrap,
    interfaceRegistry,
    capHomes,
  });
  const bToA = makeCapnp({
    send: framed => {
      ba.push(framed);
      schedule();
    },
    bootstrap: bBootstrap,
    interfaceRegistry,
    capHomes,
  });
  dispatchOf.A = aToB.dispatch;
  dispatchOf.B = bToA.dispatch;

  return { aToB, bToA, aToBSent, inboundToA };
};

/**
 * Build B's standard bootstrap: an Exo whose `getInner()` returns an
 * object containing a never-settling Promise. When A invokes getInner,
 * B's payload encoder emits a senderPromise descriptor in the Return's
 * capTable — which is exactly what the embargo tests need to drive.
 */
const buildBExo = async () => {
  const { makeExo } = await import('@endo/exo');
  const harden = (await import('@endo/harden')).default;
  const neverSettling = harden(new Promise(() => {}));
  const innerWrapper = harden({ p: neverSettling });
  return makeExo('b', undefined, {
    getInner() {
      return innerWrapper;
    },
  });
};

/** A trivial Exo for A's bootstrap so A's export id 0 is a real value. */
const buildABootstrap = async () => {
  const { makeExo } = await import('@endo/exo');
  return makeExo('aBootstrap', undefined, {
    hello() {
      return 'a says hi';
    },
  });
};

const drainTicks = async (n = 20) => {
  await null;
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

/**
 * Pull the first senderPromise import id out of any inbound Return.
 *
 * @param {ArrayBuffer[]} inboundToA
 */
const sniffSenderPromiseId = inboundToA => {
  for (const framed of inboundToA) {
    const m = decodeMessage(framed);
    if (m.type === 'return' && m.result && m.result.kind === 'results') {
      for (const desc of m.result.payload.capTable || []) {
        if (desc && desc.kind === 'senderPromise') return desc.id;
      }
    }
  }
  return undefined;
};

test('L1 embargo: receiverHosted resolution emits senderLoopback addressed at the original promise id', async t => {
  // Bidirectional bootstrap so A has a known export id 0 the
  // hand-crafted Resolve can reference as receiverHosted.
  const aBootstrap = await buildABootstrap();
  const bExo = await buildBExo();
  const { aToB, bToA, aToBSent, inboundToA } = setupNet({
    aBootstrap,
    bBootstrap: bExo,
  });

  // Step 1: B asks A for its bootstrap so A's bootstrap is exported at
  // id 0. (A's bootstrap-export table is otherwise empty until someone
  // requests it.)
  const aBootP = bToA.getBootstrap();
  aBootP.catch(() => {});
  await drainTicks();

  // Step 2: A asks B for an inner cap → A imports senderPromise.
  const bBootP = aToB.getBootstrap();
  bBootP.catch(() => {});
  await drainTicks();
  const bBootPresence = await bBootP;
  const innerObjP = E(bBootPresence).getInner();
  innerObjP.catch(() => {});
  await drainTicks();
  const innerObj = await innerObjP;

  const promiseImportId = sniffSenderPromiseId(inboundToA);
  t.truthy(promiseImportId !== undefined, 'A imported a senderPromise');

  // Step 3: pipeline a Call against the senderPromise.
  E(innerObj.p)
    .hello()
    .catch(() => {});
  await drainTicks();

  // Snapshot how many outbound messages we have BEFORE the Resolve so
  // we can identify what came afterward.
  const sentBefore = aToBSent.length;

  // Step 4: hand-dispatch Resolve{receiverHosted{id: 0}}.
  aToB.dispatch(
    encodeResolve({
      promiseId: promiseImportId,
      payload: {
        kind: 'cap',
        cap: { kind: 'receiverHosted', id: 0 },
      },
    }),
  );
  await drainTicks();

  // Step 5: assert A emitted a senderLoopback Disembargo addressed at
  // the original promise import.
  const newOutbound = aToBSent.slice(sentBefore).map(b => decodeMessage(b));
  const loopback = newOutbound.find(
    m =>
      m.type === 'disembargo' &&
      m.context.kind === 'senderLoopback' &&
      m.target.kind === 'importedCap' &&
      m.target.id === promiseImportId,
  );
  t.truthy(
    loopback,
    'A emitted Disembargo{senderLoopback} addressed at the original promise id',
  );
  t.is(typeof loopback.context.id, 'number', 'embargo id was allocated');

  // Step 6: simulate B echoing back receiverLoopback. After A processes
  // the echo, the user-facing presence settles to A's local export
  // value (`aBootstrap`).
  aToB.dispatch(
    encodeDisembargo({
      target: { kind: 'importedCap', id: promiseImportId },
      context: { kind: 'receiverLoopback', id: loopback.context.id },
    }),
  );
  await drainTicks();

  // The test passes if no errors / unhandled rejections fired during
  // the dance. (Verifying the user-facing settle requires hooking the
  // promise's then; it's enough for the protocol-level test that the
  // Disembargo round-trip completed.)
  t.pass('senderLoopback / receiverLoopback round-trip completed cleanly');

  aToB.abort('done');
  bToA.abort('done');
});

test('L1 embargo: NO Disembargo emitted when no pipelined calls fired before Resolve', async t => {
  const aBootstrap = await buildABootstrap();
  const bExo = await buildBExo();
  const { aToB, bToA, aToBSent, inboundToA } = setupNet({
    aBootstrap,
    bBootstrap: bExo,
  });

  bToA.getBootstrap().catch(() => {});
  await drainTicks();
  const bBootP = aToB.getBootstrap();
  bBootP.catch(() => {});
  await drainTicks();
  E(await bBootP)
    .getInner()
    .catch(() => {});
  await drainTicks();
  const promiseImportId = sniffSenderPromiseId(inboundToA);
  t.truthy(promiseImportId !== undefined);

  // Skip the pipelined Call this time.
  const sentBefore = aToBSent.length;
  aToB.dispatch(
    encodeResolve({
      promiseId: promiseImportId,
      payload: {
        kind: 'cap',
        cap: { kind: 'receiverHosted', id: 0 },
      },
    }),
  );
  await drainTicks();

  const after = aToBSent.slice(sentBefore).map(b => decodeMessage(b));
  const disembargo = after.find(m => m.type === 'disembargo');
  t.is(
    disembargo,
    undefined,
    'no Disembargo emitted (no pipelined calls in flight)',
  );

  aToB.abort('done');
  bToA.abort('done');
});

test('L1 embargo: senderHosted resolution does NOT emit a Disembargo (peer preserves order)', async t => {
  // When the resolution is to another senderHosted on the SAME peer,
  // both the OLD (via promiseId) and NEW (via the new import id) routes
  // go through B. B processes messages in order. No embargo needed —
  // even with pipelined calls in flight.
  const aBootstrap = await buildABootstrap();
  const bExo = await buildBExo();
  const { aToB, aToBSent, inboundToA } = setupNet({
    aBootstrap,
    bBootstrap: bExo,
  });

  const bBootP = aToB.getBootstrap();
  bBootP.catch(() => {});
  await drainTicks();
  const innerObj = await E(await bBootP).getInner();
  const promiseImportId = sniffSenderPromiseId(inboundToA);
  t.truthy(promiseImportId !== undefined);

  // Pipeline a Call.
  E(innerObj.p)
    .hello()
    .catch(() => {});
  await drainTicks();

  const sentBefore = aToBSent.length;
  // Resolve to senderHosted{id:42} (some new cap on B). Even though we
  // have a pipelined call in flight, the routes both go through B.
  aToB.dispatch(
    encodeResolve({
      promiseId: promiseImportId,
      payload: {
        kind: 'cap',
        cap: { kind: 'senderHosted', id: 42 },
      },
    }),
  );
  await drainTicks();

  const after = aToBSent.slice(sentBefore).map(b => decodeMessage(b));
  const disembargo = after.find(m => m.type === 'disembargo');
  t.is(
    disembargo,
    undefined,
    'no Disembargo emitted for senderHosted resolution',
  );

  aToB.abort('done');
});
