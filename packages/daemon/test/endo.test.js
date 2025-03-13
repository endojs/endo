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
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';
import bundleSource from '@endo/bundle-source';
import {
  start,
  stop,
  restart,
  purge,
  makeEndoClient,
  makeReaderRef,
  makeRefIterator,
} from '../index.js';
import { makeCryptoPowers } from '../src/daemon-node-powers.js';
import { formatId } from '../src/formula-identifier.js';
import { idFromLocator, parseLocator } from '../src/locator.js';

/**
 * @import {EReturn} from '@endo/eventual-send';
 */

const cryptoPowers = makeCryptoPowers(crypto);

const { raw } = String;

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

/**
 * @param {AsyncIterator} asyncIterator - The iterator to take from.
 * @param {number} count - The number of values to retrieve.
 */
const takeCount = async (asyncIterator, count) => {
  const values = [];

  await null;
  // eslint-disable-next-line no-plusplus
  for (let i = 0; i < count; i++) {
    // eslint-disable-next-line no-await-in-loop
    const result = await asyncIterator.next();
    values.push(result.value);
  }
  return values;
};

/**
 * Calls `host.followNameChanges()`, takes all already-existing names from the iterator,
 * and returns the iterator.
 *
 * @param {any} host - An endo host.
 */
const prepareFollowNameChangesIterator = async host => {
  const existingNames = await E(host).list();
  const changesIterator = makeRefIterator(await E(host).followNameChanges());
  await takeCount(changesIterator, existingNames.length);
  return changesIterator;
};

/**
 * Calls `host.followLocatorNameChanges()` for the specified locator, takes the first
 * value (i.e. the array of all existing names) from the iterator, and returns the iterator.
 *
 * @param {any} host - An endo host.
 * @param {string} locator
 */
const prepareFollowLocatorNameChangesIterator = async (host, locator) => {
  await null;
  const changesIterator = makeRefIterator(
    await E(host).followLocatorNameChanges(locator),
  );
  await takeCount(changesIterator, 1);
  return changesIterator;
};

/** @param {Array<string>} root */
const makeConfig = (...root) => {
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
 * @param {ReturnType<makeConfig>} config
 * @param {Promise<void>} cancelled
 */
const makeHost = async (config, cancelled) => {
  const { getBootstrap } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  return { host: E(bootstrap).host() };
};

/**
 * @param {import('ava').ExecutionContext<any>} t
 * @returns {Promise<ReturnType<prepareConfig> & ReturnType<makeHost>>}
 */
const prepareHost = async t => {
  // eslint-disable-next-line no-use-before-define
  const { cancel, cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);
  return { cancel, cancelled, config, host };
};

/**
 * @param {import('ava').ExecutionContext<any>} t
 */
const prepareHostWithTestNetwork = async t => {
  const { host } = await prepareHost(t);

  // Install test network
  const servicePath = path.join(dirname, 'src', 'networks', 'tcp-netstring.js');
  const serviceLocation = url.pathToFileURL(servicePath).href;
  const network = E(host).makeUnconfined(
    'MAIN',
    serviceLocation,
    'AGENT',
    'test-network',
  );

  // set address via request
  const iteratorRef = E(host).followMessages();
  const { value: message } = await E(iteratorRef).next();
  const { number } = E.get(message);
  await E(host).storeValue('127.0.0.1:0', 'netport');
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

  await E(host).storeBlob(bundleReaderRef, bundleName);
  const result = await callback(bundleName);
  await E(host).remove(bundleName);
  return result;
};

let configPathId = 0;

/**
 * @param {string} testTitle - The title of the current test.
 * @param {number} configNumber - The number of the current config. If this
 * is the n:th config created for the current test, the config number is n.
 */
const getConfigDirectoryName = (testTitle, configNumber) => {
  const defaultPath = testTitle.replace(/\s/giu, '-').replace(/[^\w-]/giu, '');

  // We truncate the subdirectory name to 30 characters in an attempt to respect
  // the maximum Unix domain socket path length.
  // With our apologies to John Jacob Jingleheimerschmidt, for whom this may
  // not be enough.
  const basePath =
    defaultPath.length <= 22 ? defaultPath : defaultPath.slice(0, 22);
  const testId = String(configPathId).padStart(4, '0');
  const configId = String(configNumber).padStart(2, '0');
  const configSubDirectory = `${basePath}#${testId}-${configId}`;

  configPathId += 1;

  return configSubDirectory;
};

/** @param {import('ava').ExecutionContext<any>} t */
const prepareConfig = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  const config = makeConfig(
    'tmp',
    getConfigDirectoryName(t.title, t.context.length),
  );

  await purge(config);
  await start(config);

  const contextObj = { cancel, cancelled, config };
  t.context.push(contextObj);
  return { ...contextObj };
};

test.beforeEach(t => {
  t.context = [];
});

test.afterEach.always(async t => {
  await Promise.allSettled(
    /** @type {EReturn<typeof prepareConfig>[]} */ (t.context).flatMap(
      ({ cancel, cancelled, config }) => {
        cancel(Error('teardown'));
        return [cancelled, stop(config)];
      },
    ),
  );
});

