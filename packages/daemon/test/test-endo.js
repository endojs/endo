// @ts-check
/* global process */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/lockdown/commit-debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import {
  start,
  stop,
  restart,
  clean,
  reset,
  makeEndoClient,
  makeReaderRef,
} from '../index.js';

const { raw } = String;

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

/** @param {Array<string>} root */
const makeLocator = (...root) => {
  return {
    httpPort: 0,
    statePath: path.join(dirname, ...root, 'state'),
    ephemeralStatePath: path.join(dirname, ...root, 'run'),
    cachePath: path.join(dirname, ...root, 'cache'),
    sockPath:
      process.platform === 'win32'
        ? raw`\\?\pipe\endo-${root.join('-')}-test.sock`
        : path.join(dirname, ...root, 'endo.sock'),
    pets: new Map(),
    values: new Map(),
  };
};

test('lifecycle', async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator('tmp', 'lifecycle');

  await stop(locator).catch(() => {});
  await reset(locator);
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
  await E(host).terminate('worker');
  cancel(new Error('Cancelled'));
  await closed.catch(() => {});

  await stop(locator);
  t.pass();
});

test('spawn and evaluate', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator('tmp', 'spawn-eval');

  await stop(locator).catch(() => {});
  await reset(locator);
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
  t.is(10, ten);

  await stop(locator);
});

test('anonymous spawn and evaluate', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator('tmp', 'spawn-eval-anon');

  await stop(locator).catch(() => {});
  await reset(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  const ten = await E(host).evaluate('MAIN', '10', [], []);
  t.is(10, ten);

  await stop(locator);
});

test('persist spawn and evaluation', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator('tmp', 'persist-spawn-eval');

  await stop(locator).catch(() => {});
  await reset(locator);
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
    t.is(10, ten);
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
  const locator = makeLocator('tmp', 'store');

  await stop(locator).catch(() => {});
  await reset(locator);
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
  const locator = makeLocator('tmp', 'restart-closures');

  await stop(locator).catch(() => {});
  await reset(locator);
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
  const locator = makeLocator('tmp', 'make-unconfined');

  await stop(locator).catch(() => {});
  await reset(locator);
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
    await E(host).makeUnconfined('w1', servicePath, 'o1', 's1');

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

  const locator = makeLocator('tmp', 'guest-sends-host');

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

  await stop(locator);
});

test('direct termination', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));

  const locator = makeLocator('tmp', 'termination-direct');

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
  await E(host).makeUnconfined('worker', counterPath, 'NONE', 'counter');
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

  await E(host).terminate('counter');
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

  t.pass();
});

test('indirect termination', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));

  const locator = makeLocator('tmp', 'termination-indirect');

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
  await E(host).makeUnconfined('worker', counterPath, 'SELF', 'counter');
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

  await E(host).terminate('worker');

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

test('terminate because of requested capability', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));

  const locator = makeLocator('tmp', 'termination-via-request');

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
  E(host).makeUnconfined('worker', counterPath, 'guest', 'counter');

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

  await E(host).terminate('guest');

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

test('make a host', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator('tmp', 'make-host');

  await stop(locator).catch(() => {});
  await reset(locator);
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
  const locator = makeLocator('tmp', 'inspector-reuse');

  await stop(locator).catch(() => {});
  await reset(locator);
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

// TODO: This test verifies existing behavior when pet-naming workers.
// This behavior is undesirable. See: https://github.com/endojs/endo/issues/2021
test('eval-mediated worker name', async t => {
  const { promise: cancelled, reject: cancel } = makePromiseKit();
  t.teardown(() => cancel(Error('teardown')));
  const locator = makeLocator('tmp', 'eval-worker-name');

  await stop(locator).catch(() => {});
  await reset(locator);
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

  try {
    await E(host).evaluate(
      'counter-worker', // Our worker pet name
      'E(counter).incr()',
      ['counter'],
      ['counter'],
    );
    t.fail('should have thrown');
  } catch (error) {
    // This is the error that we don't want
    t.regex(error.message, /typeof target is "undefined"/u);
    await stop(locator);
  }
});
