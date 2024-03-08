// @ts-check

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/lockdown/commit-debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import crypto from 'crypto';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import bundleSource from '@endo/bundle-source';
import {
  start,
  stop,
  restart,
  clean,
  purge,
  makeEndoClient,
  makeReaderRef,
} from '../index.js';
import { makeCryptoPowers } from '../src/daemon-node-powers.js';
import { serializeFormulaIdentifier } from '../src/formula-identifier.js';
import { makeLocator } from './util/basic.js';
import { makeMultiplayerUtil } from './util/multiplayer.js';

const cryptoPowers = makeCryptoPowers(crypto);
const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

// The id of the next bundle to make.
let bundleId = 0;
const textEncoder = new TextEncoder();

// TODO: We should be able to use {import('../src/types').EndoHost} for `host`,
// but when laundered through `E()` it becomes `never`.
/**
 * Performs the necessary rituals to go from an endo `host` and a module `filePath`
 * to calling `makeBundle` without leaving temporary pet names behind.
 *
 * @param {any} host - The host to use.
 * @param {string} filePath - The path to the file to bundle.
 * @param {(bundleName: string) => Promise<unknown>} callback - A function that calls `makeBundle`
 * on the `host`.
 * @returns {Promise<unknown>} The result of the `callback`.
 */
const doMakeBundle = async (host, filePath, callback) => {
  const bundleName = `tmp-bundle-${bundleId}`;
  bundleId += 1;
  const bundle = await bundleSource(filePath);
  const bundleText = JSON.stringify(bundle);
  const bundleBytes = textEncoder.encode(bundleText);
  const bundleReaderRef = makeReaderRef([bundleBytes]);

  await E(host).store(bundleReaderRef, bundleName);
  const result = await callback(bundleName);
  await E(host).remove(bundleName);
  return result;
};

test('lifecycle', async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'lifecycle');

  await stop(locator).catch(() => {});
  await purge(locator);
  await clean(locator);
  await start(locator);
  await stop(locator);
  await restart(locator);

  const { getBootstrap, closed } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).makeWorker('worker');
  await E(host).cancel('worker');
  cancel(new Error('Cancelled'));
  await closed.catch(() => {});

  await stop(locator);
  t.pass();
});

test('spawn and evaluate', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'spawn-eval');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).makeWorker('w1');
  const ten = await E(host).evaluate('w1', '10', [], []);
  t.is(ten, 10);

  await stop(locator);
});

test('anonymous spawn and evaluate', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'spawn-eval-anon');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  const ten = await E(host).evaluate('MAIN', '10', [], []);
  t.is(ten, 10);

  await stop(locator);
});

test('persist spawn and evaluation', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'persist-spawn-eval');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();

    await E(host).makeWorker('w1');

    const ten = await E(host).evaluate('w1', '10', [], [], 'ten');
    t.is(ten, 10);
    const twenty = await E(host).evaluate(
      'w1',
      'number * 2',
      ['number'],
      ['ten'],
      'twenty',
    );

    // Forget the pet name of the intermediate formula, demonstrating that pet
    // names are ephemeral but formulas persist as long as their is a retention
    // chain among them.
    await E(host).remove('ten');

    t.is(20, twenty);
  }

  await restart(locator);

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );

    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();

    const retwenty = await E(host).lookup('twenty');
    t.is(20, retwenty);
  }

  await stop(locator);
});

test('store', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'store');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();
    const readerRef = makeReaderRef([new TextEncoder().encode('hello\n')]);
    await E(host).store(readerRef, 'hello-text');
  }

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();
    const readable = await E(host).lookup('hello-text');
    const actualText = await E(readable).text();
    t.is(actualText, 'hello\n');
  }

  await stop(locator);
});

