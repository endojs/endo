// @ts-nocheck
/**
 * Vine fallback for L3 recipient-side Accept.
 *
 * Exercises the branches of `threeParty.acceptThirdParty` that don't get
 * hit by the existing host-side e2e test in `three-party.test.js`:
 *
 *   1. Direct A↔C path succeeds → Release the vine, return the direct cap.
 *   2. Direct path throws synchronously (network can't dial) → fall back
 *      to the vine import.
 *   3. Direct path's Accept Return is an exception (no such provision,
 *      host gone) → keep the vine alive and resolve to it.
 *
 * Built directly on `makeThreeParty` with hand-rolled deps so the test
 * doesn't drag the whole connection wiring in for what is fundamentally
 * a small dispatch-time decision.
 */

import test from '@endo/ses-ava/test.js';
import { makeThreeParty } from '../src/three-party.js';

const dummyEncodeReturn = arg => /** @type {any} */ (arg);

const makeMockCtx = (overrides = {}) => {
  const released = [];
  const importedVineIds = [];
  const ctx = {
    network: {
      thirdPartyCapIdForHost: () => new Uint8Array(0),
      connectToThirdParty: () => null,
      provisionIdForHandoff: () => new Uint8Array([0x01]),
      acceptIncomingProvide: () => {},
      consumeProvision: () => undefined,
    },
    encodeProvide: () => new ArrayBuffer(0),
    encodeDisembargo: () => new ArrayBuffer(0),
    encodeReturn: dummyEncodeReturn,
    sendFramed: () => {},
    sendRelease: id => released.push(id),
    importRegistry: {
      importCap: id => {
        importedVineIds.push(id);
        return { __isVinePresence: true, vineId: id };
      },
      importIdOf: () => undefined,
    },
    tables: {
      exports: new Map(),
    },
    questionIds: { alloc: () => 0, release: () => {} },
    exportRegistry: { exportValue: () => ({ id: 0 }) },
    payloadCodec: { encodeRoot: () => new Uint8Array(0) },
    ...overrides,
  };
  return { ctx, released, importedVineIds };
};

test('vine fallback: sendAccept Return is an exception → resolves to vine', async t => {
  const { ctx, released, importedVineIds } = makeMockCtx({
    network: {
      thirdPartyCapIdForHost: () => new Uint8Array(0),
      connectToThirdParty: () => ({
        sendAccept: () => Promise.reject(Error('unknown provision')),
      }),
      provisionIdForHandoff: () => new Uint8Array([0x01]),
      acceptIncomingProvide: () => {},
      consumeProvision: () => undefined,
    },
  });
  const tp = makeThreeParty(ctx);

  const resolved = await tp.acceptThirdParty({
    thirdPartyCapId: new Uint8Array(0),
    vineId: 42,
  });

  t.deepEqual(importedVineIds, [42], 'vine was imported eagerly');
  t.true(resolved.__isVinePresence, 'resolved value is the vine Presence');
  t.is(resolved.vineId, 42);
  t.deepEqual(released, [], 'vine NOT released — it is now the live path');
});

test('vine fallback: connectToThirdParty throws → resolves to vine', async t => {
  const { ctx, released, importedVineIds } = makeMockCtx({
    network: {
      thirdPartyCapIdForHost: () => new Uint8Array(0),
      connectToThirdParty: () => {
        throw Error('no route to host');
      },
      provisionIdForHandoff: () => new Uint8Array([0x01]),
      acceptIncomingProvide: () => {},
      consumeProvision: () => undefined,
    },
  });
  const tp = makeThreeParty(ctx);

  const resolved = await tp.acceptThirdParty({
    thirdPartyCapId: new Uint8Array(0),
    vineId: 7,
  });

  t.deepEqual(importedVineIds, [7]);
  t.true(resolved.__isVinePresence);
  t.deepEqual(released, []);
});

test('vine fallback: connectToThirdParty returns a peer without sendAccept → vine', async t => {
  const { ctx, importedVineIds } = makeMockCtx({
    network: {
      thirdPartyCapIdForHost: () => new Uint8Array(0),
      connectToThirdParty: () => ({}),
      provisionIdForHandoff: () => new Uint8Array([0x01]),
      acceptIncomingProvide: () => {},
      consumeProvision: () => undefined,
    },
  });
  const tp = makeThreeParty(ctx);

  const resolved = await tp.acceptThirdParty({
    thirdPartyCapId: new Uint8Array(0),
    vineId: 11,
  });
  t.deepEqual(importedVineIds, [11]);
  t.true(resolved.__isVinePresence);
});

test('direct path success: Release the vine and resolve to the direct cap', async t => {
  const directCap = { __direct: true };
  const { ctx, released } = makeMockCtx({
    network: {
      thirdPartyCapIdForHost: () => new Uint8Array(0),
      connectToThirdParty: () => ({
        sendAccept: () => Promise.resolve(directCap),
      }),
      provisionIdForHandoff: () => new Uint8Array([0x01]),
      acceptIncomingProvide: () => {},
      consumeProvision: () => undefined,
    },
  });
  const tp = makeThreeParty(ctx);

  const resolved = await tp.acceptThirdParty({
    thirdPartyCapId: new Uint8Array(0),
    vineId: 99,
  });

  t.is(resolved, directCap, 'resolved to the direct cap');
  t.deepEqual(released, [99], 'vine released exactly once');
});

test('direct path success: sendRelease throws → still returns the direct cap', async t => {
  const directCap = { __direct: true };
  const { ctx } = makeMockCtx({
    sendRelease: () => {
      throw Error('connection aborted');
    },
    network: {
      thirdPartyCapIdForHost: () => new Uint8Array(0),
      connectToThirdParty: () => ({
        sendAccept: () => Promise.resolve(directCap),
      }),
      provisionIdForHandoff: () => new Uint8Array([0x01]),
      acceptIncomingProvide: () => {},
      consumeProvision: () => undefined,
    },
  });
  const tp = makeThreeParty(ctx);

  const resolved = await tp.acceptThirdParty({
    thirdPartyCapId: new Uint8Array(0),
    vineId: 13,
  });

  t.is(resolved, directCap, 'vine release failure is non-fatal');
});