test('lifecycle', async t => {
  const { cancel, cancelled, config } = await prepareConfig(t);

  await stop(config);
  await restart(config);

  const { getBootstrap, closed } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const host = E(bootstrap).host();
  await E(host).provideWorker(['worker']);
  await E(host).cancel('worker');
  cancel(new Error('Cancelled'));
  await closed.catch(() => {});

  t.pass();
});

test('store pass-copy values', async t => {
  const storedValue = harden({
    array: [BigInt(1), 2, '🧙', true, false],
    integer: BigInt(1),
    float: 2,
    string: '🐈‍⬛',
    true: true,
    false: false,
  });

  const { cancelled, config } = await prepareConfig(t);

  {
    const { host } = await makeHost(config, cancelled);
    await E(host).storeValue(storedValue, 'value');
  }

  await restart(config);

  {
    const { host } = await makeHost(config, cancelled);
    const restoredValue = await E(host).lookup(['value']);
    t.deepEqual(restoredValue, storedValue);
  }
});

test('store formula values', async t => {
  const { cancelled, config } = await prepareConfig(t);

  {
    const { host } = await makeHost(config, cancelled);
    await E(host).provideWorker(['w1']);
    const counter = await E(host).evaluate(
      'w1',
      `
        (() => {
          let value = 0;
          return makeExo(
            'Counter',
            M.interface('Counter', {}, { defaultGuards: 'passable' }),
            {
              incr: () => value += 1,
              decr: () => value -= 1,
            }
          );
        })();
      `,
      [],
      [],
      ['temporary-retainer'],
    );
    await E(host).storeValue(counter, 'counter');
    await E(host).remove('temporary-retainer');
  }

  await restart(config);

  {
    const { host } = await makeHost(config, cancelled);
    const counter = await E(host).lookup(['counter']);
    t.is(1, await E(counter).incr());
    t.is(2, await E(counter).incr());
  }

  await restart(config);

  {
    const { host } = await makeHost(config, cancelled);
    const counter = await E(host).lookup(['counter']);
    t.is(1, await E(counter).incr());
    t.is(2, await E(counter).incr());
  }
});

test('fail to store non-formula exos', async t => {
  const noFormulaExo = makeExo('Exo', M.interface('Exo', {}), {});
  const { cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);
  await t.throwsAsync(() => E(host).storeValue(noFormulaExo, 'exo'), {
    message: /^No corresponding formula for/,
  });
});

test('spawn and evaluate', async t => {
  const { host } = await prepareHost(t);

  await E(host).provideWorker(['w1']);
  const ten = await E(host).evaluate('w1', '10', [], []);
  t.is(ten, 10);
});

test('anonymous spawn and evaluate', async t => {
  const { host } = await prepareHost(t);

  const ten = await E(host).evaluate('MAIN', '10', [], []);
  t.is(ten, 10);
});

// Regression test for https://github.com/endojs/endo/issues/2147
test('spawning a worker does not overwrite existing non-worker name', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'foo');

  // This resolves with the existing value of 'foo' rather than overwriting it
  // with a new worker.
  await E(host).provideWorker(['foo']);
  await t.throwsAsync(() => E(host).evaluate('foo', '20', [], [], ['bar']), {
    message: 'Cannot evaluate using non-worker',
  });
});

test('persist spawn and evaluation', async t => {
  const { cancelled, config } = await prepareConfig(t);

  {
    const { host } = await makeHost(config, cancelled);

    await E(host).provideWorker(['w1']);

    const ten = await E(host).evaluate('w1', '10', [], [], ['ten']);
    t.is(ten, 10);
    const twenty = await E(host).evaluate(
      'w1',
      'number * 2',
      ['number'],
      ['ten'],
      ['twenty'],
    );

    // Forget the pet name of the intermediate formula, demonstrating that pet
    // names are ephemeral but formulas persist as long as their is a retention
    // chain among them.
    await E(host).remove('ten');

    t.is(20, twenty);
  }

  await restart(config);

  {
    const { host } = await makeHost(config, cancelled);

    const retwenty = await E(host).lookup(['twenty']);
    t.is(20, retwenty);
  }
});

test('store without name', async t => {
  const { host } = await prepareHost(t);

  const readerRef = makeReaderRef([new TextEncoder().encode('hello\n')]);
  const readable = await E(host).storeBlob(readerRef);
  const actualText = await E(readable).text();
  t.is(actualText, 'hello\n');
});

test('store with name', async t => {
  const { cancelled, config } = await prepareConfig(t);

  {
    const { host } = await makeHost(config, cancelled);
    const readerRef = makeReaderRef([new TextEncoder().encode('hello\n')]);
    const readable = await E(host).storeBlob(readerRef, 'hello-text');
    const actualText = await E(readable).text();
    t.is(actualText, 'hello\n');
  }

  {
    const { host } = await makeHost(config, cancelled);
    const readable = await E(host).lookup(['hello-text']);
    const actualText = await E(readable).text();
    t.is(actualText, 'hello\n');
  }
});