test('closure state lost by restart', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'restart-closures');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();
    await E(host).makeWorker('w1');

    await E(host).evaluate(
      'w1',
      `
      Far('Counter Maker', {
        makeCounter: (value = 0) => Far('Counter', {
          incr: () => value += 1,
          decr: () => value -= 1,
        }),
      })
    `,
      [],
      [],
      'counter-maker',
    );
    await E(host).evaluate(
      'w1',
      `E(cm).makeCounter() `,
      ['cm'],
      ['counter-maker'],
      'counter',
    );
    const one = await E(host).evaluate(
      'w1',
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    const two = await E(host).evaluate(
      'w1',
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    const three = await E(host).evaluate(
      'w1',
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    t.is(one, 1);
    t.is(two, 2);
    t.is(three, 3);
  }

  await restart(locator);

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();
    await E(host).lookup('w1');
    const one = await E(host).evaluate(
      'w1',
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    const two = await E(host).evaluate(
      'w1',
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    const three = await E(host).evaluate(
      'w1',
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    t.is(one, 1);
    t.is(two, 2);
    t.is(three, 3);
  }

  await stop(locator);
});

test('persist unconfined services and their requests', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'make-unconfined');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const responderFinished = (async () => {
    const { promise: followerCancelled, reject: cancelFollower } =
      makePromiseKit();
    cancelled.catch(cancelFollower);
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      followerCancelled,
    );
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();
    await E(host).makeWorker('user-worker');
    await E(host).evaluate(
      'user-worker',
      `
      Far('Answer', {
        value: () => 42,
      })
    `,
      [],
      [],
      'grant',
    );
    const iteratorRef = E(host).followMessages();
    const { value: message } = await E(iteratorRef).next();
    const { number, who } = E.get(message);
    t.is(await who, 'o1');
    await E(host).resolve(await number, 'grant');
  })();

  const requesterFinished = (async () => {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();
    await E(host).makeWorker('w1');
    await E(host).provideGuest('o1');
    const servicePath = path.join(dirname, 'test', 'service.js');
    const serviceLocation = url.pathToFileURL(servicePath).href;
    await E(host).makeUnconfined('w1', serviceLocation, 'o1', 's1');

    await E(host).makeWorker('w2');
    const answer = await E(host).evaluate(
      'w2',
      'E(service).ask()',
      ['service'],
      ['s1'],
      'answer',
    );
    const number = await E(answer).value();
    t.is(number, 42);
  })();

  await Promise.all([responderFinished, requesterFinished]);

  await restart(locator);

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();
    const answer = await E(host).lookup('answer');
    const number = await E(answer).value();
    t.is(number, 42);
  }

  await stop(locator);
});

test('persist confined services and their requests', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'make-bundle');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const responderFinished = (async () => {
    const { promise: followerCancelled, reject: cancelFollower } =
      makePromiseKit();
    cancelled.catch(cancelFollower);
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      followerCancelled,
    );
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();
    await E(host).makeWorker('user-worker');
    await E(host).evaluate(
      'user-worker',
      `
      Far('Answer', {
        value: () => 42,
      })
    `,
      [],
      [],
      'grant',
    );
    const iteratorRef = E(host).followMessages();
    const { value: message } = await E(iteratorRef).next();
    const { number, who } = E.get(message);
    t.is(await who, 'o1');
    await E(host).resolve(await number, 'grant');
  })();

  const requesterFinished = (async () => {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();
    await E(host).makeWorker('w1');
    await E(host).provideGuest('o1');
    const servicePath = path.join(dirname, 'test', 'service.js');
    await doMakeBundle(host, servicePath, bundleName =>
      E(host).makeBundle('w1', bundleName, 'o1', 's1'),
    );

    await E(host).makeWorker('w2');
    const answer = await E(host).evaluate(
      'w2',
      'E(service).ask()',
      ['service'],
      ['s1'],
      'answer',
    );
    const number = await E(answer).value();
    t.is(number, 42);
  })();

  await Promise.all([responderFinished, requesterFinished]);

  await restart(locator);

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const host = E(bootstrap).host();
    const answer = await E(host).lookup('answer');
    const number = await E(answer).value();
    t.is(number, 42);
  }

  await stop(locator);
});

