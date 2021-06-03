/* global __dirname */
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava';

import { Worker } from 'worker_threads';

import { E, makeLoopback } from '../lib/captp';
import {
  createHostBootstrap,
  makeGuest,
  makeHost,
  runSyncTests,
} from './synclib';

const makeWorkerTests = isHost => async t => {
  const sab = new SharedArrayBuffer(2048);
  const worker = new Worker(`${__dirname}/worker.cjs`);
  worker.addListener('error', err => t.fail(err));
  worker.postMessage({ type: 'TEST_INIT', sab, isGuest: isHost });

  const initFn = isHost ? makeHost : makeGuest;
  const { dispatch, getBootstrap, Sync } = initFn(
    obj => worker.postMessage(obj),
    sab,
  );

  worker.addListener('message', obj => {
    // console.error('test received', obj);
    dispatch(obj);
  });

  const bs = getBootstrap();
  // console.error('have bs', bs);
  if (Sync) {
    await runSyncTests(t, Sync, bs, true);
  } else {
    t.assert(await E(bs).runSyncTests(true));
  }
};

test('try Node.js worker syncable, main host', makeWorkerTests(true));
test('try Node.js worker syncable, main guest', makeWorkerTests(false));

test('try restricted loopback syncable', async t => {
  const { makeFar, Sync, exportAsSyncable } = makeLoopback('us');
  const bs = makeFar(createHostBootstrap(exportAsSyncable));
  await runSyncTests(t, Sync, bs, false);
});
