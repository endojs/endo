/* eslint-disable no-await-in-loop */
/**
 * Tests using CapTP with async generators wrapped in readerFromIterator,
 * similar to how the daemon uses followNameChanges.
 */
import test from '@endo/ses-ava/prepare-endo.js';

import { Far } from '@endo/far';
import { makeCapTP, E } from '@endo/captp';
import { makePipe } from '@endo/stream';
import { readerFromIterator } from '../reader-from-iterator.js';
import { iterateReader } from '../iterate-reader.js';

/**
 * Create a CapTP connection using stream-based message passing.
 *
 * @param {string} name - Name for the connection
 * @param {unknown} bootstrap - Bootstrap object to expose
 */
const makeStreamCapTP = (name, bootstrap) => {
  const [nearToFarReader, nearToFarWriter] = makePipe();
  const [farToNearReader, farToNearWriter] = makePipe();

  const nearSend = async message => {
    await nearToFarWriter.next(message);
  };

  const farSend = async message => {
    await farToNearWriter.next(message);
  };

  const nearCapTP = makeCapTP(`near-${name}`, nearSend, undefined);
  const farCapTP = makeCapTP(`far-${name}`, farSend, bootstrap);

  (async () => {
    for await (const message of farToNearReader) {
      nearCapTP.dispatch(message);
    }
  })();

  (async () => {
    for await (const message of nearToFarReader) {
      farCapTP.dispatch(message);
    }
  })();

  return {
    getBootstrap: nearCapTP.getBootstrap,
  };
};

/**
 * Creates a "host" like the daemon does.
 * The host has a followNameChanges method that returns a reader.
 */
const makeHost = () => {
  async function* followNameChanges() {
    yield harden({ add: 'MAIN', value: { number: '123' } });
    yield harden({ add: 'SELF', value: { number: '456' } });
  }

  const host = {
    list: () => ['MAIN', 'SELF'],
    followNameChanges,
  };

  const hostExo = Far('Host', {
    list: () => host.list(),
    followNameChanges: () => readerFromIterator(host.followNameChanges()),
  });

  return hostExo;
};

test('generator-captp: follow name changes pattern', async t => {
  const localHost = makeHost();

  const bootstrap = Far('bootstrap', {
    getHost() {
      return localHost;
    },
  });

  const { getBootstrap } = makeStreamCapTP('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const host = await E(remoteBootstrap).getHost();

  const existingNames = await E(host).list();
  t.deepEqual(existingNames, ['MAIN', 'SELF']);

  const changesIterator = iterateReader(E(host).followNameChanges());

  const values = [];
  const nameCount = /** @type {string[]} */ (existingNames).length;
  for (let i = 0; i < nameCount; i += 1) {
    const result = await changesIterator.next();
    if (result.done) break;
    values.push(result.value);
  }

  t.is(values.length, 2);
  t.deepEqual(values[0], { add: 'MAIN', value: { number: '123' } });
  t.deepEqual(values[1], { add: 'SELF', value: { number: '456' } });

  const done = await changesIterator.next();
  t.true(done.done);
});

test('generator-captp: follow name changes with takeCount helper', async t => {
  const localHost = makeHost();

  const bootstrap = Far('bootstrap', {
    getHost() {
      return localHost;
    },
  });

  const { getBootstrap } = makeStreamCapTP('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const host = await E(remoteBootstrap).getHost();
  const existingNames = await E(host).list();

  const changesIterator = iterateReader(E(host).followNameChanges());

  const values = [];
  let remaining = /** @type {string[]} */ (existingNames).length;
  while (remaining > 0) {
    const result = await changesIterator.next();
    if (result.done) break;
    values.push(result.value);
    remaining -= 1;
  }

  t.is(values.length, 2);
  t.deepEqual(values.map(v => /** @type {{add: string}} */ (v).add).sort(), [
    'MAIN',
    'SELF',
  ]);
});

test('generator-captp: long running generator', async t => {
  async function* counterGen() {
    for (let i = 0; i < 10; i += 1) {
      yield harden({ count: i });
    }
  }

  const localReader = readerFromIterator(counterGen());

  const bootstrap = Far('bootstrap', {
    getReader() {
      return localReader;
    },
  });

  const { getBootstrap } = makeStreamCapTP('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const remoteReader = await E(remoteBootstrap).getReader();
  const reader = iterateReader(remoteReader);

  const values = [];
  for await (const value of reader) {
    values.push(value);
  }

  t.is(values.length, 10);
  t.deepEqual(values[0], { count: 0 });
  t.deepEqual(values[9], { count: 9 });
});
