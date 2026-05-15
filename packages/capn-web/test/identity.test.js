// @ts-nocheck
import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';

const makePair = ({ aMain, bMain } = {}) => {
  const { a, b } = makeLoopbackPair();
  return {
    sessionA: makeCapnWebSession(a, { localMain: aMain, gcImports: false }),
    sessionB: makeCapnWebSession(b, { localMain: bMain, gcImports: false }),
  };
};

test('same remote object returned twice yields the same presence', async t => {
  const stable = Far('stable', { id: () => 'me' });
  const server = Far('server', {
    fetch: () => stable,
  });
  const { sessionA } = makePair({ bMain: server });
  const r = sessionA.getRemoteMain();
  const a1 = await E(r).fetch();
  const a2 = await E(r).fetch();
  t.is(a1, a2, 'two fetches produce identical presence');
});

test('round-trip: send a remote presence back and recognise it', async t => {
  const local = Far('local', { kind: () => 'local' });
  const server = Far('server', {
    echo: x => x,
  });
  const { sessionA } = makePair({ bMain: server });
  const r = sessionA.getRemoteMain();
  const echoed = await E(r).echo(local);
  // The peer received `local` as a presence on its side.  When it returned
  // it back to us, we should recognise it as our own export, so reference
  // equality is preserved.
  t.is(echoed, local);
});

test('two distinct remote objects are not equal', async t => {
  const a = Far('a', {});
  const b = Far('b', {});
  const server = Far('server', { a: () => a, b: () => b });
  const { sessionA } = makePair({ bMain: server });
  const r = sessionA.getRemoteMain();
  const ra = await E(r).a();
  const rb = await E(r).b();
  t.not(ra, rb);
  // And calling .a() twice still gives the same presence.
  const ra2 = await E(r).a();
  t.is(ra, ra2);
});

test('local export reused across calls keeps the same id', async t => {
  // We send `local` twice.  The peer should see the same id both times,
  // so when it sends `local` back to us we still match.
  const local = Far('local', {});
  const calls = [];
  const server = Far('server', {
    capture: x => {
      calls.push(x);
      return x;
    },
  });
  const { sessionA, sessionB } = makePair({ bMain: server });
  const r = sessionA.getRemoteMain();
  const back1 = await E(r).capture(local);
  const back2 = await E(r).capture(local);
  t.is(back1, local);
  t.is(back2, local);
  // On the server side both captured args should also be the same presence.
  t.is(calls[0], calls[1]);
  // Stats: we should have one export on A's side, one import on B's side.
  const sa = sessionA.getStats();
  t.true(sa.exports >= 1, `A exports >= 1 (got ${sa.exports})`);
  const sb = sessionB.getStats();
  t.true(sb.imports >= 1, `B imports >= 1 (got ${sb.imports})`);
});

test('promise-stub round-trip: unawaited E() result is wired as a pipeline reference, not re-exported', async t => {
  // `await E(remote).foo()` returns the resolved value, but the
  // user-held promise that E() returns *before* it settles is also
  // tracked: stubs.js's makeHandler aliases the HandledPromise's
  // returnedP at the answer's import id (via tables.aliasImport).
  // That alias is what lets the devaluator recognise a user-held
  // promise — even an unresolved one — as `["pipeline", qid]` when
  // it's later passed back as an argument, rather than re-exporting
  // it as a fresh promise.
  //
  // Pin that behaviour two ways:
  //  - the wire form for the second call references the first call's
  //    answer slot (`["pipeline", qid]`), not a fresh export;
  //  - the peer awaits the pipeline ref to recover the original
  //    presence with reference equality.
  const stable = Far('stable', { tag: () => 'stable' });
  const peerCalls = [];
  const server = Far('server', {
    fetch: () => stable,
    pass: async x => {
      // The arg arrives as the export-table value at the pipeline-
      // referenced answer slot — a promise.  Awaiting it yields the
      // original presence; the alias is what makes that match
      // possible (otherwise the wire would have re-exported a fresh
      // promise stub).
      const resolved = await x;
      peerCalls.push(resolved);
      return resolved === stable ? 'identity-preserved' : 'identity-lost';
    },
  });
  // Capture the outbound wire to assert the pipeline-reference shape.
  const sent = [];
  const { a, b } = makeLoopbackPair();
  const wrapped = {
    send: m => {
      sent.push(JSON.parse(m));
      return a.send(m);
    },
    receive: () => a.receive(),
    abort: a.abort,
  };
  const sessionA = makeCapnWebSession(wrapped, { gcImports: false });
  makeCapnWebSession(b, { localMain: server, gcImports: false });
  const r = sessionA.getRemoteMain();
  // Do NOT await fetch() — pass the live promise to .pass() in the
  // same turn.  Both calls go out; the second's args reference the
  // first's answer slot via ["pipeline", qid].
  const fetchP = E(r).fetch();
  const result = await E(r).pass(fetchP);
  t.is(result, 'identity-preserved');
  // The peer-side resolved value is the original `stable` Far (the
  // peer's own value), confirming the alias→pipeline→await chain
  // returned the same reference.
  t.is(peerCalls.length, 1);
  t.is(peerCalls[0], stable);
  // Wire-form check: the second push's args carry a pipeline
  // reference to the first push's answer slot, not a fresh
  // promise/export encoding.
  const pushes = sent.filter(m => m[0] === 'push');
  // First push: fetch.  Second push: pass(fetchP) — args should be
  // [["pipeline", N]] where N is the fetch answer-id.
  t.true(pushes.length >= 2);
  const passArgs = pushes[1][1][3];
  t.is(passArgs.length, 1);
  t.is(passArgs[0][0], 'pipeline');
  t.true(typeof passArgs[0][1] === 'number' && passArgs[0][1] >= 1);
  // Sender-side: fetchP awaited and a fresh fetch() resolve to the
  // same presence (the sender's view of `stable` is a stable stub).
  const got = await fetchP;
  const direct = await E(r).fetch();
  t.is(got, direct);
});
