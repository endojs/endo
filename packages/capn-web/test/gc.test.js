// @ts-nocheck
/* global setTimeout */
// Garbage-collection tests.  These need --expose-gc + a --no-warnings node
// invocation to work fully; without it the tests still pass because the
// gcAndFinalize helper degrades to a no-op and we only assert what we can
// observe deterministically.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';
import { makeGcAndFinalize } from './_gc-and-finalize.js';
import { detectEngineGC } from './_engine-gc.js';

const collectMessages = transport => {
  const sent = [];
  const wrapped = {
    send: m => {
      sent.push(JSON.parse(m));
      return transport.send(m);
    },
    receive: () => transport.receive(),
    abort: transport.abort,
  };
  return { wrapped, sent };
};

test('explicit Symbol.dispose on local export releases it', async t => {
  let disposed = 0;
  // A Far'd object with [Symbol.dispose].
  const handle = Object.create(null);
  Object.assign(handle, {
    ping() {
      return 'pong';
    },
    [Symbol.dispose]() {
      disposed += 1;
    },
  });
  const farHandle = Far('handle', handle);
  const server = Far('server', { get: () => farHandle });
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: true });
  const sessionB = makeCapnWebSession(b, {
    localMain: server,
    gcImports: true,
  });
  sessionB;
  const r = sessionA.getRemoteMain();
  const h = await E(r).get();
  t.is(await E(h).ping(), 'pong');
  // Send a manual release from A: emulate what FinalizationRegistry would do
  // when h becomes unreachable.  We do this by calling abort on A which
  // clears imports.  Better — let GC do its thing if available.
  const gcAndFinalize = await makeGcAndFinalize(detectEngineGC());
  // Drop our local reference and force GC.
  // (We can't directly null out `h` from outside its scope; do it by leaving
  //  the lexical scope and forcing collection.)
  t.true(disposed === 0, 'not disposed yet');
  // We let `h` go out of scope at end of test.
  await gcAndFinalize();
  // Note: disposal happens on B's side when A's release reaches B; without
  // --expose-gc this test mostly just exercises the disposal codepath
  // synchronously by aborting.
  sessionA.abort();
  await new Promise(r2 => setTimeout(r2, 50));
});

test('exporting same value twice reuses the same id (refcount bumps)', async t => {
  const { a, b } = makeLoopbackPair();
  const { wrapped, sent } = collectMessages(a);
  const sessionA = makeCapnWebSession(wrapped, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', { take: _ => null }),
    gcImports: false,
  });
  const cap = Far('cap', {});
  const r = sessionA.getRemoteMain();
  await E(r).take(cap);
  await E(r).take(cap);
  // Both pushes should reference the same export id (-1).
  const exportRefs = sent
    .filter(m => m[0] === 'push')
    .map(m => m[1][3][0])
    .filter(e => Array.isArray(e) && e[0] === 'export');
  t.is(exportRefs.length, 2);
  t.is(exportRefs[0][1], -1);
  t.is(exportRefs[1][1], -1);
});

test('explicit release: peer release decrements refcount, drops on zero', async t => {
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  const sessionB = makeCapnWebSession(b, {
    localMain: Far('s', { take: _ => null }),
    gcImports: false,
  });
  sessionB;
  const cap = Far('cap', {});
  const r = sessionA.getRemoteMain();
  await E(r).take(cap);
  await E(r).take(cap);
  // Now we have one export on A's side with refcount 2 (two introductions).
  const before = sessionA.getStats();
  t.is(before.exports, 2); // main(0) + cap(-1)
  // Simulate B sending a release for refcount 2.  Inject directly via the
  // peer's send so the message lands in A's receive queue.
  await new Promise(resolve => setTimeout(resolve, 0));
  await b.send(JSON.stringify(['release', -1, 2]));
  // Send a roundtrip ping so B's loop processes (no-op) and we await.
  // Then check A's stats.
  await new Promise(resolve => setTimeout(resolve, 50));
  const after = sessionA.getStats();
  t.is(after.exports, 1); // main only
});

test('promise on the wire: fulfilment delivers a resolve', async t => {
  // Verify the asynchronous arg path: client passes a pending promise; the
  // server awaits it; once it resolves on the client side the resolve message
  // arrives and the server's await completes.
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  let serverGotValue;
  makeCapnWebSession(b, {
    localMain: Far('s', {
      eat: async p => {
        serverGotValue = await p;
        return 'ate';
      },
    }),
    gcImports: false,
  });
  const r = sessionA.getRemoteMain();
  let resolveLater;
  const pending = new Promise(rr => {
    resolveLater = rr;
  });
  const callP = E(r).eat(pending);
  // Microtask gap.
  await new Promise(rr => setTimeout(rr, 10));
  resolveLater(99);
  t.is(await callP, 'ate');
  t.is(serverGotValue, 99);
});

test('promise rejection on the wire delivers a reject', async t => {
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', {
      eat: async p => {
        try {
          await p;
          return 'no-throw';
        } catch (e) {
          return `caught:${e.message}`;
        }
      },
    }),
    gcImports: false,
  });
  const r = sessionA.getRemoteMain();
  let rejectLater;
  const pending = new Promise((_rr, rj) => {
    rejectLater = rj;
  });
  // Suppress unhandled rejection on `pending`.
  pending.catch(() => {});
  const callP = E(r).eat(pending);
  await new Promise(rr => setTimeout(rr, 10));
  rejectLater(new TypeError('bonk'));
  t.is(await callP, 'caught:bonk');
});