test('move renames value', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'ten');

  t.true(await E(host).has('ten'));
  t.false(await E(host).has('zehn'));

  await E(host).move(['ten'], ['zehn']);

  t.false(await E(host).has('ten'));
  t.true(await E(host).has('zehn'));
});

test('move renames value, overwriting the "to" name', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'ten');
  await E(host).storeValue('"X"', 'decimus');

  t.true(await E(host).has('ten'));
  t.true(await E(host).has('decimus'));

  await E(host).move(['ten'], ['decimus']);

  t.false(await E(host).has('ten'));
  t.true(await E(host).has('decimus'));

  const decimusValue = await E(host).lookup(['decimus']);
  t.is(decimusValue, 10);
});

test('move moves value, from the host to a different name hub', async t => {
  const { host } = await prepareHost(t);
  const directory = await E(host).makeDirectory(['directory']);

  await E(host).storeValue(10, 'ten');

  t.true(await E(host).has('ten'));
  t.false(await E(directory).has('ten'));

  await E(host).move(['ten'], ['directory', 'ten']);

  t.false(await E(host).has('ten'));
  t.true(await E(directory).has('ten'));
});

test('move renames value, for a single guest', async t => {
  const { host } = await prepareHost(t);

  const guest = await E(host).provideGuest('guest', {
    agentName: 'guest-agent',
  });

  await E(host).storeValue(10, 'ten');
  await E(host).move(['ten'], ['guest-agent', 'ten']);

  t.true(await E(guest).has('ten'));

  await E(host).move(['guest-agent', 'ten'], ['guest-agent', 'zehn']);

  t.false(await E(guest).has('ten'));
  t.true(await E(guest).has('zehn'));
});

test('move moves value, between different guests', async t => {
  const { host } = await prepareHost(t);

  const guest1 = await E(host).provideGuest('guest1', {
    agentName: 'guest1-agent',
  });
  const guest2 = await E(host).provideGuest('guest2', {
    agentName: 'guest2-agent',
  });

  await E(host).storeValue(10, 'ten');
  await E(host).move(['ten'], ['guest1-agent', 'ten']);

  t.true(await E(guest1).has('ten'));

  await E(host).move(['guest1-agent', 'ten'], ['guest2-agent', 'ten']);

  t.false(await E(guest1).has('ten'));
  t.true(await E(guest2).has('ten'));
});

test('move renames value, for a single caplet name hub', async t => {
  const { host } = await prepareHost(t);

  const nameHubPath = path.join(dirname, 'test', 'move-hub.js');
  const nameHub = await E(host).makeUnconfined(
    'MAIN',
    nameHubPath,
    'NONE',
    'name-hub',
  );

  await E(host).storeValue(10, 'ten');
  const tenId = await E(host).identify('ten');
  await E(nameHub).write(['ten'], tenId);

  t.true(await E(nameHub).has('ten'));

  await E(host).move(['name-hub', 'ten'], ['name-hub', 'zehn']);

  t.false(await E(nameHub).has('ten'));
  t.true(await E(nameHub).has('zehn'));
});

test('move moves value, between different caplet name hubs', async t => {
  const { host } = await prepareHost(t);

  const nameHubPath = path.join(dirname, 'test', 'move-hub.js');
  const nameHub1 = await E(host).makeUnconfined(
    'MAIN',
    nameHubPath,
    'NONE',
    'name-hub1',
  );
  const nameHub2 = await E(host).makeUnconfined(
    'MAIN',
    nameHubPath,
    'NONE',
    'name-hub2',
  );

  await E(host).storeValue(10, 'ten');
  const tenId = await E(host).identify('ten');
  await E(nameHub1).write(['ten'], tenId);

  t.true(await E(nameHub1).has('ten'));

  await E(host).move(['name-hub1', 'ten'], ['name-hub2', 'ten']);

  t.false(await E(nameHub1).has('ten'));
  t.true(await E(nameHub2).has('ten'));
});

test('move preserves original name if writing to new name hub fails', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'ten');

  t.true(await E(host).has('ten'));

  const failedHubPath = path.join(dirname, 'test', 'failed-hub.js');
  await E(host).makeUnconfined('MAIN', failedHubPath, 'NONE', 'failed-hub');

  await t.throwsAsync(E(host).move(['ten'], ['failed-hub', 'ten']), {
    message: 'I had one job.',
  });

  const tenValue = await E(host).lookup(['ten']);
  t.is(tenValue, 10);
});

