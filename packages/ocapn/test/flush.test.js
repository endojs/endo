// @ts-check

import harden from '@endo/harden';
import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/marshal';
import { HandledPromise } from '@endo/eventual-send';
import { makeSlot } from '../src/captp/pairwise.js';
import { makeOcapnTable } from '../src/captp/ocapn-tables.js';
import {
  makeGrantTracker,
  makeGrantDetails,
} from '../src/client/grant-tracker.js';
import { makeReferenceKit } from '../src/client/ref-kit.js';
import { makeSturdyRefTracker } from '../src/client/sturdyrefs.js';
import { exporterLocation, receiverLocation } from './codecs/_codecs_util.js';

/**
 * @typedef {{ position: bigint, resolver: unknown }} FlushCall
 */

/**
 * @param {boolean} enableExperimentalFeatureFlush
 * @returns {{ referenceKit: import('../src/client/ref-kit.js').ReferenceKit, flushCalls: FlushCall[], grantTracker: import('../src/client/grant-tracker.js').GrantTracker }}
 */
const makeFlushTestReferenceKit = enableExperimentalFeatureFlush => {
  const verbose = false;
  const logger = harden({
    log: () => {},
    error: () => {},
    info: (...args) => verbose && console.info(...args),
  });

  const peerLocation = receiverLocation;

  const makeRemoteKit = (targetSlot, mode = 'deliver') => {
    const handler = {
      get() {
        throw Error('OCapN GET: Not implemented for flush test');
      },
      applyFunction() {
        throw Error('OCapN APPLY FUNCTION: Not implemented for flush test');
      },
      applyMethod() {
        throw Error('OCapN APPLY METHOD: Not implemented for flush test');
      },
    };
    /** @type {import('@endo/eventual-send').Settler | undefined} */
    let settler;
    const executor = (resolve, reject, resolveWithPresence) => {
      settler = Far('settler', {
        resolve,
        reject,
        resolveWithPresence: () => resolveWithPresence(handler),
      });
    };
    const promise = new HandledPromise(executor, handler);
    assert(settler);
    return harden({ promise, settler });
  };

  const swissnumTable = new Map();
  const sturdyRefTracker = makeSturdyRefTracker(swissnumTable);
  const grantTracker = makeGrantTracker();

  const importHook = (val, slot) => {
    const grantDetails = makeGrantDetails(peerLocation, slot);
    grantTracker.recordImport(val, grantDetails);
  };
  const exportHook = () => {};
  const slotCollectedHook = () => {};

  const ocapnTable = makeOcapnTable({
    importHook,
    exportHook,
    onSlotCollected: slotCollectedHook,
  });

  /** @type {FlushCall[]} */
  const flushCalls = [];
  const sendHandoff = () => {
    throw Error('sendHandoff not used in flush test');
  };
  const sendFlush = (position, resolver) => {
    flushCalls.push({ position, resolver });
  };

  const referenceKit = makeReferenceKit(
    logger,
    peerLocation,
    ocapnTable,
    grantTracker,
    sturdyRefTracker,
    makeRemoteKit,
    async () => {},
    sendHandoff,
    sendFlush,
    enableExperimentalFeatureFlush,
  );

  return { referenceKit, flushCalls, grantTracker };
};

/**
 * Grant imported from the peer (same {@link receiverLocation} as the kit) — no flush.
 *
 * @param {import('../src/client/grant-tracker.js').GrantTracker} grantTracker
 * @param {bigint} exportPosition
 */
const recordPeerHandoffTarget = (grantTracker, exportPosition) => {
  const val = Far('PeerGrant', {});
  const slot = makeSlot('o', false, exportPosition);
  grantTracker.recordImport(
    val,
    makeGrantDetails(receiverLocation, slot, 'handoff'),
  );
  return val;
};

/**
 * HandledPromise that shortens to `Promise.resolve(value)` then fulfills with `value`.
 *
 * @param {unknown} value
 */
const makeShorteningPromiseToValue = value =>
  new HandledPromise(resolve => {
    resolve(Promise.resolve(value));
  });

/**
 * @param {import('../src/client/grant-tracker.js').GrantTracker} grantTracker
 * @param {bigint} exportPosition
 */
