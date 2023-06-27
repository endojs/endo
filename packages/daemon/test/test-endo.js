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
  const inbox = E(bootstrap).inbox();
  const worker = await E(inbox).makeWorker();
  await E(worker)
    .terminate()
    .catch(() => {});
  cancel(new Error('Cancelled'));
  await closed.catch(() => {});

  t.pass();
});

test('spawn and evaluate', async t => {
  const { promise: cancelled } = makePromiseKit();
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
  const inbox = E(bootstrap).inbox();
  await E(inbox).makeWorker('w1');
  const ten = await E(inbox).evaluate('w1', '10', [], []);
  t.is(10, ten);

  await stop(locator);
});

test('anonymous spawn and evaluate', async t => {
  const { promise: cancelled } = makePromiseKit();
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
  const inbox = E(bootstrap).inbox();
  const ten = await E(inbox).evaluate(undefined, '10', [], []);
  t.is(10, ten);

  await stop(locator);
});

test('persist spawn and evaluation', async t => {
  const { promise: cancelled } = makePromiseKit();
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
    const inbox = E(bootstrap).inbox();

    await E(inbox).makeWorker('w1');

    const ten = await E(inbox).evaluate('w1', '10', [], [], 'ten');
    t.is(10, ten);
    const twenty = await E(inbox).evaluate(
      'w1',
      'number * 2',
      ['number'],
      ['ten'],
      'twenty',
    );

    // Forget the pet name of the intermediate formula, demonstrating that pet
    // names are ephemeral but formulas persist as long as their is a retention
    // chain among them.
    await E(inbox).remove('ten');

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
    const inbox = E(bootstrap).inbox();

    const retwenty = await E(inbox).provide('twenty');
    t.is(20, retwenty);
  }

  await stop(locator);
});

test('store', async t => {
  const { promise: cancelled } = makePromiseKit();
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
    const inbox = E(bootstrap).inbox();
    const readerRef = makeReaderRef([new TextEncoder().encode('hello\n')]);
    await E(inbox).store(readerRef, 'helloText');
  }

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const inbox = E(bootstrap).inbox();
    const readable = await E(inbox).provide('helloText');
    const actualText = await E(readable).text();
    t.is(actualText, 'hello\n');
  }
});

test('closure state lost by restart', async t => {
  const { promise: cancelled } = makePromiseKit();
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
    const inbox = E(bootstrap).inbox();
    await E(inbox).makeWorker('w1');

    await E(inbox).evaluate(
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
      'counterMaker',
    );
    await E(inbox).evaluate(
      'w1',
      `E(cm).makeCounter() `,
      ['cm'],
      ['counterMaker'],
      'counter',
    );
    const one = await E(inbox).evaluate(
      'w1',
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    const two = await E(inbox).evaluate(
      'w1',
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    const three = await E(inbox).evaluate(
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
    const inbox = E(bootstrap).inbox();
    await E(inbox).provide('w1');
    const one = await E(inbox).evaluate(
      'w1',
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    const two = await E(inbox).evaluate(
      'w1',
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    const three = await E(inbox).evaluate(
      'w1',
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    t.is(one, 1);
    t.is(two, 2);
    t.is(three, 3);
  }
});

test('persist unsafe services and their requests', async t => {
  const { promise: cancelled } = makePromiseKit();
  const locator = makeLocator('tmp', 'import-unsafe');

  await stop(locator).catch(() => {});
  await reset(locator);
  await start(locator);

  const inboxFinished = (async () => {
    const { promise: followerCancelled, reject: cancelFollower } =
      makePromiseKit();
    cancelled.catch(cancelFollower);
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      followerCancelled,
    );
    const bootstrap = getBootstrap();
    const inbox = E(bootstrap).inbox();
    await E(inbox).makeWorker('userWorker');
    await E(inbox).evaluate(
      'userWorker',
      `
      Far('Answer', {
        value: () => 42,
      })
    `,
      [],
      [],
      'grant',
    );
    const iteratorRef = E(inbox).followMessages();
    const { value: message } = await E(iteratorRef).next();
    const { number, who } = E.get(message);
    t.is(await who, 'o1');
    await E(inbox).resolve(await number, 'grant');
  })();

  const workflowFinished = (async () => {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const inbox = E(bootstrap).inbox();
    await E(inbox).makeWorker('w1');
    await E(inbox).makeOutbox('o1');
    const servicePath = path.join(dirname, 'test', 'service.js');
    await E(inbox).importUnsafeAndEndow('w1', servicePath, 'o1', 's1');

    await E(inbox).makeWorker('w2');
    const answer = await E(inbox).evaluate(
      'w2',
      'E(service).ask()',
      ['service'],
      ['s1'],
      'answer',
    );
    const number = await E(answer).value();
    t.is(number, 42);
  })();

  await Promise.all([inboxFinished, workflowFinished]);

  await restart(locator);

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const inbox = E(bootstrap).inbox();
    const answer = await E(inbox).provide('answer');
    const number = await E(answer).value();
    t.is(number, 42);
  }
});