test('closure state lost by restart', async t => {
  const { cancelled, config } = await prepareConfig(t);

  {
    const { host } = await makeHost(config, cancelled);
    await E(host).provideWorker(['w1']);

    await E(host).evaluate(
      'w1',
      `
      makeExo(
        'Counter Maker',
        M.interface('Counter Maker', {}, { defaultGuards: 'passable' }),
        {
          makeCounter: (value = 0) => makeExo(
            'Counter',
            M.interface('Counter', {}, { defaultGuards: 'passable' }),
            {
              incr: () => value += 1,
              decr: () => value -= 1,
            }
          ),
        }
      )
    `,
      [],
      [],
      ['counter-maker'],
    );
    await E(host).evaluate(
      'w1',
      `E(cm).makeCounter() `,
      ['cm'],
      ['counter-maker'],
      ['counter'],
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

  await restart(config);

  {
    const { host } = await makeHost(config, cancelled);
    await E(host).lookup(['w1']);
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
  const { cancelled, config } = await prepareConfig(t);

  const responderFinished = (async () => {
    const { promise: followerCancelled, reject: cancelFollower } =
      makePromiseKit();
    cancelled.catch(cancelFollower);
    const { host } = await makeHost(config, followerCancelled);
    await E(host).provideWorker(['user-worker']);

    await E(host).evaluate(
      'user-worker',
      `
      makeExo('Answer', M.interface('Answer', {}, { defaultGuards: 'passable' }), {
        value: () => 42,
      })
    `,
      [],
      [],
      ['grant'],
    );
    const iteratorRef = E(host).followMessages();
    const { value: message } = await E(iteratorRef).next();
    const { number, from: fromId } = E.get(message);
    const [fromName] = await E(host).reverseIdentify(await fromId);
    t.is(await fromName, 'h1');
    await E(host).resolve(await number, 'grant');
  })();

  const requesterFinished = (async () => {
    const { host } = await makeHost(config, cancelled);
    await E(host).provideWorker(['w1']);
    await E(host).provideGuest('h1', {
      agentName: 'a1',
    });

    const servicePath = path.join(dirname, 'test', 'service.js');
    const serviceLocation = url.pathToFileURL(servicePath).href;
    await E(host).makeUnconfined('w1', serviceLocation, 'a1', 's1');

    await E(host).provideWorker(['w2']);
    const answer = await E(host).evaluate(
      'w2',
      'E(service).ask()',
      ['service'],
      ['s1'],
      ['answer'],
    );
    const number = await E(answer).value();
    t.is(number, 42);
  })();

  await Promise.all([responderFinished, requesterFinished]);

  await restart(config);

  {
    const { host } = await makeHost(config, cancelled);
    const answer = await E(host).lookup(['answer']);
    const number = await E(answer).value();
    t.is(number, 42);
  }
});

test('persist confined services and their requests', async t => {
  const { cancelled, config } = await prepareConfig(t);

  const responderFinished = (async () => {
    const { promise: followerCancelled, reject: cancelFollower } =
      makePromiseKit();
    cancelled.catch(cancelFollower);
    const { host } = await makeHost(config, followerCancelled);
    await E(host).provideWorker(['user-worker']);

    await E(host).evaluate(
      'user-worker',
      `
      makeExo('Answer', M.interface('Answer', {}, { defaultGuards: 'passable' }), {
        value: () => 42,
      })
    `,
      [],
      [],
      ['grant'],
    );
    const iteratorRef = E(host).followMessages();
    const { value: message } = await E(iteratorRef).next();
    const { number, from: fromId } = E.get(message);
    const [fromName] = await E(host).reverseIdentify(await fromId);
    t.is(await fromName, 'h1');
    await E(host).resolve(await number, 'grant');
  })();

  const requesterFinished = (async () => {
    const { host } = await makeHost(config, cancelled);
    await E(host).provideWorker(['w1']);
    await E(host).provideGuest('h1', { agentName: 'a1' });

    const servicePath = path.join(dirname, 'test', 'service.js');
    await doMakeBundle(host, servicePath, bundleName =>
      E(host).makeBundle('w1', bundleName, 'a1', 's1'),
    );

    await E(host).provideWorker(['w2']);
    const answer = await E(host).evaluate(
      'w2',
      'E(service).ask()',
      ['service'],
      ['s1'],
      ['answer'],
    );
    const number = await E(answer).value();
    t.is(number, 42);
  })();

  await Promise.all([responderFinished, requesterFinished]);

  await restart(config);

  {
    const { host } = await makeHost(config, cancelled);
    const answer = await E(host).lookup(['answer']);
    const number = await E(answer).value();
    t.is(number, 42);
  }
});

test('guest facet receives a message for host', async t => {
  const { host } = await prepareHost(t);

  const guest = E(host).provideGuest('guest');
  await E(host).provideWorker(['worker']);
  await E(host).evaluate('worker', '10', [], [], ['ten1']);

  const iteratorRef = E(host).followMessages();
  E.sendOnly(guest).request('HOST', 'a number', 'number');
  const { value: message0 } = await E(iteratorRef).next();
  t.is(message0.number, 0);
  await E(host).resolve(message0.number, 'ten1');

  await E(guest).send('HOST', ['Hello, World!'], ['gift'], ['number']);

  const { value: message1 } = await E(iteratorRef).next();
  t.is(message1.number, 1);
  await E(host).adopt(message1.number, 'gift', ['ten2']);
  const ten = await E(host).lookup(['ten2']);
  t.is(ten, 10);

  const guestId = await E(host).identify('guest');
  const hostId = await E(host).identify('SELF');

  // Host should have received messages.
  const hostInbox = await E(host).listMessages();
  t.deepEqual(
    hostInbox.map(({ type, from, to }) => ({
      type,
      from,
      to,
    })),
    [
      { type: 'request', from: guestId, to: hostId },
      { type: 'package', from: guestId, to: hostId },
    ],
  );

  // Guest should have own sent messages.
  const guestInbox = await E(guest).listMessages();
  t.deepEqual(
    guestInbox.map(({ type, from, to }) => ({ type, from, to })),
    [
      { type: 'request', from: guestId, to: hostId },
      { type: 'package', from: guestId, to: hostId },
    ],
  );
});

test('followNamehanges first publishes existing names', async t => {
  const { host } = await prepareHost(t);

  const existingNames = await E(host).list();
  const changesIterator = makeRefIterator(await E(host).followNameChanges());
  const values = await takeCount(changesIterator, existingNames.length);

  t.deepEqual(values.map(value => value.add).sort(), [...existingNames].sort());
});

test('followNameChanges publishes new names', async t => {
  const { host } = await prepareHost(t);

  const changesIterator = await prepareFollowNameChangesIterator(host);

  await E(host).storeValue(10, 'ten');

  const { value } = await changesIterator.next();
  t.is(value.add, 'ten');
});

test('followNameChanges publishes removed names', async t => {
  const { host } = await prepareHost(t);

  const changesIterator = await prepareFollowNameChangesIterator(host);

  await E(host).storeValue(10, 'ten');
  await changesIterator.next();

  await E(host).remove('ten');
  const { value } = await changesIterator.next();
  t.is(value.remove, 'ten');
});

test('followNameChanges publishes renamed names', async t => {
  const { host } = await prepareHost(t);

  const changesIterator = await prepareFollowNameChangesIterator(host);

  await E(host).storeValue(10, 'ten');
  await changesIterator.next();

  await E(host).move(['ten'], ['zehn']);

  let { value } = await changesIterator.next();
  t.is(value.remove, 'ten');
  value = (await changesIterator.next()).value;
  t.is(value.add, 'zehn');
});

test('followNameChanges publishes renamed names (existing mappings for both names)', async t => {
  const { host } = await prepareHost(t);

  const changesIterator = await prepareFollowNameChangesIterator(host);

  await E(host).storeValue(10, 'ten');
  await changesIterator.next();
  await E(host).storeValue('"X"', 'decimus');
  await changesIterator.next();

  await E(host).move(['ten'], ['decimus']);

  let { value } = await changesIterator.next();
  t.is(value.remove, 'decimus');
  value = (await changesIterator.next()).value;
  t.is(value.remove, 'ten');
  value = (await changesIterator.next()).value;
  t.is(value.add, 'decimus');
});

test('followNameChanges does not notify of redundant pet store writes', async t => {
  const { host } = await prepareHost(t);

  const changesIterator = await prepareFollowNameChangesIterator(host);

  await E(host).storeValue(10, 'ten');
  await changesIterator.next();

  const tenId = await E(host).identify('ten');
  await E(host).write(['ten'], tenId);

  // Create a new value and observe its publication, proving that nothing was
  // published as as result of the redundant write.
  await E(host).storeValue(11, 'eleven');
  const { value } = await changesIterator.next();
  t.is(value.add, 'eleven');
});

test('followLocatorNameChanges first publishes existing pet name', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'ten');

  const tenLocator = await E(host).locate('ten');
  const tenLocatorSub = makeRefIterator(
    await E(host).followLocatorNameChanges(tenLocator),
  );
  const { value } = await tenLocatorSub.next();
  t.deepEqual(value, { add: tenLocator, names: ['ten'] });
});

test('followLocatorNameChanges first publishes existing special name', async t => {
  const { host } = await prepareHost(t);

  const selfLocator = await E(host).locate('SELF');
  const selfLocatorSub = makeRefIterator(
    await E(host).followLocatorNameChanges(selfLocator),
  );
  const { value } = await selfLocatorSub.next();
  t.deepEqual(value, { add: selfLocator, names: ['SELF'] });
});

test('followLocatorNameChanges first publishes existing pet and special names', async t => {
  const { host } = await prepareHost(t);

  const selfId = await E(host).identify('SELF');
  await E(host).write(['self1'], selfId);
  await E(host).write(['self2'], selfId);

  const selfLocator = await E(host).locate('SELF');
  const selfLocatorSub = makeRefIterator(
    await E(host).followLocatorNameChanges(selfLocator),
  );
  const { value } = await selfLocatorSub.next();
  t.deepEqual(value, { add: selfLocator, names: ['SELF', 'self1', 'self2'] });
});

test('followLocatorNameChanges publishes added names', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'ten');

  const tenLocator = await E(host).locate('ten');
  const changesIterator = await prepareFollowLocatorNameChangesIterator(
    host,
    tenLocator,
  );

  await E(host).write(['zehn'], idFromLocator(tenLocator));

  const { value } = await changesIterator.next();
  t.deepEqual(value, { add: tenLocator, names: ['zehn'] });
});

