/**
 * Tests simulating a subscription pattern like daemon's followNameChanges.
 * The generator doesn't complete immediately - it waits for external events.
 */
import test from '@endo/ses-ava/prepare-endo.js';

import { Far } from '@endo/far';
import { makeCapTP, E } from '@endo/captp';
import { makePipe, makeQueue } from '@endo/stream';
import { makePromiseKit } from '@endo/promise-kit';
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
 * Create a simple pub/sub topic like daemon's pubsub.js
 */
const makeTopic = () => {
  const subscribers = new Set();
  return {
    publish(value) {
      for (const sub of subscribers) {
        sub.put(value);
      }
    },
    subscribe() {
      const queue = makeQueue();
      subscribers.add(queue);
      return {
        async next() {
          const value = await queue.get();
          return { done: false, value };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    },
  };
};

test('subscription-captp: simple trigger case', async t => {
  const { promise: trigger, resolve: fire } = makePromiseKit();

  async function* followChanges() {
    yield harden({ add: 'INITIAL' });
    await trigger;
    yield harden({ add: 'TRIGGERED' });
  }

  const host = Far('Host', {
    followChanges: () => readerFromIterator(followChanges()),
    fire: () => fire(undefined),
  });

  const bootstrap = Far('bootstrap', {
    getHost() {
      return host;
    },
  });

  const { getBootstrap } = makeStreamCapTP('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const remoteHost = await E(remoteBootstrap).getHost();

  const changesIterator = iterateReader(E(remoteHost).followChanges());

  const v1 = await changesIterator.next();
  t.false(v1.done);
  t.is(/** @type {{add: string}} */ (v1.value).add, 'INITIAL');

  await E(remoteHost).fire();

  const v2 = await changesIterator.next();
  t.false(v2.done);
  t.is(/** @type {{add: string}} */ (v2.value).add, 'TRIGGERED');

  const v3 = await changesIterator.next();
  t.true(v3.done);
});

test('subscription-captp: long-lived subscription', async t => {
  const nameChangesTopic = makeTopic();

  async function* followNameChanges() {
    yield harden({ add: 'MAIN' });
    yield harden({ add: 'SELF' });
    const subscription = nameChangesTopic.subscribe();
    for await (const change of subscription) {
      yield change;
    }
  }

  const host = Far('Host', {
    list: () => ['MAIN', 'SELF'],
    followNameChanges: () => readerFromIterator(followNameChanges()),
    addName: name => {
      nameChangesTopic.publish(harden({ add: name }));
    },
  });

  const bootstrap = Far('bootstrap', {
    getHost() {
      return host;
    },
  });

  const { getBootstrap } = makeStreamCapTP('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const remoteHost = await E(remoteBootstrap).getHost();
  const existingNames = await E(remoteHost).list();
  t.deepEqual(existingNames, ['MAIN', 'SELF']);

  // buffer=1 so the generator advances past subscribe() before addName is called.
  // With buffer=0 (fully synchronized), the generator wouldn't subscribe until
  // after the third next() call, causing addName to publish to no subscribers.
  const changesIterator = iterateReader(E(remoteHost).followNameChanges(), {
    buffer: 1,
  });

  const v1 = await changesIterator.next();
  t.false(v1.done);
  t.is(/** @type {{add: string}} */ (v1.value).add, 'MAIN');

  const v2 = await changesIterator.next();
  t.false(v2.done);
  t.is(/** @type {{add: string}} */ (v2.value).add, 'SELF');

  await E(remoteHost).addName('NEW');

  const v3 = await changesIterator.next();
  t.false(v3.done);
  t.is(/** @type {{add: string}} */ (v3.value).add, 'NEW');
});

test('subscription-captp: subscription with pre-ack buffer', async t => {
  const nameChangesTopic = makeTopic();

  async function* followNameChanges() {
    yield harden({ add: 'MAIN' });
    const subscription = nameChangesTopic.subscribe();
    for await (const change of subscription) {
      yield change;
    }
  }

  const host = Far('Host', {
    list: () => ['MAIN'],
    followNameChanges: () => readerFromIterator(followNameChanges()),
    addName: name => {
      nameChangesTopic.publish(harden({ add: name }));
    },
  });

  const bootstrap = Far('bootstrap', {
    getHost() {
      return host;
    },
  });

  const { getBootstrap } = makeStreamCapTP('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const remoteHost = await E(remoteBootstrap).getHost();

  const changesIterator = iterateReader(E(remoteHost).followNameChanges(), {
    buffer: 3,
  });

  const v1 = await changesIterator.next();
  t.is(/** @type {{add: string}} */ (v1.value).add, 'MAIN');

  await E(remoteHost).addName('A');
  await E(remoteHost).addName('B');

  const v2 = await changesIterator.next();
  t.is(/** @type {{add: string}} */ (v2.value).add, 'A');

  const v3 = await changesIterator.next();
  t.is(/** @type {{add: string}} */ (v3.value).add, 'B');
});

test('subscription-captp: early close stops subscription', async t => {
  const host = Far('Host', {
    followNameChanges: () =>
      readerFromIterator(
        (async function* followNameChanges() {
          yield harden({ add: 'MAIN' });
          yield harden({ add: 'SECOND' });
        })(),
      ),
  });

  const bootstrap = Far('bootstrap', {
    getHost() {
      return host;
    },
  });

  const { getBootstrap } = makeStreamCapTP('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const remoteHost = await E(remoteBootstrap).getHost();
  const changesIterator = iterateReader(E(remoteHost).followNameChanges());

  // Get first value
  const r1 = await changesIterator.next();
  t.false(r1.done);
  t.is(/** @type {{add: string}} */ (r1.value).add, 'MAIN');

  // Early close
  assert(changesIterator.return, 'iterator should have return method');
  await changesIterator.return();

  // Should be done after return()
  const result = await changesIterator.next();
  t.true(result.done);
});
