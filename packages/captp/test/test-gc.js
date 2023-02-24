import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { Far } from '@endo/marshal';
import { E, makeLoopback } from '../src/loopback.js';

import { detectEngineGC } from './engine-gc.js';
import { makeGcAndFinalize } from './gc-and-finalize.js';
import { makeFinalizingMap } from '../src/finalize.js';

const isolated = async (t, makeFar) => {
  const local = Far('local', {
    method: () => 'local',
  });
  const far = makeFar(local);
  t.is(await E(far).method(), 'local');
};

test.serial('test loopback gc', async t => {
  const { makeFar, getFarStats, getNearStats } = makeLoopback('dean');
  const gcAndFinalize = await makeGcAndFinalize(detectEngineGC());

  await isolated(t, makeFar);
  await gcAndFinalize();
  // It would be nice to specify these counts, but we just can't reprodue them
  // on Windows.
  t.assert(getFarStats().sendCount.CTP_DROP > 0);
  t.assert(getNearStats().recvCount.CTP_DROP > 0);
});

const setAndDrop = async (t, map, droppedKey) => {
  const obj = {};
  map.set(droppedKey, obj);
  t.is(map.get(droppedKey), obj);
};

test.serial('finalizing map', async t => {
  const gcAndFinalize = await makeGcAndFinalize(detectEngineGC());

  const droppedKey = 'dropped';
  const map = makeFinalizingMap(key => t.is(key, droppedKey));

  const preserved = {};
  map.set('preserved', preserved);
  setAndDrop(t, map, droppedKey);

  t.is(map.getSize(), 2);
  await gcAndFinalize();
  await gcAndFinalize();
  t.is(map.getSize(), 1);
  t.is(map.get('preserved'), preserved);
});
