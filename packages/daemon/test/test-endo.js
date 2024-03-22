// @ts-check
/* global process */

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
  purge,
  makeEndoClient,
  makeReaderRef,
} from '../index.js';
import { makeCryptoPowers } from '../src/daemon-node-powers.js';
import { formatId } from '../src/formula-identifier.js';
import { parseLocator } from '../src/locator.js';

const cryptoPowers = makeCryptoPowers(crypto);

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

/**
 * @param {ReturnType<makeLocator>} locator
 * @param {Promise<void>} cancelled
 */
const makeHost = async (locator, cancelled) => {
  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  return { host: E(bootstrap).host() };
};

/**
 * @param {ReturnType<makeLocator>} locator
 * @param {Promise<void>} cancelled
 */
const makeHostWithTestNetwork = async (locator, cancelled) => {
  const { host } = await makeHost(locator, cancelled);

  // Install test network
  const servicePath = path.join(dirname, 'src', 'networks', 'tcp-netstring.js');
  const serviceLocation = url.pathToFileURL(servicePath).href;
  const network = E(host).makeUnconfined(
    'MAIN',
    serviceLocation,
    'SELF',
    'test-network',
  );

  // set address via request
  const iteratorRef = E(host).followMessages();
  const { value: message } = await E(iteratorRef).next();
  const { number } = E.get(message);
  await E(host).evaluate('MAIN', '`127.0.0.1:0`', [], [], 'netport');
  await E(host).resolve(await number, 'netport');

  // move test network to network dir
  await network;
  await E(host).move(['test-network'], ['NETS', 'tcp']);

  return host;
};

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

let locatorPathId = 0;

/**
 * @param {string} testTitle - The title of the current test.
 * @param {number} locatorNumber - The number of the current locator. If this
 * is the n:th locator created for the current test, the locator number is n.
 */
const getLocatorDirectoryName = (testTitle, locatorNumber) => {
  const defaultPath = testTitle.replace(/\s/giu, '-').replace(/[^\w-]/giu, '');

  // We truncate the subdirectory name to 30 characters in an attempt to respect
  // the maximum Unix domain socket path length.
  // With our apologies to John Jacob Jingleheimerschmidt, for whom this may
  // not be enough.
  const basePath =
    defaultPath.length <= 22 ? defaultPath : defaultPath.slice(0, 22);
  const testId = String(locatorPathId).padStart(4, '0');
  const locatorId = String(locatorNumber).padStart(2, '0');
  const locatorSubDirectory = `${basePath}#${testId}-${locatorId}`;

  locatorPathId += 1;

  return locatorSubDirectory;
};

/** @param {import('ava').ExecutionContext<any>} t */
const prepareLocator = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  const locator = makeLocator(
    'tmp',
    getLocatorDirectoryName(t.title, t.context.length),
  );

  await stop(locator).catch(() => {});
  await purge(locator);
  await start(locator);

  const contextObj = { cancel, cancelled, locator };
  t.context.push(contextObj);
  return { ...contextObj };
};

test.beforeEach(t => {
  t.context = [];
});

test.afterEach.always(async t => {
  await Promise.allSettled(
    /** @type {Awaited<ReturnType<prepareLocator>>[]} */ (t.context).flatMap(
      ({ cancel, cancelled, locator }) => {
        cancel(Error('teardown'));
        return [cancelled, stop(locator)];
      },
    ),
  );
});

test('lifecycle', async t => {
  const { cancel, cancelled, locator } = await prepareLocator(t);

  await stop(locator);
  await restart(locator);

  const { getBootstrap, closed } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).provideWorker('worker');
  await E(host).cancel('worker');
  cancel(new Error('Cancelled'));
  await closed.catch(() => {});

  t.pass();
});

test('spawn and evaluate', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  await E(host).provideWorker('w1');
  const ten = await E(host).evaluate('w1', '10', [], []);
  t.is(ten, 10);
});

test('anonymous spawn and evaluate', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  const ten = await E(host).evaluate('MAIN', '10', [], []);
  t.is(ten, 10);
});

test('anonymous spawn and evaluate with new worker', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  const ten = await E(host).evaluate('NEW', '10', [], []);
  t.is(ten, 10);
});

// Regression test for https://github.com/endojs/endo/issues/2147
test('spawning a worker does not overwrite existing non-worker name', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  const foo = await E(host).evaluate('MAIN', '10', [], [], 'foo');
  t.is(foo, 10);

  // This resolves with the existing value of 'foo' rather than overwriting it
  // with a new worker.
  await E(host).provideWorker('foo');
  await t.throwsAsync(() => E(host).evaluate('foo', '20', [], [], 'bar'), {
    message:
      'Cannot deliver "evaluate" to target; typeof target is "undefined"',
  });
});

test('persist spawn and evaluation', async t => {
  const { cancelled, locator } = await prepareLocator(t);

  {
    const { host } = await makeHost(locator, cancelled);

    await E(host).provideWorker('w1');

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
    const { host } = await makeHost(locator, cancelled);

    const retwenty = await E(host).lookup('twenty');
    t.is(20, retwenty);
  }
});