test('guest facet receives a message for host', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));

  const locator = makeLocator(dirname, 'tmp', 'guest-sends-host');

  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  const guest = E(host).provideGuest('guest');
  await E(host).provideWorker('worker');
  await E(host).evaluate('worker', '10', [], [], 'ten1');

  const iteratorRef = E(host).followMessages();
  E.sendOnly(guest).request('HOST', 'a number', 'number');
  const { value: message0 } = await E(iteratorRef).next();
  t.is(message0.number, 0);
  await E(host).resolve(message0.number, 'ten1');

  await E(guest).send('HOST', ['Hello, World!'], ['gift'], ['number']);

  const { value: message1 } = await E(iteratorRef).next();
  t.is(message1.number, 1);
  await E(host).adopt(message1.number, 'gift', 'ten2');
  const ten = await E(host).lookup('ten2');
  t.is(ten, 10);

  // Host should have received messages.
  const hostInbox = await E(host).listMessages();
  t.deepEqual(
    hostInbox.map(({ type, who, dest }) => ({ type, who, dest })),
    [
      { type: 'request', who: 'guest', dest: 'SELF' },
      { type: 'package', who: 'guest', dest: 'SELF' },
    ],
  );

  // Guest should have own sent messages.
  const guestInbox = await E(guest).listMessages();
  t.deepEqual(
    guestInbox.map(({ type, who, dest }) => ({ type, who, dest })),
    [
      { type: 'request', who: 'SELF', dest: 'HOST' },
      { type: 'package', who: 'SELF', dest: 'HOST' },
    ],
  );

  await stop(locator);
});

test('direct cancellation', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));

  const locator = makeLocator(dirname, 'tmp', 'cancellation-direct');

  await start(locator);
  t.teardown(() => stop(locator));

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).provideWorker('worker');

  const counterPath = path.join(dirname, 'test', 'counter.js');
  const counterLocation = url.pathToFileURL(counterPath).href;
  await E(host).makeUnconfined('worker', counterLocation, 'NONE', 'counter');
  t.is(
    1,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
  t.is(
    2,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
  t.is(
    3,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );

  await E(host).cancel('counter');
  t.is(
    1,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
  t.is(
    2,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
  t.is(
    3,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
});

// See: https://github.com/endojs/endo/issues/2074
test.failing('indirect cancellation', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));

  const locator = makeLocator(dirname, 'tmp', 'cancellation-indirect');

  await start(locator);
  t.teardown(() => stop(locator));

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).provideWorker('worker');

  const counterPath = path.join(dirname, 'test', 'counter.js');
  const counterLocation = url.pathToFileURL(counterPath).href;
  await E(host).makeUnconfined('worker', counterLocation, 'SELF', 'counter');
  t.is(
    1,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
  t.is(
    2,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
  t.is(
    3,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );

  await E(host).cancel('worker');

  t.is(
    1,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
  t.is(
    2,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
  t.is(
    3,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
});

test('cancel because of requested capability', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));

  const locator = makeLocator(dirname, 'tmp', 'cancellation-via-request');

  await start(locator);
  t.teardown(() => stop(locator));

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).provideWorker('worker');
  await E(host).provideGuest('guest');

  const messages = E(host).followMessages();

  const counterPath = path.join(dirname, 'test', 'counter-party.js');
  const counterLocation = url.pathToFileURL(counterPath).href;
  E(host).makeUnconfined('worker', counterLocation, 'guest', 'counter');

  await E(host).evaluate('worker', '0', [], [], 'zero');
  await E(messages).next();
  E(host).resolve(0, 'zero');

  t.is(
    1,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
  t.is(
    2,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
  t.is(
    3,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );

  await E(host).cancel('guest');

  t.is(
    1,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
  t.is(
    2,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
  t.is(
    3,
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
  );
});

test('unconfined service can respond to cancellation', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));

  const locator = makeLocator(
    dirname,
    'tmp',
    'cancellation-unconfined-response',
  );

  await start(locator);
  t.teardown(() => stop(locator));

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).provideWorker('worker');

  const capletPath = path.join(dirname, 'test', 'context-consumer.js');
  const capletLocation = url.pathToFileURL(capletPath).href;
  await E(host).makeUnconfined(
    'worker',
    capletLocation,
    'NONE',
    'context-consumer',
  );

  const result = E(host).evaluate(
    'worker',
    'E(caplet).awaitCancellation()',
    ['caplet'],
    ['context-consumer'],
  );
  await E(host).cancel('context-consumer');
  t.is(await result, 'cancelled');
});

test('confined service can respond to cancellation', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));

  const locator = makeLocator(dirname, 'tmp', 'cancellation-confined-response');

  await start(locator);
  t.teardown(() => stop(locator));

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).provideWorker('worker');

  const capletPath = path.join(dirname, 'test', 'context-consumer.js');
  await doMakeBundle(host, capletPath, bundleName =>
    E(host).makeBundle('worker', bundleName, 'NONE', 'context-consumer'),
  );

  const result = E(host).evaluate(
    'worker',
    'E(caplet).awaitCancellation()',
    ['caplet'],
    ['context-consumer'],
  );
  await E(host).cancel('context-consumer');
  t.is(await result, 'cancelled');
});

