/* global setTimeout */
// Live garbage-collection tests.  These rely on `--expose-gc` (Node) and the
// FinalizationRegistry firing during a forced GC.  When run without
// --expose-gc the gcAndFinalize helper degrades to a no-op and these tests
// are skipped.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';
import { makeGcAndFinalize } from './_gc-and-finalize.js';
import { detectEngineGC } from './_engine-gc.js';

test('dropping a presence sends a release', async t => {
  const releases = [];
  const { a, b } = makeLoopbackPair();
  // Wrap A's send so we can observe outbound messages.
  const wrappedA = {
    send: m => {
      const parsed = JSON.parse(m);
      if (parsed[0] === 'release') releases.push(parsed);
      return a.send(m);
    },
    receive: () => a.receive(),
    abort: a.abort,
  };
  const sessionA = makeCapnWebSession(wrappedA, { gcImports: true });
  const sessionB = makeCapnWebSession(b, {
    localMain: Far('s', { get: () => Far('thing', { id: () => 1 }) }),
    gcImports: true,
  });
  sessionB;
  const gcAndFinalize = await makeGcAndFinalize(detectEngineGC());

  // Hold a presence in a closure that we can drop.
  await (async () => {
    const r = sessionA.getRemoteMain();
    const thing = await E(r).get();
    t.is(await E(thing).id(), 1);
    // thing goes out of scope here.
  })();

  await gcAndFinalize();
  // Wait for the scheduled release flush.
  await new Promise(resolve => setTimeout(resolve, 50));

  // We expect at least one release for the imported presence.
  t.true(
    releases.some(r => r[0] === 'release'),
    `expected at least one release; got ${JSON.stringify(releases)}`,
  );
});

test('repeated imports of the same exported presence dedupe under GC', async t => {
  const stable = Far('stable', { kind: () => 'stable' });
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: true });
  const sessionB = makeCapnWebSession(b, {
    localMain: Far('s', { get: () => stable }),
    gcImports: true,
  });
  sessionB;
  const r = sessionA.getRemoteMain();
  const a1 = await E(r).get();
  const a2 = await E(r).get();
  t.is(a1, a2);
});
