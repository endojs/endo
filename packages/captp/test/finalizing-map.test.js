import test from '@endo/ses-ava/prepare-endo.js';

import { detectEngineGC } from './engine-gc.js';
import { makeGcAndFinalize } from './gc-and-finalize.js';
import { makeFinalizingMap } from '../src/finalize.js';

const setAndDrop = async (t, map, droppedKey) => {
  const obj = {};
  map.set(droppedKey, obj);
  t.is(map.get(droppedKey), obj);
};

test('finalizing map', async t => {
  const gcAndFinalize = await makeGcAndFinalize(detectEngineGC());

  const droppedKey = 'dropped';
  const map = makeFinalizingMap(key => t.is(key, droppedKey), {
    weakValues: true,
  });

  const preserved = {};
  map.set('preserved', preserved);
  setAndDrop(t, map, droppedKey);

  t.is(map.getSize(), 2);
  await gcAndFinalize();
  t.is(map.getSize(), 1);
  t.is(map.get('preserved'), preserved);
});
