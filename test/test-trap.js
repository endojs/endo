/* global __dirname */
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava';

import { Worker } from 'worker_threads';

import { E, makeLoopback } from '../src/captp';
import {
  createHostBootstrap,
  makeGuest,
  makeHost,
  runTrapTests,
} from './traplib';

const makeWorkerTests = isHost => async t => {
  // Ridiculously small shared array buffer to test continuations.
  const sab = new SharedArrayBuffer(16);
  const worker = new Worker(`${__dirname}/worker.cjs`);
  worker.addListener('error', err => t.fail(err));
  worker.postMessage({ type: 'TEST_INIT', sab, isGuest: isHost });

  const initFn = isHost ? makeHost : makeGuest;
  const { dispatch, getBootstrap, Trap } = initFn(
    obj => worker.postMessage(obj),
    sab,
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
