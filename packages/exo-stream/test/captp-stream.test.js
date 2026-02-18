/**
 * Tests using CapTP with stream-based message passing, similar to daemon.
 * This uses makePipe from @endo/stream to create async iterables for messages.
 */
import test from '@endo/ses-ava/prepare-endo.js';

import { Far } from '@endo/far';
import { makeCapTP, E } from '@endo/captp';
import { makePipe } from '@endo/stream';
import { readerFromIterator } from '../reader-from-iterator.js';
import { iterateReader } from '../iterate-reader.js';

/**
 * Create a CapTP connection using stream-based message passing.
 * This mimics how the daemon sets up connections.
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
    abort: () => {
      nearCapTP.abort();
      farCapTP.abort();
      nearToFarWriter.return(undefined);
      farToNearWriter.return(undefined);
    },
  };
};

test('stream-captp: single-item reader', async t => {
  async function* singleItem() {
    yield harden({ msg: 'hello' });
  }

  const localReader = readerFromIterator(singleItem());

  const bootstrap = Far('bootstrap', {
    getReader() {
      return localReader;
    },
  });

  const { getBootstrap } = makeStreamCapTP('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const remoteReader = await E(remoteBootstrap).getReader();
  const reader = iterateReader(remoteReader);

  const r1 = await reader.next();
  t.false(r1.done);
  t.deepEqual(r1.value, { msg: 'hello' });

  const r2 = await reader.next();
  t.true(r2.done);
});

test('stream-captp: empty reader', async t => {
  async function* emptyGen() {
    // yields nothing
  }

  const localReader = readerFromIterator(emptyGen());

  const bootstrap = Far('bootstrap', {
    getReader() {
      return localReader;
    },
  });

  const { getBootstrap } = makeStreamCapTP('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const remoteReader = await E(remoteBootstrap).getReader();
  const reader = iterateReader(remoteReader);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.is(results.length, 0);
});

test('stream-captp: multi-item reader', async t => {
  async function* multiItem() {
    yield harden({ n: 1 });
    yield harden({ n: 2 });
    yield harden({ n: 3 });
  }

  const localReader = readerFromIterator(multiItem());

  const bootstrap = Far('bootstrap', {
    getReader() {
      return localReader;
    },
  });

  const { getBootstrap } = makeStreamCapTP('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const remoteReader = await E(remoteBootstrap).getReader();
  const reader = iterateReader(remoteReader);

  const results = [];
  for await (const value of reader) {
    results.push(value);
  }

  t.deepEqual(results, [{ n: 1 }, { n: 2 }, { n: 3 }]);
});

test('stream-captp: return(value) matches native behavior', async t => {
  // Native behavior baseline: iterator.return(value) returns {done: true, value}
  async function* generate() {
    yield harden({ n: 1 });
    yield harden({ n: 2 });
    yield harden({ n: 3 });
  }

  const localReader = readerFromIterator(generate());

  const bootstrap = Far('bootstrap', {
    getReader() {
      return localReader;
    },
  });

  const { getBootstrap } = makeStreamCapTP('test', bootstrap);
  const remoteBootstrap = getBootstrap();

  const remoteReader = await E(remoteBootstrap).getReader();
  const reader = iterateReader(remoteReader);

  // Get first value
  const first = await reader.next();
  t.deepEqual(first, { value: { n: 1 }, done: false });

  // Call return() to close the reader early
  assert(reader.return, 'iterator should have return method');
  const returned = await reader.return();
  t.deepEqual(returned, { value: undefined, done: true });

  // Subsequent calls to return() also return done
  const returned2 = await reader.return();
  t.deepEqual(returned2, { value: undefined, done: true });

  // next() after return should still show done
  const afterReturn = await reader.next();
  t.deepEqual(afterReturn, { value: undefined, done: true });
});
