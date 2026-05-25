// @ts-nocheck
/* global setTimeout, globalThis, process */
// Coverage-gap tests T6-T8 + T10-T12 from the comprehensive review.
// Each test pins a behaviour we'd previously left implicit.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';

const makePair = bMain => {
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  const sessionB = makeCapnWebSession(b, {
    localMain: bMain,
    gcImports: false,
  });
  return { sessionA, sessionB, a, b };
};

// ---------- T6: stream chunk types beyond strings ----------

test('T6: Uint8Array chunks round-trip byte-for-byte', async t => {
  const received = [];
  const writable = Far('writable', {
    write: chunk => {
      received.push(chunk);
    },
  });
  const { sessionA } = makePair(writable);
  const w = sessionA.getRemoteMain();
  await E(w).write(new Uint8Array([1, 2, 3]));
  await E(w).write(new Uint8Array([4, 5, 6, 7, 8]));
  t.is(received.length, 2);
  t.true(received[0] instanceof Uint8Array);
  t.deepEqual([...received[0]], [1, 2, 3]);
  t.true(received[1] instanceof Uint8Array);
  t.deepEqual([...received[1]], [4, 5, 6, 7, 8]);
});

test('T6: deep record chunks survive the write path', async t => {
  const received = [];
  const writable = Far('writable', {
    write: chunk => {
      received.push(chunk);
    },
  });
  const { sessionA } = makePair(writable);
  const w = sessionA.getRemoteMain();
  await E(w).write({
    kind: 'event',
    payload: { ts: new Date(0), tags: ['a'] },
  });
  await E(w).write({ kind: 'data', payload: 42 });
  t.is(received.length, 2);
  t.is(received[0].kind, 'event');
  t.true(received[0].payload.ts instanceof Date);
  t.is(received[0].payload.ts.getTime(), 0);
  t.deepEqual(received[0].payload.tags, ['a']);
  t.is(received[1].kind, 'data');
  t.is(received[1].payload, 42);
});

test('T6: Far-object chunks arrive as remote presences', async t => {
  const received = [];
  const writable = Far('writable', {
    write: async chunk => {
      // chunk is a presence; call a method to verify it's a stub.
      const tag = await E(chunk).tag();
      received.push(tag);
    },
  });
  const { sessionA } = makePair(writable);
  const w = sessionA.getRemoteMain();
  await E(w).write(Far('a', { tag: () => 'A' }));
  await E(w).write(Far('b', { tag: () => 'B' }));
  t.deepEqual(received, ['A', 'B']);
});

// ---------- T7: foreign-stub round-trip identity ----------

test('T7: Alice → Bob → Carol → Bob preserves stub identity at Bob', async t => {
  // Bob has two sessions.  Alice's main is `aliceCap`.  Bob receives
  // `aliceCap` via session-A, forwards it to Carol over session-B,
  // and Carol bounces it back via session-B.  Bob should recognise
  // the bounced reference as the same stub it had originally.
  const aliceCap = Far('aliceCap', { tag: () => 'A' });

  const { a: aliceLink, b: bobLinkToAlice } = makeLoopbackPair();
  const { a: bobLinkToCarol, b: carolLink } = makeLoopbackPair();

  // Carol's main echoes whatever it's given.
  const carolMain = Far('carolMain', { echo: x => x });

  makeCapnWebSession(aliceLink, { localMain: aliceCap, gcImports: false });
  makeCapnWebSession(carolLink, { localMain: carolMain, gcImports: false });
  const bobToAlice = makeCapnWebSession(bobLinkToAlice, { gcImports: false });
  const bobToCarol = makeCapnWebSession(bobLinkToCarol, { gcImports: false });

  const aliceFromBob = bobToAlice.getRemoteMain(); // Bob's import of Alice
  const carolFromBob = bobToCarol.getRemoteMain(); // Bob's import of Carol

  // Send Alice's stub to Carol; Carol echoes it back.
  const bouncedBack = await E(carolFromBob).echo(aliceFromBob);

  // Bob's session-B exported aliceFromBob (it was a foreign stub for
  // session-B).  Carol received that as her import; sending it back
  // means Carol's session-B reference resolves to Bob's session-B
  // export which IS aliceFromBob.  Identity preserved.
  t.is(bouncedBack, aliceFromBob);

  // And calling a method on it still forwards through session-A to Alice:
  t.is(await E(bouncedBack).tag(), 'A');

  bobToAlice.abort();
  bobToCarol.abort();
});

// ---------- T8: concurrent abort ----------

