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
