import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { Far } from '@endo/marshal';
import { E, makeLoopback } from '../src/loopback.js';

import { detectEngineGC } from './engine-gc.js';
import { makeGcAndFinalize } from './gc-and-finalize.js';

const isolated = async (t, makeFar) => {
  const local = Far('local', {
    method: () => 'local',
  });
  const far = makeFar(local);
  t.is(await E(far).method(), 'local');
};

test('test loopback gc', async t => {
  const { makeFar, getFarStats, getNearStats } = makeLoopback('dean');
  const gcAndFinalize = await makeGcAndFinalize(detectEngineGC());

  await isolated(t, makeFar);
  await gcAndFinalize();

  // Check the GC stats.
  const nearStats = getNearStats();
  const farStats = getFarStats();
  t.like(
    { nearStats, farStats },
    {
      nearStats: {
        send: {
          CTP_DROP: 4,
        },
        recv: {
          CTP_DROP: 2,
        },
        gc: {
          DROPPED: 2,
        },
      },
      farStats: {
        send: {
          CTP_DROP: 2,
        },
        recv: {
          CTP_DROP: 4,
        },
        gc: {
          DROPPED: 4,
        },
      },
    },
  );
});
