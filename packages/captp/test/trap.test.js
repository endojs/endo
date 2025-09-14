/* global SharedArrayBuffer */
import test from '@endo/ses-ava/prepare-endo.js';

import { Worker } from 'worker_threads';
import url from 'url';
import {
  MIN_TRANSFER_BUFFER_BYTES,
  initTransferBuffer,
} from '../src/atomics.js';
import { E, makeLoopback } from '../src/loopback.js';

import {
  createHostBootstrap,
  makeGuest,
  makeHost,
  runTrapTests,
} from './traplib.js';

const dirname = url.fileURLToPath(new URL('./', import.meta.url));

/**
 * @type {import('ava').Macro<any, [isHost: boolean, bufLength: number]>}
 */
const workerTest = test.macro(async (t, isHost, bufLength) => {
  await null;
  const initFn = isHost ? makeHost : makeGuest;
  for (let len = 0; len < MIN_TRANSFER_BUFFER_BYTES; len += 1) {
    t.throws(() => initTransferBuffer(new SharedArrayBuffer(len)), {
      message: /^Transfer buffer/,
      instanceOf: Error,
    });
  }

  // Shared array buffer for testing different length settings.
  const transferBuffer = new SharedArrayBuffer(bufLength);
  initTransferBuffer(transferBuffer);

  const worker = new Worker(`${dirname}/worker.js`);
  t.teardown(() => worker.terminate());
  worker.addListener('error', err => t.fail(err?.stack ?? String(err)));
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
  if (Trap) {
    await runTrapTests(t, Trap, bs, true);
  } else {
    t.assert(await E(bs).runTrapTests(true));
  }
});

test(
  'try Node.js worker trap, main host, mini buffer',
  workerTest,
  true,
  MIN_TRANSFER_BUFFER_BYTES,
);
test(
  'try Node.js worker trap, main guest, mini buffer',
  workerTest,
  false,
  MIN_TRANSFER_BUFFER_BYTES,
);
test(
  'try Node.js worker trap, main host, larger buffer',
  workerTest,
  true,
  65536,
);
test(
  'try Node.js worker trap, main guest, larger buffer',
  workerTest,
  false,
  65536,
);

test('try restricted loopback trap', async t => {
  const { makeFar, Trap, makeTrapHandler } = makeLoopback('us');
  const bs = makeFar(createHostBootstrap(makeTrapHandler));
  await runTrapTests(t, Trap, bs, false);
});

test('check buffer writing edge cases', async t => {
  const emo = '💩';

  t.is(emo.length, 2);
  t.is(emo.charCodeAt(0).toString(16), 'd83d');
  t.is(emo.charCodeAt(1).toString(16), 'dca9');

  const te = new TextEncoder();
  const td = new TextDecoder();
  const buf = new Uint8Array(5);
  {
    let str = emo + emo;
    {
      const encoded = te.encodeInto(str, buf);
      t.is(encoded.read, 2);
      t.is(encoded.written, 4);
      t.is(
        td.decode(buf.slice(0, encoded.written)),
        str.slice(0, encoded.read),
      );
      str = str.slice(encoded.read);
    }

    while (str.length > 0) {
      const encoded = te.encodeInto(str, buf);
      t.is(encoded.read, 2);
      t.is(encoded.written, 4);
      t.is(
        td.decode(buf.slice(0, encoded.written)),
        str.slice(0, encoded.read),
      );
      str = str.slice(encoded.read);
    }
  }
});