const recordThirdPartyHandoffTarget = (grantTracker, exportPosition) => {
  const handoff = Far('Handoff', {});
  const slot = makeSlot('o', false, exportPosition);
  grantTracker.recordImport(
    handoff,
    makeGrantDetails(exporterLocation, slot, 'handoff'),
  );
  return handoff;
};

/**
 * HandledPromise that first shortens to `Promise.resolve(handoff)` (per-node
 * pipelining), then fulfills with the handoff target.
 *
 * @param {object} handoff
 */
const makeShorteningPromiseTo = handoff =>
  makeShorteningPromiseToValue(handoff);

const fulfillFlushAck = /** @param {FlushCall} flushCall */ flushCall => {
  /** @type {{ fulfill: (v: unknown) => void }} */ (flushCall.resolver).fulfill(
    undefined,
  );
};

test('makeLocalAnswerPromiseAndFulfill does not sendFlush (shortening uses forwardLocalPromiseResolutionToRemoteResolver)', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const handoff = Far('Handoff', {});
  const slot = makeSlot('o', false, 99n);
  grantTracker.recordImport(
    handoff,
    makeGrantDetails(exporterLocation, slot, 'handoff'),
  );

  await referenceKit.makeLocalAnswerPromiseAndFulfill(
    1n,
    Promise.resolve(handoff),
  );

  t.is(flushCalls.length, 0);
});

test('op:deliver forward… third-party handoff target (direct resolution) sendFlush', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const handoff = recordThirdPartyHandoffTarget(grantTracker, 99n);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(4n);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    Promise.resolve(handoff),
    resolveMeDesc,
    true,
  );
  await undefined;

  t.is(flushCalls.length, 1);
  t.is(
    flushCalls[0].position,
    4n,
    'flush targets peer export slot of resolveMeDesc',
  );
  fulfillFlushAck(flushCalls[0]);
});

test('op:deliver forward… third-party handoff via promise shortening sendFlush', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const handoff = recordThirdPartyHandoffTarget(grantTracker, 98n);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(40n);
  const outer = makeShorteningPromiseTo(handoff);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    outer,
    resolveMeDesc,
    true,
  );
  await outer;

  t.is(flushCalls.length, 1);
  t.is(flushCalls[0].position, 40n);
  fulfillFlushAck(flushCalls[0]);
});

test('op:listen wantsPartial false — third-party handoff target (direct) sendFlush', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const handoff = recordThirdPartyHandoffTarget(grantTracker, 88n);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(3n);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    Promise.resolve(handoff),
    resolveMeDesc,
    false,
  );
  await undefined;

  t.is(flushCalls.length, 1);
  t.is(flushCalls[0].position, 3n);
  fulfillFlushAck(flushCalls[0]);
});

test('op:listen wantsPartial false — third-party handoff via promise shortening sendFlush', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const handoff = recordThirdPartyHandoffTarget(grantTracker, 87n);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(30n);
  const outer = makeShorteningPromiseTo(handoff);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    outer,
    resolveMeDesc,
    false,
  );
  await outer;

  t.is(flushCalls.length, 1);
  t.is(flushCalls[0].position, 30n);
  fulfillFlushAck(flushCalls[0]);
});

test('op:listen wantsPartial true — third-party handoff target (direct) sendFlush', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const handoff = recordThirdPartyHandoffTarget(grantTracker, 77n);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(5n);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    Promise.resolve(handoff),
    resolveMeDesc,
    true,
  );
  await undefined;

  t.is(flushCalls.length, 1);
  fulfillFlushAck(flushCalls[0]);
});

test('op:listen wantsPartial true — third-party handoff via promise shortening sendFlush', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const handoff = recordThirdPartyHandoffTarget(grantTracker, 76n);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(50n);
  const outer = makeShorteningPromiseTo(handoff);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    outer,
    resolveMeDesc,
    true,
  );
  await outer;

  t.is(flushCalls.length, 1);
  t.is(flushCalls[0].position, 50n);
  fulfillFlushAck(flushCalls[0]);
});

test('op:deliver does not sendFlush for peer handoff target (direct)', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const val = recordPeerHandoffTarget(grantTracker, 61n);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(11n);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    Promise.resolve(val),
    resolveMeDesc,
    true,
  );
  await undefined;

  t.is(flushCalls.length, 0);
});

