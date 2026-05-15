// @ts-nocheck
/**
 * A-side embargo trigger detection.
 *
 * Companion to the host-side embargo test in `three-party.test.js`. This
 * file verifies that A *automatically* sets `embargo: true` on its
 * outgoing Accept (and emits the matching `Disembargo{accept}` on the
 * original A↔B connection) when it had pipelined calls in flight on a
 * promise that just resolved to a `thirdPartyHosted` cap.
 *
 * Flow:
 *   1. A imports an unsettled `senderPromise` from B (B's bootstrap is
 *      a never-settling Promise, so A's `getBootstrap()` returns a
 *      senderPromise descriptor that is never resolved by B).
 *   2. A pipelines a Call against the import — `connection.js#sendCall`
 *      flips the import entry's `hadPipelinedCalls` flag.
 *   3. We hand-dispatch a `Resolve { promiseId, cap: thirdPartyHosted }`
 *      into A, simulating B settling its promise to a cap-on-C.
 *   4. `dispatch.js#handleResolve` reads the flag and tells
 *      `acceptThirdParty` to set `embargo: true`.
 *   5. acceptThirdParty:
 *        a. Sends `Accept{embargo:true}` on the A↔C peer.
 *        b. Sends `Disembargo{target: importedCap{originalPromiseId},
 *           context: accept}` on the original A↔B connection.
 *
 * The negative test asserts the reverse: without a pipelined Call the
 * trigger does NOT fire (no Disembargo, Accept carries embargo:false).
 */

import test from '@endo/ses-ava/test.js';
import { E } from '@endo/eventual-send';
import {
  makeCapnp,
  makeInterfaceRegistry,
  makeCapHomeRegistry,
  encodeResolve,
  decodeMessage,
} from '../src/index.js';
import { withJsonCodecs } from './fixtures/json-codec.js';
import {
  bytesAsDataEncoder,
  bytesNetworkMock,
  decodeDataFromSlot,
} from './fixtures/l3-bytes-network.js';

const SERVICE_ID = 0xa1n;

/**
 * Build an A↔B real-channel pair plus a recording-only A↔C peer.
 * B's bootstrap is supplied by the caller (typically a never-settling
 * Promise so A's import is a senderPromise that never resolves on its
 * own — leaving the test free to hand-dispatch a Resolve carrying
 * `thirdPartyHosted` into A whenever it wants).
 *
 * @param {unknown} bootstrapB
 */
const setupNet = bootstrapB => {
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
  /** @type {ArrayBuffer[]} */
  const acOut = [];
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

  const aToC = makeCapnp({
    send: framed => acOut.push(framed),
    interfaceRegistry,
    capHomes,
    network: bytesNetworkMock({
      connectToThirdParty: () => {
        throw Error();
      },
    }),
  });
  const PROVISION = new Uint8Array([0xc0, 0xff]);
  const aToB = makeCapnp({
    send: framed => {
      aToBSent.push(framed);
      ab.push(framed);
      schedule();
    },
    interfaceRegistry,
    capHomes,
    network: bytesNetworkMock({
      connectToThirdParty: () => aToC,
      provisionIdForHandoff: () => PROVISION,
    }),
    recipientVatId: new Uint8Array(0),
  });
  const bToA = makeCapnp({
    send: framed => {
      ba.push(framed);
      schedule();
    },
    bootstrap: bootstrapB,
    interfaceRegistry,
    capHomes,
  });
  dispatchOf.A = aToB.dispatch;
  dispatchOf.B = bToA.dispatch;

  return {
    aToB,
    aToC,
    bToA,
    aToBSent,
    inboundToA,
    acOut,
    PROVISION,
  };
};