test('T8: simultaneous abort on both sides cleans up cleanly', async t => {
  const { sessionA, sessionB } = makePair(Far('s', { ping: () => 'pong' }));
  // Start a call so there's pending state, then abort both ends in the
  // same turn.  Neither should throw or deadlock.
  const r = sessionA.getRemoteMain();
  const pending = E(r).ping();
  pending.catch(() => {}); // suppress before we abort
  sessionA.abort();
  sessionB.abort();
  await new Promise(rr => setTimeout(rr, 50));
  t.true(sessionA.isAborted());
  t.true(sessionB.isAborted());
});

test('T8b: abort is idempotent — calling twice is a no-op', async t => {
  const { sessionA } = makePair(Far('s', {}));
  sessionA.abort();
  // Second call must not throw.
  sessionA.abort();
  await new Promise(rr => setTimeout(rr, 30));
  t.true(sessionA.isAborted());
});

// ---------- T10: ["stream", expr] ingestion from a peer ----------

test('T10: incoming ["stream", expr] is auto-resolved without a pull', async t => {
  // We craft a manual "peer" by feeding raw messages into a session's
  // transport.  The peer sends a `stream` push that should be processed
  // and auto-resolved (and auto-released) without us sending a pull.
  let writeCalls = 0;
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, {
    localMain: Far('main', {
      tick: x => {
        writeCalls += 1;
        return x;
      },
    }),
    gcImports: false,
  });

  // Drive raw peer-side messages through `b`.  We're acting as the
  // capnweb-side peer to A.  Send a `stream` push, then verify A
  // computes the answer and auto-replies with `resolve` (which we
  // observe via b.receive).
  await b.send(JSON.stringify(['stream', ['pipeline', 0, ['tick'], [99]]]));
  // A should auto-pull internally and emit ['resolve', qid, 99].  Read
  // the next outbound message from A.
  const outbound = await b.receive();
  const parsed = JSON.parse(outbound);
  t.is(parsed[0], 'resolve');
  // qid is the answer slot (positive int allocated by A on incoming push).
  t.true(typeof parsed[1] === 'number' && parsed[1] >= 1);
  t.is(parsed[2], 99);
  t.is(writeCalls, 1);

  sessionA.abort();
});

// ---------- T11: function-call (no method name) ["pipeline", id, [], args] ----------

test('T11: calling a Far-wrapped function via a stub-of-a-function works', async t => {
  // Server returns a Far'd function (passable per pass-style: a
  // remotable function).  Client receives a stub; calling it via E()
  // dispatches as `applyFunction`, which lands on the wire as
  // ["pipeline", id, [], args] (empty path means "call the subject
  // itself").  Verifies the no-method-name code path through the
  // session and walkPathAndCall.
  const fn = Far('fn', (a, b) => a + b);
  const { sessionA } = makePair(Far('s', { getFn: () => fn }));
  const r = sessionA.getRemoteMain();
  const stub = await E(r).getFn();
  // E(stub)(...args) goes through applyFunction → empty path call.
  t.is(await E(stub)(2, 3), 5);
  t.is(await E(stub)(10, 20), 30);
});

// ---------- T12: Header round-trip end-to-end on Node 20+ ----------

const haveFetch =
  typeof globalThis.Headers === 'function' &&
  typeof globalThis.Request === 'function';

const nodeMajor = (() => {
  try {
    const v = process.versions && process.versions.node;
    return v ? parseInt(v.split('.')[0], 10) : 0;
  } catch (_e) {
    return 0;
  }
})();

// Re-probe at test time — on Node 18 the first iteration ever may succeed
// (priming a sort cache) and only fail on subsequent instances, so a
// module-load probe is misleading.
const canIterateStandaloneHeaders = () => {
  if (!haveFetch) return false;
  if (nodeMajor > 0 && nodeMajor < 20) return false;
  try {
    for (let i = 0; i < 2; i += 1) {
      const h = new globalThis.Headers();
      h.append('x', 'y');
      let saw;
      h.forEach((v, k) => {
        saw = [k, v];
      });
      if (!saw || saw[0] !== 'x' || saw[1] !== 'y') return false;
    }
    return true;
  } catch (_e) {
    return false;
  }
};

const headerTest = haveFetch ? test : test.skip;

headerTest(
  'T12: standalone Headers round-trip preserves entries (where iteration works)',
  async t => {
    if (!canIterateStandaloneHeaders()) {
      t.pass('standalone Headers iteration not supported in this realm');
      return;
    }
    const { sessionA } = makePair(Far('s', { echo: x => x }));
    const r = sessionA.getRemoteMain();
    const h = new Headers();
    h.append('content-type', 'application/json');
    h.append('x-trace', 'abc-123');
    h.append('x-trace', 'def-456'); // multi-value
    const back = await E(r).echo(h);
    t.true(back instanceof Headers);
    t.is(back.get('content-type'), 'application/json');
    // multi-value headers are joined per the Headers spec.
    t.is(back.get('x-trace'), 'abc-123, def-456');
  },
);