test('followLocatorNameChanges publishes removed names', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'ten');

  const tenLocator = await E(host).locate('ten');
  await E(host).write(['zehn'], idFromLocator(tenLocator));
  const changesIterator = await prepareFollowLocatorNameChangesIterator(
    host,
    tenLocator,
  );

  await E(host).remove('zehn');

  const { value } = await changesIterator.next();
  t.deepEqual(value, { remove: tenLocator, names: ['zehn'] });
});

test('followLocatorNameChanges publishes renamed names', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'ten');

  const tenLocator = await E(host).locate('ten');
  const changesIterator = await prepareFollowLocatorNameChangesIterator(
    host,
    tenLocator,
  );

  await E(host).move(['ten'], ['zehn']);

  let { value } = await changesIterator.next();
  t.deepEqual(value, { remove: tenLocator, names: ['ten'] });
  value = (await changesIterator.next()).value;
  t.deepEqual(value, { add: tenLocator, names: ['zehn'] });
});

test('followLocatorNameChanges publishes renamed names (existing mappings for both names)', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'ten');
  await E(host).storeValue('"X"', 'decimus');

  const tenLocator = await E(host).locate('ten');
  const decimusLocator = await E(host).locate('decimus');
  const tenChangesIterator = await prepareFollowLocatorNameChangesIterator(
    host,
    tenLocator,
  );
  const decimusChangesIterator = await prepareFollowLocatorNameChangesIterator(
    host,
    decimusLocator,
  );

  await E(host).move(['ten'], ['decimus']);

  // First, changes for "decimus"
  let { value } = await decimusChangesIterator.next();
  t.deepEqual(value, { remove: decimusLocator, names: ['decimus'] });

  // Then, changes for "ten"
  value = (await tenChangesIterator.next()).value;
  t.deepEqual(value, { remove: tenLocator, names: ['ten'] });
  value = (await tenChangesIterator.next()).value;
  t.deepEqual(value, { add: tenLocator, names: ['decimus'] });
});

