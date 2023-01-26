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

const testUnlessWindows = test;

test.serial('lifecycle', async t => {
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
  const worker = await E(bootstrap).makeWorker();
  await E(worker)
    .terminate()
    .catch(() => {});
  cancel(new Error('Cancelled'));
  await closed.catch(() => {});

  t.pass();
});

testUnlessWindows('spawn and evaluate', async t => {
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

  const worker = E(bootstrap).makeWorker();
  const ten = await E(worker).evaluate('10', [], []);
  t.is(10, ten);

  await stop(locator);
});

testUnlessWindows('persist spawn and evaluation', async t => {
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

    const worker = E(bootstrap).makeWorker();
    const ten = await E(worker).evaluate('10', [], [], 'ten');
    t.is(10, ten);
    const twenty = await E(worker).evaluate(
      'number * 2',
      ['number'],
      ['ten'],
      'twenty',
    );

    // TODO
    // Erase the pet name for 'ten', demonstrating that the evaluation record
    // does not retain its dependencies by their name.
    // await E(worker).forget('ten');

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

    const retwenty = await E(bootstrap).provide('twenty');
    t.is(20, retwenty);
  }

  await stop(locator);
});

testUnlessWindows('store', async t => {
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
    const readerRef = makeReaderRef([new TextEncoder().encode('hello\n')]);
    await E(bootstrap).store(readerRef, 'helloText');
  }

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();
    const readable = await E(bootstrap).provide('helloText');
    const actualText = await E(readable).text();
    t.is(actualText, 'hello\n');
  }
});

testUnlessWindows('closure state lost by restart', async t => {
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
    const worker = await E(bootstrap).makeWorker('w1');
    await E(worker).evaluate(
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
    await E(worker).evaluate(
      `E(cm).makeCounter() `,
      ['cm'],
      ['counterMaker'],
      'counter',
    );
    const one = await E(worker).evaluate(
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    const two = await E(worker).evaluate(
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    const three = await E(worker).evaluate(
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
    const worker = await E(bootstrap).provide('w1');
    const one = await E(worker).evaluate(
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    const two = await E(worker).evaluate(
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    const three = await E(worker).evaluate(
      `E(counter).incr()`,
      ['counter'],
      ['counter'],
    );
    t.is(one, 1);
    t.is(two, 2);
    t.is(three, 3);
  }
});

testUnlessWindows(
  'persist import-unsafe0 services and their requests',
  async t => {
    const { promise: cancelled } = makePromiseKit();
    const locator = makeLocator('tmp', 'import-unsafe0');

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
      const worker = await E(bootstrap).makeWorker('userWorker');
      await E(worker).evaluate(
        `
      Far('Answer', {
        value: () => 42,
      })
    `,
        [],
        [],
        'answer',
      );
      const iteratorRef = E(bootstrap).followInbox();
      const { value: message } = await E(iteratorRef).next();
      const { number } = E.get(message);
      await E(bootstrap).resolve(await number, 'answer');
    })();

    const workflowFinished = (async () => {
      const { getBootstrap } = await makeEndoClient(
        'client',
        locator.sockPath,
        cancelled,
      );
      const bootstrap = getBootstrap();
      const w1 = await E(bootstrap).makeWorker('w1');
      const servicePath = path.join(dirname, 'test', 'service.js');
      await E(w1).importUnsafe0(servicePath, 's1');

      const w2 = await E(bootstrap).makeWorker('w2');
      const answer = await E(w2).evaluate(
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
      const answer = await E(bootstrap).provide('answer');
      const number = await E(answer).value();
      t.is(number, 42);
    }
  },
);
