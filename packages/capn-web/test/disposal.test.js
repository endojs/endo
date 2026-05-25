// @ts-nocheck
/* global setTimeout */
import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';

const makePair = bMain => {
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  const sessionB = makeCapnWebSession(b, {
    localMain: bMain,
    gcImports: false,
  });
  return { sessionA, sessionB };
};

test('abort propagates: outstanding pushes reject', async t => {
  const slow = Far('slow', {
    forever: () => new Promise(() => {}),
  });
  const { sessionA, sessionB } = makePair(slow);
  sessionB;
  const r = sessionA.getRemoteMain();
  const p = E(r).forever();
  // Suppress unhandled rejection warning before aborting.
  p.catch(() => {});
  sessionA.abort();
  let rejected = false;
  try {
    await p;
  } catch (_e) {
    rejected = true;
  }
  t.true(rejected);
});

test('local abort closes peer cleanly', async t => {
  const { sessionA, sessionB } = makePair(Far('s', { ping: () => 'pong' }));
  const r = sessionA.getRemoteMain();
  t.is(await E(r).ping(), 'pong');
  sessionA.abort();
  // Wait for the abort to propagate.
  await new Promise(resolve => setTimeout(resolve, 50));
  t.true(sessionA.isAborted());
  t.true(sessionB.isAborted());
});

test('makeExo instance is exported by reference', async t => {
  let count = 0;
  const counter = makeExo('counter', undefined, {
    incr() {
      count += 1;
      return count;
    },
  });
  const { sessionA } = makePair(Far('s', { get: () => counter }));
  const r = sessionA.getRemoteMain();
  const stub = await E(r).get();
  t.is(await E(stub).incr(), 1);
  t.is(await E(stub).incr(), 2);
});

test('plain class instance is rejected (must use Far / makeExo)', async t => {
  function NotRemote() {}
  const v = new NotRemote();
  const { sessionA } = makePair(Far('s', { get: () => v }));
  const r = sessionA.getRemoteMain();
  let caught;
  try {
    await E(r).get();
  } catch (e) {
    caught = e;
  }
  t.truthy(caught);
});

test('Far-wrapped function is exported by reference', async t => {
  // Bare functions aren't passable per pass-style; wrap with Far/makeExo.
  const fn = Far('fn', () => 'fnReturn');
  const { sessionA } = makePair(Far('s', { fn: () => fn }));
  const r = sessionA.getRemoteMain();
  const stub = await E(r).fn();
  // A function-stub is callable via E().
  t.is(await E(stub)(), 'fnReturn');
});

test('concurrent pushes do not interfere', async t => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const { sessionA } = makePair(
    Far('s', {
      slow: async (n, ms) => {
        await sleep(ms);
        return n;
      },
    }),
  );
  const r = sessionA.getRemoteMain();
  const results = await Promise.all([
    E(r).slow(1, 30),
    E(r).slow(2, 10),
    E(r).slow(3, 20),
    E(r).slow(4, 5),
  ]);
  t.deepEqual(results, [1, 2, 3, 4]);
});