test('followLocatorNameChanges does not notify of redundant pet store writes', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'ten');

  const tenLocator = await E(host).locate('ten');
  const changesIterator = await prepareFollowLocatorNameChangesIterator(
    host,
    tenLocator,
  );

  // Rewrite the value's existing name.
  await E(host).write(['ten'], idFromLocator(tenLocator));
  // Write an actually different name for the value.
  await E(host).write(['zehn'], idFromLocator(tenLocator));

  // Confirm that the redundant write is not observed.
  const { value } = await changesIterator.next();
  t.deepEqual(value, { add: tenLocator, names: ['zehn'] });
});

test('direct cancellation', async t => {
  const { host } = await prepareHost(t);

  await E(host).provideWorker(['worker']);

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
  const { host } = await prepareHost(t);

  await E(host).provideWorker(['worker']);

  const counterPath = path.join(dirname, 'test', 'counter.js');
  const counterLocation = url.pathToFileURL(counterPath).href;
  await E(host).makeUnconfined('worker', counterLocation, 'AGENT', 'counter');
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
  const { host } = await prepareHost(t);

  await E(host).provideWorker(['w1']);
  const counterPath = path.join(dirname, 'test', 'counter.js');
  const counterLocation = url.pathToFileURL(counterPath).href;
  await E(host).makeUnconfined('w1', counterLocation, 'AGENT', 'counter');

  await E(host).provideWorker(['w2']);
  await E(host).provideGuest('guest', { agentName: 'guest-agent' });
  const doublerPath = path.join(dirname, 'test', 'doubler.js');
  const doublerLocation = url.pathToFileURL(doublerPath).href;
  await E(host).makeUnconfined('w2', doublerLocation, 'guest-agent', 'doubler');
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
  const { host } = await prepareHost(t);

  await E(host).provideWorker(['worker']);
  await E(host).provideGuest('guest', { agentName: 'guest-agent' });

  const messages = E(host).followMessages();

  const counterPath = path.join(dirname, 'test', 'counter-agent.js');
  const counterLocation = url.pathToFileURL(counterPath).href;
  E(host).makeUnconfined('worker', counterLocation, 'guest-agent', 'counter');

  await E(host).evaluate('worker', '0', [], [], ['zero']);
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

  await E(host).cancel('guest-agent');

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
  const { host } = await prepareHost(t);

  await E(host).provideWorker(['worker']);

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
  const { host } = await prepareHost(t);

  await E(host).provideWorker(['worker']);

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
  const { host } = await prepareHost(t);

  const host2 = E(host).provideHost('fellow-host');
  await E(host2).provideWorker(['w1']);
  const ten = await E(host2).evaluate('w1', '10', [], []);
  t.is(ten, 10);
});

test('name and reuse inspector', async t => {
  const { host } = await prepareHost(t);

  await E(host).provideWorker(['worker']);

  const counterPath = path.join(dirname, 'test', 'counter.js');
  await E(host).makeUnconfined('worker', counterPath, 'NONE', 'counter');

  const inspector = await E(host).evaluate(
    'worker',
    'E(INFO).lookup(["counter"])',
    ['INFO'],
    ['INFO'],
    ['inspector'],
  );
  t.regex(String(inspector), /Alleged: Inspector.+make-unconfined/u);

  const worker = await E(host).evaluate(
    'worker',
    'E(inspector).lookup(["worker"])',
    ['inspector'],
    ['inspector'],
  );
  t.regex(String(worker), /Alleged: EndoWorker/u);
});