test('make a host', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'make-host');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  const host2 = E(host).provideHost('fellow-host');
  await E(host2).makeWorker('w1');
  const ten = await E(host2).evaluate('w1', '10', [], []);
  t.is(ten, 10);

  await stop(locator);
});

test('name and reuse inspector', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'inspector-reuse');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).provideWorker('worker');

  const counterPath = path.join(dirname, 'test', 'counter.js');
  await E(host).makeUnconfined('worker', counterPath, 'NONE', 'counter');

  const inspector = await E(host).evaluate(
    'worker',
    'E(INFO).lookup("counter")',
    ['INFO'],
    ['INFO'],
    'inspector',
  );
  t.regex(String(inspector), /Alleged: Inspector.+make-unconfined/u);

  const worker = await E(host).evaluate(
    'worker',
    'E(inspector).lookup("worker")',
    ['inspector'],
    ['inspector'],
  );
  t.regex(String(worker), /Alleged: EndoWorker/u);

  await stop(locator);
});

// Regression test for: https://github.com/endojs/endo/issues/2021
test('eval-mediated worker name', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'eval-worker-name');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).provideWorker('worker');

  const counterPath = path.join(dirname, 'test', 'counter.js');
  await E(host).makeUnconfined('worker', counterPath, 'NONE', 'counter');

  t.is(
    await E(host).evaluate(
      'worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
    1,
  );

  // We create a petname for the worker of `counter`.
  // Note that while `worker === counter-worker`, it doesn't matter here.
  const counterWorker = await E(host).evaluate(
    'worker',
    'E(E(INFO).lookup("counter")).lookup("worker")',
    ['INFO'],
    ['INFO'],
    'counter-worker',
  );
  t.regex(String(counterWorker), /Alleged: EndoWorker/u);

  // We should be able to use the new name for the worker.
  t.is(
    await E(host).evaluate(
      'counter-worker',
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    ),
    2,
  );

  await stop(locator);
});

test('lookup with single petname', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'lookup-single-petname');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).provideGuest('guest');
  const ten = await E(host).evaluate('MAIN', '10', [], [], 'ten');
  t.is(ten, 10);

  const resolvedValue = await E(host).evaluate(
    'MAIN',
    'E(SELF).lookup("ten")',
    ['SELF'],
    ['SELF'],
  );
  t.is(resolvedValue, 10);

  await stop(locator);
});

test('lookup with petname path (inspector)', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'lookup-petname-path-inspector');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).evaluate('MAIN', '10', [], [], 'ten');

  const resolvedValue = await E(host).evaluate(
    'MAIN',
    'E(SELF).lookup("INFO", "ten", "source")',
    ['SELF'],
    ['SELF'],
  );
  t.is(resolvedValue, '10');

  await stop(locator);
});

test('lookup with petname path (caplet with lookup method)', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'lookup-petname-path-caplet');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();

  const lookupPath = path.join(dirname, 'test', 'lookup.js');
  await E(host).makeUnconfined('MAIN', lookupPath, 'NONE', 'lookup');

  const resolvedValue = await E(host).evaluate(
    'MAIN',
    'E(SELF).lookup("lookup", "name")',
    ['SELF'],
    ['SELF'],
  );
  t.is(resolvedValue, 'Looked up: name');

  await stop(locator);
});

test('lookup with petname path (value has no lookup method)', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'lookup-petname-path-no-method');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();

  await E(host).evaluate('MAIN', '10', [], [], 'ten');
  await t.throwsAsync(
    E(host).evaluate(
      'MAIN',
      'E(SELF).lookup("ten", "someName")',
      ['SELF'],
      ['SELF'],
    ),
    { message: 'target has no method "lookup", has []' },
  );

  await stop(locator);
});

test('evaluate name resolved by lookup path', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'name-resolved-by-lookup-path');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();

  await E(host).evaluate('MAIN', '10', [], [], 'ten');

  const resolvedValue = await E(host).evaluate(
    'MAIN',
    'foo',
    ['foo'],
    [['INFO', 'ten', 'source']],
  );
  t.is(resolvedValue, '10');

  await stop(locator);
});

