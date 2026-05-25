// @ts-nocheck
/* global setTimeout */
// Coverage-gap tests identified during the comprehensive review (T1, T2,
// T4, T5).  Each test pins behaviour we'd previously left implicit.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';

const makePair = bMain => {
  const { a, b } = makeLoopbackPair();
  return {
    sessionA: makeCapnWebSession(a, { gcImports: false }),
    sessionB: makeCapnWebSession(b, { localMain: bMain, gcImports: false }),
  };
};

// ---------- T1: Promise-resolves-to-presence identity ----------

test('T1: server promise that resolves to a Far yields a stable presence', async t => {
  const stable = Far('stable', { kind: () => 'stable' });
  const { sessionA } = makePair(
    Far('s', {
      // First call returns a promise that eventually resolves to `stable`.
      defer: () =>
        new Promise(resolve => setTimeout(() => resolve(stable), 10)),
      // Second call returns the same `stable` directly.
      direct: () => stable,
    }),
  );
  const r = sessionA.getRemoteMain();
  const fromPromise = await E(r).defer();
  const fromDirect = await E(r).direct();
  // Both routes ultimately deliver the same logical capability; identity is
  // preserved across our session's tables.
  t.is(fromPromise, fromDirect);
  t.is(await E(fromPromise).kind(), 'stable');
});

// ---------- T2: refcount > 1 release semantics ----------

test('T2: same value exported multiple times bumps a single refcount', async t => {
  // Send the same cap five times; A's exports table should hold ONE
  // entry whose refcount has been bumped to 5 (not five separate
  // entries).
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', { take: _ => null }),
    gcImports: false,
  });
  const cap = Far('cap', { id: () => 'k' });
  const r = sessionA.getRemoteMain();
  // Five sequential pushes — `await Promise.all([...])` would also work
  // but the eager-fire-then-collect pattern below is what the test
  // intends to exercise.
  // eslint-disable-next-line no-await-in-loop
  for (let i = 0; i < 5; i += 1) await E(r).take(cap);
  // exports = main(0) + cap(-1) → 2 entries (refcount 5 on cap).
  t.is(sessionA.getStats().exports, 2);
});

test('T2b: release with refcount exactly equal frees the export', async t => {
  // Inject the release via the transport-side hook to verify a multi-
  // refcount release frees a single export.
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', { take: _ => null }),
    gcImports: false,
  });
  const cap = Far('cap', { id: () => 'k' });
  const r = sessionA.getRemoteMain();
  await E(r).take(cap);
  await E(r).take(cap);
  await E(r).take(cap);
  // A's exports: main(0) + cap(-1) → 2 entries; cap entry refcount=3.
  t.is(sessionA.getStats().exports, 2);
  // Inject a release-of-3 from B → A.  cap drops to 0; entry removed.
  await new Promise(resolve => setTimeout(resolve, 0));
  await b.send(JSON.stringify(['release', -1, 3]));
  await new Promise(resolve => setTimeout(resolve, 50));
  t.is(sessionA.getStats().exports, 1); // main only
});

test('T2c: partial release keeps the export alive', async t => {
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', { take: _ => null }),
    gcImports: false,
  });
  const cap = Far('cap', { id: () => 'k' });
  const r = sessionA.getRemoteMain();
  await E(r).take(cap);
  await E(r).take(cap);
  await E(r).take(cap);
  await E(r).take(cap);
  await E(r).take(cap); // refcount=5
  // Release 2: still alive.
  await b.send(JSON.stringify(['release', -1, 2]));
  await new Promise(resolve => setTimeout(resolve, 30));
  t.is(sessionA.getStats().exports, 2); // main + cap
  // Release another 3: drops to 0, entry removed.
  await b.send(JSON.stringify(['release', -1, 3]));
  await new Promise(resolve => setTimeout(resolve, 30));
  t.is(sessionA.getStats().exports, 1); // main only
});

// ---------- T4: callRemap on a non-array singleton ----------

test('T4: callRemap on a non-array result applies the mapper once', async t => {
  // capnweb's apply-map handles single objects and arrays; verify ours
  // does too via the path-form descriptor.
  const item = Far('item', { name: () => 'just-one' });
  const { sessionA } = makePair(
    Far('s', {
      getOne: () => item, // returns a single Far, not an array
    }),
  );
  const r = sessionA.getRemoteMain();
  const result = await sessionA.callRemap(
    { stub: r, path: ['getOne'], args: [] },
    x => x.name(),
  );
  // Singleton: our session resolves the path then runs the mapper once on
  // the single result.  No array wrapping.
  t.is(result, 'just-one');
});

// ---------- T5: callRemap with stub captures ----------

test('T5: recordRemap captures a stub passed as a method argument', async t => {
  // The mapper's lexical scope contains a stub reference (`bonus`); the
  // mapper passes it as an argument to a method call on the input.  The
  // recorder captures `bonus`; on the wire it's devalued as
  // ["export", -id] so the peer sees a presence stub for it.  The
  // peer's items.combine method receives bonus as a (remote-presence)
  // stub and uses E() to invoke methods on it — calls forward back
  // through the session to our local Far.
  const bonus = Far('bonus', { value: () => 1000 });
  const items = [
    Far('a', { combine: async helper => `a+${await E(helper).value()}` }),
    Far('b', { combine: async helper => `b+${await E(helper).value()}` }),
  ];
  const { sessionA } = makePair(Far('s', { getItems: () => items }));
  const r = sessionA.getRemoteMain();
  const promises = await sessionA.callRemap(
    { stub: r, path: ['getItems'], args: [] },
    x => x.combine(bonus),
  );
  const out = Array.isArray(promises)
    ? await Promise.all(promises)
    : [promises];
  t.deepEqual(out, ['a+1000', 'b+1000']);
});

test('T5b: recordRemap inlines primitive captures in the args expression', async t => {
  // Primitive arg in the mapper body is encoded inline (no captures
  // entry).  Verifies the inline-vs-captures dispatch in encodeArg.
  const items = [
    Far('a', { add: x => 100 + x }),
    Far('b', { add: x => 200 + x }),
  ];
  const { sessionA } = makePair(Far('s', { getItems: () => items }));
  const r = sessionA.getRemoteMain();
  const offset = 7;
  const promises = await sessionA.callRemap(
    { stub: r, path: ['getItems'], args: [] },
    x => x.add(offset),
  );
  const out = Array.isArray(promises)
    ? await Promise.all(promises)
    : [promises];
  t.deepEqual(out, [107, 207]);
});