test('store without name', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  const readerRef = makeReaderRef([new TextEncoder().encode('hello\n')]);
  const readable = await E(host).store(readerRef);
  const actualText = await E(readable).text();
  t.is(actualText, 'hello\n');
});

test('store with name', async t => {
  const { cancelled, locator } = await prepareLocator(t);

  {
    const { host } = await makeHost(locator, cancelled);
    const readerRef = makeReaderRef([new TextEncoder().encode('hello\n')]);
    const readable = await E(host).store(readerRef, 'hello-text');
    const actualText = await E(readable).text();
    t.is(actualText, 'hello\n');
  }

  {
    const { host } = await makeHost(locator, cancelled);
    const readable = await E(host).lookup('hello-text');
    const actualText = await E(readable).text();
    t.is(actualText, 'hello\n');
  }
});

test('closure state lost by restart', async t => {
  const { cancelled, locator } = await prepareLocator(t);

  {
    const { host } = await makeHost(locator, cancelled);
    await E(host).provideWorker('w1');

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
    const { host } = await makeHost(locator, cancelled);
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
});

test('persist unconfined services and their requests', async t => {
  const { cancelled, locator } = await prepareLocator(t);

  const responderFinished = (async () => {
    const { promise: followerCancelled, reject: cancelFollower } =
      makePromiseKit();
    cancelled.catch(cancelFollower);
    const { host } = await makeHost(locator, followerCancelled);
    await E(host).provideWorker('user-worker');

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
    const { host } = await makeHost(locator, cancelled);
    await E(host).provideWorker('w1');
    await E(host).provideGuest('o1');

    const servicePath = path.join(dirname, 'test', 'service.js');
    const serviceLocation = url.pathToFileURL(servicePath).href;
    await E(host).makeUnconfined('w1', serviceLocation, 'o1', 's1');

    await E(host).provideWorker('w2');
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
    const { host } = await makeHost(locator, cancelled);
    const answer = await E(host).lookup('answer');
    const number = await E(answer).value();
    t.is(number, 42);
  }
});

test('persist confined services and their requests', async t => {
  const { cancelled, locator } = await prepareLocator(t);

  const responderFinished = (async () => {
    const { promise: followerCancelled, reject: cancelFollower } =
      makePromiseKit();
    cancelled.catch(cancelFollower);
    const { host } = await makeHost(locator, followerCancelled);
    await E(host).provideWorker('user-worker');

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
    const { host } = await makeHost(locator, cancelled);
    await E(host).provideWorker('w1');
    await E(host).provideGuest('o1');

    const servicePath = path.join(dirname, 'test', 'service.js');
    await doMakeBundle(host, servicePath, bundleName =>
      E(host).makeBundle('w1', bundleName, 'o1', 's1'),
    );

    await E(host).provideWorker('w2');
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
    const { host } = await makeHost(locator, cancelled);
    const answer = await E(host).lookup('answer');
    const number = await E(answer).value();
    t.is(number, 42);
  }
});

test('guest facet receives a message for host', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

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
});

test('direct cancellation', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

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

// Regression test 1 for https://github.com/endojs/endo/issues/2074
test('indirect cancellation via worker', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

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

// Regression test 2 for https://github.com/endojs/endo/issues/2074
test.failing('indirect cancellation via caplet', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  await E(host).provideWorker('w1');
  const counterPath = path.join(dirname, 'test', 'counter.js');
  const counterLocation = url.pathToFileURL(counterPath).href;
  await E(host).makeUnconfined('w1', counterLocation, 'SELF', 'counter');

  await E(host).provideWorker('w2');
  await E(host).provideGuest('guest');
  const doublerPath = path.join(dirname, 'test', 'doubler.js');
  const doublerLocation = url.pathToFileURL(doublerPath).href;
  await E(host).makeUnconfined('w2', doublerLocation, 'guest', 'doubler');
  E(host).resolve(0, 'counter');

  t.is(
    1,
    await E(host).evaluate('w1', 'E(counter).incr()', ['counter'], ['counter']),
  );
  t.is(
    4,
    await E(host).evaluate('w2', 'E(doubler).incr()', ['doubler'], ['doubler']),
  );
  t.is(
    6,
    await E(host).evaluate('w2', 'E(doubler).incr()', ['doubler'], ['doubler']),
  );

  await E(host).cancel('counter');

  t.is(
    1,
    await E(host).evaluate('w1', 'E(counter).incr()', ['counter'], ['counter']),
  );
  t.is(
    4,
    await E(host).evaluate('w2', 'E(doubler).incr()', ['doubler'], ['doubler']),
  );
});

test('cancel because of requested capability', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  await E(host).provideWorker('worker');
  await E(host).provideGuest('guest');

  const messages = E(host).followMessages();

  const counterPath = path.join(dirname, 'test', 'counter-agent.js');
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
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

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
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

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
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  const host2 = E(host).provideHost('fellow-host');
  await E(host2).provideWorker('w1');
  const ten = await E(host2).evaluate('w1', '10', [], []);
  t.is(ten, 10);
});

test('name and reuse inspector', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

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
});

// Regression test for https://github.com/endojs/endo/issues/2021
test.failing('eval-mediated worker name', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

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
});