test('op:deliver does not sendFlush for peer handoff target (promise shortening)', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const val = recordPeerHandoffTarget(grantTracker, 62n);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(12n);
  const outer = makeShorteningPromiseToValue(val);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    outer,
    resolveMeDesc,
    true,
  );
  await outer;

  t.is(flushCalls.length, 0);
});

test('op:deliver does not sendFlush for primitive (direct)', async t => {
  const { referenceKit, flushCalls } = makeFlushTestReferenceKit(true);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(13n);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    Promise.resolve(-0),
    resolveMeDesc,
    true,
  );
  await undefined;

  t.is(flushCalls.length, 0);
});

test('op:deliver does not sendFlush for primitive (promise shortening)', async t => {
  const { referenceKit, flushCalls } = makeFlushTestReferenceKit(true);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(14n);
  const outer = makeShorteningPromiseToValue(99);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    outer,
    resolveMeDesc,
    true,
  );
  await outer;

  t.is(flushCalls.length, 0);
});

test('op:listen wantsPartial false does not sendFlush for peer handoff (direct)', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const val = recordPeerHandoffTarget(grantTracker, 63n);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(15n);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    Promise.resolve(val),
    resolveMeDesc,
    false,
  );
  await undefined;

  t.is(flushCalls.length, 0);
});

test('op:listen wantsPartial false does not sendFlush for peer handoff (promise shortening)', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const val = recordPeerHandoffTarget(grantTracker, 64n);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(16n);
  const outer = makeShorteningPromiseToValue(val);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    outer,
    resolveMeDesc,
    false,
  );
  await outer;

  t.is(flushCalls.length, 0);
});

test('op:listen wantsPartial false does not sendFlush for primitive (direct)', async t => {
  const { referenceKit, flushCalls } = makeFlushTestReferenceKit(true);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(17n);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    Promise.resolve('primitive'),
    resolveMeDesc,
    false,
  );
  await undefined;

  t.is(flushCalls.length, 0);
});

test('op:listen wantsPartial false does not sendFlush for primitive (promise shortening)', async t => {
  const { referenceKit, flushCalls } = makeFlushTestReferenceKit(true);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(18n);
  const outer = makeShorteningPromiseToValue(100);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    outer,
    resolveMeDesc,
    false,
  );
  await outer;

  t.is(flushCalls.length, 0);
});

test('op:listen wantsPartial true does not sendFlush for peer handoff (direct)', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const val = recordPeerHandoffTarget(grantTracker, 65n);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(19n);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    Promise.resolve(val),
    resolveMeDesc,
    true,
  );
  await undefined;

  t.is(flushCalls.length, 0);
});

test('op:listen wantsPartial true does not sendFlush for peer handoff (promise shortening)', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(true);
  const val = recordPeerHandoffTarget(grantTracker, 66n);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(20n);
  const outer = makeShorteningPromiseToValue(val);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    outer,
    resolveMeDesc,
    true,
  );
  await outer;

  t.is(flushCalls.length, 0);
});

test('op:listen wantsPartial true does not sendFlush for primitive (direct)', async t => {
  const { referenceKit, flushCalls } = makeFlushTestReferenceKit(true);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(21n);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    Promise.resolve(Symbol.for('flush.test.prim')),
    resolveMeDesc,
    true,
  );
  await undefined;

  t.is(flushCalls.length, 0);
});

test('op:listen wantsPartial true does not sendFlush for primitive (promise shortening)', async t => {
  const { referenceKit, flushCalls } = makeFlushTestReferenceKit(true);
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(22n);
  const outer = makeShorteningPromiseToValue(101);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    outer,
    resolveMeDesc,
    true,
  );
  await outer;

  t.is(flushCalls.length, 0);
});

test('forwardLocalPromiseResolutionToRemoteResolver does not sendFlush for third-party grant when experimental flush is off', async t => {
  const { referenceKit, flushCalls, grantTracker } =
    makeFlushTestReferenceKit(false);
  const handoff = Far('Handoff', {});
  const slot = makeSlot('o', false, 100n);
  grantTracker.recordImport(
    handoff,
    makeGrantDetails(exporterLocation, slot, 'handoff'),
  );
  const resolveMeDesc = referenceKit.provideRemoteResolverValue(6n);

  referenceKit.forwardLocalPromiseResolutionToRemoteResolver(
    Promise.resolve(handoff),
    resolveMeDesc,
    true,
  );
  await undefined;

  t.is(flushCalls.length, 0);
});
