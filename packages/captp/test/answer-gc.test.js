// @ts-check

import harden from '@endo/harden';
import test from '@endo/ses-ava/test.js';

import { Far } from '@endo/marshal';
import { E, makeLoopback } from '../src/loopback.js';

import { detectEngineGC } from './engine-gc.js';
import { makeGcAndFinalize } from './gc-and-finalize.js';

// This test lives in its own file so that it runs in a fresh worker. It
// provokes many collection cycles, which perturbs the finalization timing that
// the drop-count assertions in gc.test.js depend on when both share a worker.
test('collected questions release their streamed copy-record answers', async t => {
  t.timeout(10_000);
  /** @type {WeakRef<object>[]} */
  const records = [];
  const local = Far('stream', {
    read() {
      const record = harden({ index: records.length });
      records.push(new WeakRef(record));
      return record;
    },
  });
  const { makeFar, getFarStats } = makeLoopback(
    'stream-gc',
    { gcImports: true },
    { gcImports: true },
  );
  const gcAndFinalize = await makeGcAndFinalize(detectEngineGC());
  const consume = async () => {
    const remote = await makeFar(local);
    for (let i = 0; i < 64; i += 1) {
      // Discard each received record and its question promise.
      // eslint-disable-next-line no-await-in-loop
      await E(remote).read();
    }
  };
  await consume();
  await gcAndFinalize();
  await gcAndFinalize();
  t.is(records.length, 64);
  // The far side only ever holds the 64 read questions plus a few handshake
  // slots, so reaching 64 means the read questions themselves were dropped.
  t.true(Number(getFarStats().gc.DROPPED) >= 64);
  t.true(records.every(ref => ref.deref() === undefined));
});