test('lookup with single petname', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

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
});

test('lookup with petname path (inspector)', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  await E(host).evaluate('MAIN', '10', [], [], 'ten');

  const resolvedValue = await E(host).evaluate(
    'MAIN',
    'E(SELF).lookup("INFO", "ten", "source")',
    ['SELF'],
    ['SELF'],
  );
  t.is(resolvedValue, '10');
});

test('lookup with petname path (caplet with lookup method)', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  const lookupPath = path.join(dirname, 'test', 'lookup.js');
  await E(host).makeUnconfined('MAIN', lookupPath, 'NONE', 'lookup');

  const resolvedValue = await E(host).evaluate(
    'MAIN',
    'E(SELF).lookup("lookup", "name")',
    ['SELF'],
    ['SELF'],
  );
  t.is(resolvedValue, 'Looked up: name');
});

test('lookup with petname path (value has no lookup method)', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

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
});

test('evaluate name resolved by lookup path', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  await E(host).evaluate('MAIN', '10', [], [], 'ten');

  const resolvedValue = await E(host).evaluate(
    'MAIN',
    'foo',
    ['foo'],
    [['INFO', 'ten', 'source']],
  );
  t.is(resolvedValue, '10');
});

test('list special names', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

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
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  const guest = E(host).provideGuest('guest');
  const guestsHost = E(guest).lookup('HOST');
  await t.throwsAsync(() => E(guestsHost).lookup('SELF'), {
    message: /target has no method "lookup"/u,
  });
  const revealedTarget = await E.get(guestsHost).targetId;
  t.is(revealedTarget, undefined);
});

test('read unknown node id', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  // write a bogus value for a bogus nodeId
  const node = await cryptoPowers.randomHex512();
  const number = await cryptoPowers.randomHex512();
  const id = formatId({
    node,
    number,
  });
  await E(host).write(['abc'], id);

  // observe reification failure
  await t.throwsAsync(() => E(host).lookup('abc'), {
    message: /No peer found for node identifier /u,
  });
});

test('read remote value', async t => {
  const { locator: locatorA, cancelled: cancelledA } = await prepareLocator(t);
  const { locator: locatorB, cancelled: cancelledB } = await prepareLocator(t);
  const hostA = await makeHostWithTestNetwork(locatorA, cancelledA);
  const hostB = await makeHostWithTestNetwork(locatorB, cancelledB);

  // introduce nodes to each other
  await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());
  await E(hostB).addPeerInfo(await E(hostA).getPeerInfo());

  // create value to share
  await E(hostB).evaluate('MAIN', '"hello, world!"', [], [], 'salutations');
  const hostBValueIdentifier = await E(hostB).identify('salutations');

  // insert in hostA out of band
  await E(hostA).write(['greetings'], hostBValueIdentifier);

  const hostAValue = await E(hostA).lookup('greetings');
  t.is(hostAValue, 'hello, world!');
});

test('locate local value', async t => {
  const { cancelled, locator } = await prepareLocator(t);
  const { host } = await makeHost(locator, cancelled);

  const ten = await E(host).evaluate('MAIN', '10', [], [], 'ten');
  t.is(ten, 10);

  const tenLocator = await E(host).locate('ten');
  const parsedLocator = parseLocator(tenLocator);
  t.is(parsedLocator.formulaType, 'eval');
});

test('locate local persisted value', async t => {
  const { cancelled, locator } = await prepareLocator(t);

  {
    const { host } = await makeHost(locator, cancelled);
    const ten = await E(host).evaluate('MAIN', '10', [], [], 'ten');
    t.is(ten, 10);
  }

  await restart(locator);

  {
    const { host } = await makeHost(locator, cancelled);
    const tenLocator = await E(host).locate('ten');
    const parsedLocator = parseLocator(tenLocator);
    t.is(parsedLocator.formulaType, 'eval');
  }
});

test('locate remote value', async t => {
  const { locator: locatorA, cancelled: cancelledA } = await prepareLocator(t);
  const { locator: locatorB, cancelled: cancelledB } = await prepareLocator(t);
  const hostA = await makeHostWithTestNetwork(locatorA, cancelledA);
  const hostB = await makeHostWithTestNetwork(locatorB, cancelledB);

  // introduce nodes to each other
  await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());
  await E(hostB).addPeerInfo(await E(hostA).getPeerInfo());

  // create value to share
  await E(hostB).evaluate('MAIN', '"hello, world!"', [], [], 'salutations');
  const hostBValueIdentifier = await E(hostB).identify('salutations');

  // insert in hostA out of band
  await E(hostA).write(['greetings'], hostBValueIdentifier);

  const greetingsLocator = await E(hostA).locate('greetings');
  const parsedGreetingsLocator = parseLocator(greetingsLocator);
  t.is(parsedGreetingsLocator.formulaType, 'remote');
});