// Regression test for https://github.com/endojs/endo/issues/2021
test('eval-mediated worker name', async t => {
  const { host } = await prepareHost(t);

  await E(host).provideWorker(['worker']);

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
    'E(E(INFO).lookup(["counter"])).lookup(["worker"])',
    ['INFO'],
    ['INFO'],
    ['counter-worker'],
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
  const { host } = await prepareHost(t);

  await E(host).provideGuest('guest');
  await E(host).storeValue(10, 'ten');

  const resolvedValue = await E(host).evaluate(
    'MAIN',
    'E(AGENT).lookup(["ten"])',
    ['AGENT'],
    ['AGENT'],
  );
  t.is(resolvedValue, 10);
});

test('lookup with petname path (inspector)', async t => {
  const { host } = await prepareHost(t);

  await E(host).evaluate('MAIN', '10', [], [], ['ten']);

  const resolvedValue = await E(host).evaluate(
    'MAIN',
    'E(AGENT).lookup(["INFO", "ten", "source"])',
    ['AGENT'],
    ['AGENT'],
  );
  t.is(resolvedValue, '10');
});

test('lookup with petname path (caplet with lookup method)', async t => {
  const { host } = await prepareHost(t);

  const lookupPath = path.join(dirname, 'test', 'lookup.js');
  await E(host).makeUnconfined('MAIN', lookupPath, 'NONE', 'lookup');

  const resolvedValue = await E(host).evaluate(
    'MAIN',
    'E(AGENT).lookup(["lookup", "name"])',
    ['AGENT'],
    ['AGENT'],
  );
  t.is(resolvedValue, 'Looked up: name');
});

test('lookup with petname path (value has no lookup method)', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'ten');
  await t.throwsAsync(
    E(host).evaluate(
      'MAIN',
      'E(AGENT).lookup(["ten", "someName"])',
      ['AGENT'],
      ['AGENT'],
    ),
    { message: 'target has no method "lookup", has []' },
  );
});

test('evaluate name resolved by lookup path', async t => {
  const { host } = await prepareHost(t);

  await E(host).evaluate('MAIN', '10', [], [], ['ten']);

  const resolvedValue = await E(host).evaluate(
    'MAIN',
    'foo',
    ['foo'],
    [['INFO', 'ten', 'source']],
  );
  t.is(resolvedValue, '10');
});

test('list special names', async t => {
  const { host } = await prepareHost(t);

  const readerRef = makeReaderRef([new TextEncoder().encode('hello\n')]);
  await E(host).storeBlob(readerRef, 'hello-text');

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
  const { host } = await prepareHost(t);

  const guest = E(host).provideGuest('guest');
  const guestsHost = E(guest).lookup(['HOST']);
  await t.throwsAsync(() => E(guestsHost).lookup([]), {
    message: /target has no method "lookup"/u,
  });
  const revealedTarget = await E.get(guestsHost).targetId;
  t.is(revealedTarget, undefined);
});

test('read unknown node id', async t => {
  const { host } = await prepareHost(t);

  // write a bogus value for a bogus nodeId
  const node = await cryptoPowers.randomHex512();
  const number = await cryptoPowers.randomHex512();
  const id = formatId({
    node,
    number,
  });
  await E(host).write(['abc'], id);

  // observe reification failure
  await t.throwsAsync(() => E(host).lookup(['abc']), {
    message: /No peer found for node identifier /u,
  });
});

test('read remote value', async t => {
  const hostA = await prepareHostWithTestNetwork(t);
  const hostB = await prepareHostWithTestNetwork(t);

  // Introduce A to B (such that B becomes connected to A consequently.)
  await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());

  // create value to share
  await E(hostB).evaluate('MAIN', '"hello, world!"', [], [], ['salutations']);
  const hostBValueIdentifier = await E(hostB).identify('salutations');

  // insert in hostA out of band
  await E(hostA).write(['greetings'], hostBValueIdentifier);

  const hostAValue = await E(hostA).lookup(['greetings']);
  t.is(hostAValue, 'hello, world!');
});

test('round-trip remotable identity', async t => {
  // Also called grant matching.
  const hostA = await prepareHostWithTestNetwork(t);
  const hostB = await prepareHostWithTestNetwork(t);

  // Introduce A to B (allow B to infer A)
  await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());

  await E(hostB).evaluate(
    'MAIN',
    'Far("Echoer", { echo: value => value })',
    [],
    [],
    ['echoer'],
  );
  const echoerId = await E(hostB).identify('echoer');
  await E(hostA).write(['echoer'], echoerId);
  const survivedEcho = await E(hostA).evaluate(
    'MAIN',
    `
      const token = Far('Token', {});
      E(echoer).echo(token).then(allegedlyIdenticalToken =>
        token === allegedlyIdenticalToken
      );
    `,
    ['echoer'],
    ['echoer'],
  );
  t.assert(survivedEcho);
});

