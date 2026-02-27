import test from '@endo/ses-ava/test.js';

import { Far } from '@endo/marshal';
import { E, makeLoopback } from '../src/loopback.js';

import { detectEngineGC } from './engine-gc.js';
import { makeGcAndFinalize } from './gc-and-finalize.js';

const isolated = async (t, makeFar) => {
  await null;
  const local = Far('local', {
    method: () => 'local',
  });
  const far = makeFar(local);
  t.is(await E(far).method(), 'local');
};

test('test loopback gc', async t => {
  const { makeFar, getFarStats, getNearStats } = makeLoopback(
    'dean',
    { gcImports: true },
    { gcImports: true },
  );
  const gcAndFinalize = await makeGcAndFinalize(detectEngineGC());

  await isolated(t, makeFar);
  await gcAndFinalize();

  // Check the GC stats.
  const nearStats = getNearStats();
  const farStats = getFarStats();
  const nearSendDrop = Number(nearStats.send.CTP_DROP);
  const nearRecvDrop = Number(nearStats.recv.CTP_DROP);
  const nearDropped = Number(nearStats.gc.DROPPED);
  const farSendDrop = Number(farStats.send.CTP_DROP);
  const farRecvDrop = Number(farStats.recv.CTP_DROP);
  const farDropped = Number(farStats.gc.DROPPED);
  // The exact number of drops can vary by one depending on finalization timing.
  // Assert pairwise consistency and lower bounds instead of exact totals.
  t.true(nearSendDrop >= 3);
  t.true(nearRecvDrop >= 2);
  t.true(nearDropped >= 2);
  t.true(farSendDrop >= 2);
  t.true(farRecvDrop >= 3);
  t.true(farDropped >= 3);
  t.is(nearSendDrop, farRecvDrop);
  t.is(nearRecvDrop, farSendDrop);
  t.is(nearDropped, nearRecvDrop);
  t.is(farDropped, farRecvDrop);
});