/**
 * Walk every inbound Return and return the first senderPromise descriptor's
 * id we see in any capTable. Used by the test to learn which import id
 * the senderPromise was given without having to peek at internals.
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

const drainTicks = async (n = 10) => {
  // First await is hoisted out of the loop so the @jessie.js no-nested-await
  // rule sees an unnested top-level await before the `await` inside the
  // for-loop body.
  await null;
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

test('A-side embargo: pipelined call on a senderPromise triggers Accept{embargo:true} + Disembargo{accept}', async t => {
  // B's bootstrap is an Exo. Its `getInner()` method returns an OBJECT
  // containing a never-settling Promise. The wrapping object lets B's
  // payload encoder treat the Promise as a child cap (emitting
  // `senderPromise` into the capTable) without HandledPromise.applyMethod
  // chaining through the unsettled Promise — which would block the
  // entire Return forever. The returned object is hardened so SES
  // pass-style accepts it as a copy record.
  const { makeExo } = await import('@endo/exo');
  const harden = (await import('@endo/harden')).default;
  const neverSettling = harden(new Promise(() => {}));
  const innerWrapper = harden({ p: neverSettling });
  const bExo = makeExo('b', undefined, {
    getInner() {
      return innerWrapper;
    },
  });
  const { aToB, aToC, aToBSent, inboundToA, acOut, PROVISION } = setupNet(bExo);

  // Step 1: bootstrap, then call getInner. B returns an object whose
  // `p` field is a senderPromise descriptor in capTable.
  const bootP = aToB.getBootstrap();
  bootP.catch(() => {});
  // Settle bootP first (so the subsequent E(bootP).getInner() doesn't
  // pipeline against a not-yet-settled bootstrap promise — pipelining
  // would dispatch via pipelineHandler whose target is promisedAnswer,
  // not a clean importedCap).
  await drainTicks(20);
  const bootPresence = await bootP;
  const innerObjP = E(bootPresence).getInner();
  innerObjP.catch(() => {});
  await drainTicks(20);

  const promiseImportId = sniffSenderPromiseId(inboundToA);
  t.truthy(
    promiseImportId !== undefined,
    'A received a senderPromise descriptor and imported it',
  );

  // Step 2: pipeline a Call directly against the senderPromise import.
  // `innerObjP` resolves to `{ p: <senderPromise import> }` — once
  // settled, `p` is the HandledPromise that wraps the import. Calling
  // E on it dispatches via the import's handler, which is the path
  // that triggers `sendCall(target=importedCap{promiseImportId})` and
  // flips the `hadPipelinedCalls` flag.
  const innerObj = await innerObjP;
  E(innerObj.p)
    .hello()
    .catch(() => {});
  await drainTicks(10);

  // Confirm at least one outgoing Call carries target=importedCap{id}.
  // (If the chain never reached importedCap dispatch, the embargo flag
  // wouldn't fire, and the rest of the test would fail — better to
  // surface that here with a clear assertion.)
  const calls = aToBSent
    .map(b => decodeMessage(b))
    .filter(m => m.type === 'call');
  const importedCapCalls = calls.filter(
    m => m.target.kind === 'importedCap' && m.target.id === promiseImportId,
  );
  t.true(
    importedCapCalls.length >= 1,
    `expected at least one Call with target=importedCap{${promiseImportId}}; ` +
      `saw ${calls.length} Calls overall`,
  );

  // Step 3: hand-dispatch a Resolve carrying thirdPartyHosted.
  const TPID = new Uint8Array([0x00, 0x01]);
  aToB.dispatch(
    encodeResolve({
      promiseId: promiseImportId,
      payload: {
        kind: 'cap',
        cap: {
          kind: 'thirdPartyHosted',
          vineId: 9999,
          encodeId: bytesAsDataEncoder(TPID),
        },
      },
    }),
  );
  await drainTicks();

  // Step 4: assert A emitted Disembargo{accept} on A↔B.
  const disembargoOnAB = aToBSent
    .map(b => decodeMessage(b))
    .find(
      m =>
        m.type === 'disembargo' &&
        m.context.kind === 'accept' &&
        m.target.kind === 'importedCap' &&
        m.target.id === promiseImportId,
    );
  t.truthy(
    disembargoOnAB,
    'A emitted Disembargo{accept} on A↔B targeting the senderPromise import id',
  );

  // Step 5: assert A emitted Accept{embargoId} on A↔C.
  const acceptMsg = acOut
    .map(b => decodeMessage(b))
    .find(m => m.type === 'accept');
  t.truthy(acceptMsg, 'A sent Accept on A↔C');
  // 2.0-dev widened Accept.embargo from Bool to a Data byte string
  // (ThirdPartyEmbargoId). A non-empty array means the host should park
  // the Return until the matching Disembargo arrives.
  t.true(
    acceptMsg.embargoId.length > 0,
    'Accept carried a non-empty embargoId',
  );
  t.deepEqual(
    Array.from(decodeDataFromSlot(acceptMsg.provisionSlot)),
    Array.from(PROVISION),
    'Accept used the provision the network minted',
  );
  // The Disembargo on A↔B must carry the same embargoId so B's forwarded
  // Disembargo can be matched by C against the parked Accept.
  t.deepEqual(
    Array.from(disembargoOnAB.context.embargoId),
    Array.from(acceptMsg.embargoId),
    'Disembargo{accept} embargoId matches Accept embargoId',
  );

  aToB.abort('done');
  aToC.abort('done');
});

test('A-side embargo NOT triggered when no pipelined calls fired before Resolve', async t => {
  const { makeExo } = await import('@endo/exo');
  const harden = (await import('@endo/harden')).default;
  const neverSettling = harden(new Promise(() => {}));
  const innerWrapper = harden({ p: neverSettling });
  const bExo = makeExo('b', undefined, {
    getInner() {
      return innerWrapper;
    },
  });
  const { aToB, aToC, aToBSent, inboundToA, acOut } = setupNet(bExo);

  const bootP = aToB.getBootstrap();
  bootP.catch(() => {});
  E(bootP)
    .getInner()
    .catch(() => {});
  await drainTicks(20);
  const promiseImportId = sniffSenderPromiseId(inboundToA);
  t.truthy(promiseImportId !== undefined, 'A received a senderPromise');

  // No pipelined Call — go straight from import to Resolve.
  aToB.dispatch(
    encodeResolve({
      promiseId: promiseImportId,
      payload: {
        kind: 'cap',
        cap: {
          kind: 'thirdPartyHosted',
          vineId: 9999,
          encodeId: bytesAsDataEncoder(new Uint8Array(0)),
        },
      },
    }),
  );
  await drainTicks();

  const disembargo = aToBSent
    .map(b => decodeMessage(b))
    .find(m => m.type === 'disembargo');
  t.is(disembargo, undefined, 'no Disembargo{accept} (nothing to drain)');

  const acceptMsg = acOut
    .map(b => decodeMessage(b))
    .find(m => m.type === 'accept');
  t.truthy(acceptMsg, 'Accept still went out (we still want the cap)');
  t.is(
    acceptMsg.embargoId.length,
    0,
    'Accept carried an empty embargoId (no embargo)',
  );

  aToB.abort('done');
  aToC.abort('done');
});