test('hello from afar', async t => {
  // Also called grant matching.
  const hostA = await prepareHostWithTestNetwork(t);
  const hostB = await prepareHostWithTestNetwork(t);

  // Introduce B to A
  await E(hostB).addPeerInfo(await E(hostA).getPeerInfo());

  // Induce B to connect to A
  await E(hostA).evaluate('MAIN', '42', [], [], ['ft']);
  const ftId = await E(hostA).identify('ft');
  await E(hostB).write(['ft'], ftId);
  const ft = await E(hostB).lookup(['ft']);
  t.is(ft, 42);

  await E(hostB).evaluate(
    'MAIN',
    'Far("Echoer", { echo: value => value })',
    [],
    [],
    ['echoer'],
  );
  const echoerId = await E(hostB).identify('echoer');
  await E(hostA).write(['echoer'], echoerId);
  const survivedEcho = await E(hostA).evaluate(
    'MAIN',
    `
      const token = Far('Token', {});
      E(echoer).echo(token).then(allegedlyIdenticalToken =>
        token === allegedlyIdenticalToken
      );
    `,
    ['echoer'],
    ['echoer'],
  );
  t.assert(survivedEcho);
});

test('locate local value', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'ten');

  const tenLocator = await E(host).locate('ten');
  const parsedLocator = parseLocator(tenLocator);
  t.is(parsedLocator.formulaType, 'marshal');
});

test('locate local persisted value', async t => {
  const { cancelled, config } = await prepareConfig(t);

  {
    const { host } = await makeHost(config, cancelled);
    await E(host).storeValue(10, 'ten');
  }

  await restart(config);

  {
    const { host } = await makeHost(config, cancelled);
    const tenLocator = await E(host).locate('ten');
    const parsedLocator = parseLocator(tenLocator);
    t.is(parsedLocator.formulaType, 'marshal');
  }
});

test('locate remote value', async t => {
  const hostA = await prepareHostWithTestNetwork(t);
  const hostB = await prepareHostWithTestNetwork(t);

  // introduce nodes to each other
  await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());
  await E(hostB).addPeerInfo(await E(hostA).getPeerInfo());

  // create value to share
  await E(hostB).evaluate('MAIN', '"hello, world!"', [], [], ['salutations']);
  const hostBValueIdentifier = await E(hostB).identify('salutations');

  // insert in hostA out of band
  await E(hostA).write(['greetings'], hostBValueIdentifier);

  const greetingsLocator = await E(hostA).locate('greetings');
  const parsedGreetingsLocator = parseLocator(greetingsLocator);
  t.is(parsedGreetingsLocator.formulaType, 'remote');
});

test('invite, accept, and send mail', async t => {
  const hostA = await prepareHostWithTestNetwork(t);
  const hostB = await prepareHostWithTestNetwork(t);

  const invitation = await E(hostA).invite('bob');
  const invitationLocator = await E(invitation).locate();
  await E(hostB).accept(invitationLocator, 'alice');

  // create value to share
  await E(hostA).evaluate('MAIN', '"hello, world!"', [], [], ['salutations']);
  const expectedSalutationsId = await E(hostA).identify('salutations');
  await E(hostA).send('bob', ['Hello'], ['salutations'], ['salutations']);

  const messages = await E(hostB).listMessages();
  const {
    strings: [hi],
    names: [salutationsName],
    ids: [salutationsId],
  } = messages.find(({ number }) => number === 1);
  t.is(hi, 'Hello');
  t.is(salutationsName, 'salutations');
  t.is(salutationsId, expectedSalutationsId);
});

test('reverse locate local value', async t => {
  const { host } = await prepareHost(t);

  await E(host).storeValue(10, 'ten');

  const tenLocator = await E(host).locate('ten');
  const [reverseLocatedName] = await E(host).reverseLocate(tenLocator);
  t.is(reverseLocatedName, 'ten');
});

test('reverse locate local persisted value', async t => {
  const { cancelled, config } = await prepareConfig(t);

  {
    const { host } = await makeHost(config, cancelled);
    await E(host).storeValue(10, 'ten');
  }

  await restart(config);

  {
    const { host } = await makeHost(config, cancelled);
    const tenLocator = await E(host).locate('ten');
    const [reverseLocatedName] = await E(host).reverseLocate(tenLocator);
    t.is(reverseLocatedName, 'ten');
  }
});

test('reverse locate remote value', async t => {
  const hostA = await prepareHostWithTestNetwork(t);
  const hostB = await prepareHostWithTestNetwork(t);

  // introduce nodes to each other
  await E(hostA).addPeerInfo(await E(hostB).getPeerInfo());
  await E(hostB).addPeerInfo(await E(hostA).getPeerInfo());

  // create value to share
  await E(hostB).evaluate('MAIN', '"hello, world!"', [], [], ['salutations']);
  const hostBValueIdentifier = await E(hostB).identify('salutations');

  // insert in hostA out of band
  await E(hostA).write(['greetings'], hostBValueIdentifier);

  const greetingsLocator = await E(hostA).locate('greetings');
  const [reverseLocatedName] = await E(hostA).reverseLocate(greetingsLocator);
  t.is(reverseLocatedName, 'greetings');
});