test('list special names', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'list-names');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();

  const readerRef = makeReaderRef([new TextEncoder().encode('hello\n')]);
  await E(host).store(readerRef, 'hello-text');

  /** @type {string[]} */
  const names = await E(host).list();

  // There should be special names, but they are in flux at time of writing and
  // we don't need to update this test for every change, so just verify that
  // there's at least one for now.
  t.assert(names.length > 1);
  t.deepEqual(
    names.filter(name => name.toUpperCase() !== name),
    ['hello-text'],
  );
});

test('guest cannot access host methods', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));

  const locator = makeLocator(dirname, 'tmp', 'guest-cannot-host');

  await start(locator);
  t.teardown(() => stop(locator));

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  const guest = E(host).provideGuest('guest');
  const guestsHost = E(guest).lookup('HOST');
  await t.throwsAsync(() => E(guestsHost).lookup('SELF'), {
    message: /target has no method "lookup"/u,
  });
  const revealedTarget = await E.get(guestsHost).targetFormulaIdentifier;
  t.is(revealedTarget, undefined);
});

test('read unknown nodeId', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator(dirname, 'tmp', 'read-unknown-nodeId');

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();

  // write a bogus value for a bogus nodeId
  const node = await cryptoPowers.randomHex512();
  const number = await cryptoPowers.randomHex512();
  const type = 'eval';
  const formulaIdentifier = serializeFormulaIdentifier({
    node,
    number,
    type,
  });
  await E(host).write(['abc'], formulaIdentifier);
  // observe reification failure
  t.throwsAsync(() => E(host).lookup('abc'), {
    message: /No peer found for node identifier /u,
  });

  await stop(locator);
});

test('read remote value', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const { makeNode } = makeMultiplayerUtil({
    testDir: 'read-remote-value',
    dirname,
  });
  // make two nodes
  const { host: hostA, locator: locatorA } = await makeNode({
    label: 'A',
    cancelled,
  });
  const { host: hostB, locator: locatorB } = await makeNode({
    label: 'B',
    cancelled,
  });

  // introduce nodes to each other
  await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());
  await E(hostB).addPeerInfo(await E(hostA).getPeerInfo());

  // A creates a value
  await E(hostA).evaluate('MAIN', '`haay wuurl`', [], [], 'salutations');
  const hostAValueIdentifier = await E(hostA).identify('salutations');

  // insert in B out of band
  await E(hostB).write(['greetings'], hostAValueIdentifier);
  const hostBValue = await E(hostB).lookup('greetings');

  // B is able to lookup value on A
  t.is(hostBValue, 'haay wuurl');

  await stop(locatorA);
  await stop(locatorB);
});

test('three party handoff', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const { makeNode } = makeMultiplayerUtil({
    testDir: 'three-party-handoff',
    dirname,
  });
  // make two nodes
  const { host: hostA, locator: locatorA } = await makeNode({
    label: 'A',
    cancelled,
  });
  const { host: hostB, locator: locatorB } = await makeNode({
    label: 'B',
    cancelled,
  });
  const { host: hostC, locator: locatorC } = await makeNode({
    label: 'C',
    cancelled,
  });

  // introduce A and B
  await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());
  await E(hostB).addPeerInfo(await E(hostA).getPeerInfo());
  // introduce B and C (but C doesnt know A)
  await E(hostC).addPeerInfo(await E(hostB).getPeerInfo());
  await E(hostB).addPeerInfo(await E(hostC).getPeerInfo());

  // A creates a value
  await E(hostA).evaluate('MAIN', '`haay wuurl`', [], [], 'salutations');

  // insert A in B out of band
  const hostAFormulaIdentifier = await E(hostA).identify('SELF');
  await E(hostB).write(['a'], hostAFormulaIdentifier);
  // insert B in C out of band
  const hostBFormulaIdentifier = await E(hostB).identify('SELF');
  await E(hostC).write(['b'], hostBFormulaIdentifier);

  const hostCValue = await E(hostC).lookup('b', 'a', 'salutations');

  // C is able to lookup value on A, despite not being directly introduced to A
  t.is(hostCValue, 'haay wuurl');

  await stop(locatorA);
  await stop(locatorB);
  await stop(locatorC);
});
