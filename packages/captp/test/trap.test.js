/* global SharedArrayBuffer */
import test from '@endo/ses-ava/prepare-endo.js';

import { Worker } from 'worker_threads';
import url from 'url';
import { MIN_TRANSFER_BUFFER_LENGTH } from '../src/atomics.js';
import { E, makeLoopback } from '../src/loopback.js';

import {
  createHostBootstrap,
  makeGuest,
  makeHost,
  runTrapTests,
} from './traplib.js';

const dirname = url.fileURLToPath(new URL('./', import.meta.url));

const makeWorkerTests = isHost => async t => {
  await null;
  const initFn = isHost ? makeHost : makeGuest;
  for (let len = 0; len < MIN_TRANSFER_BUFFER_LENGTH; len += 1) {
    t.throws(() => initFn(() => {}, new SharedArrayBuffer(len)), {
      message: /^Transfer buffer/,
      instanceOf: Error,
    });
  }

  // Small shared array buffer to test iterator.
  const transferBuffer = new SharedArrayBuffer(MIN_TRANSFER_BUFFER_LENGTH);
  const worker = new Worker(`${dirname}/worker.js`);
  t.teardown(() => worker.terminate());
  worker.addListener('error', err => t.fail(err));
  worker.postMessage({ type: 'TEST_INIT', transferBuffer, isGuest: isHost });

  const { dispatch, getBootstrap, Trap } = initFn(
    obj => worker.postMessage(obj),
    transferBuffer,
  );

  worker.addListener('message', obj => {
    // console.error('test received', obj);
    dispatch(obj);
  });

  const bs = getBootstrap();
  // console.error('have bs', bs);
  if (Trap) {
    await runTrapTests(t, Trap, bs, true);
  } else {
    t.assert(await E(bs).runTrapTests(true));
  }
};

test('try Node.js worker trap, main host', makeWorkerTests(true));
test('try Node.js worker trap, main guest', makeWorkerTests(false));

test('try restricted loopback trap', async t => {
  const { makeFar, Trap, makeTrapHandler } = makeLoopback('us');
  const bs = makeFar(createHostBootstrap(makeTrapHandler));
  await runTrapTests(t, Trap, bs, false);
});
