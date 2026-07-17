// @ts-check
import test from '@endo/ses-ava/test.js';

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { E } from '@endo/eventual-send';
import { makeOcapn } from '@endo/ocapn';
import { makeTcpNetLayer } from '@endo/ocapn/netlayer/tcp-testing';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeSiestaDaemon } from '../src/daemon.js';
import { makeJournalReplayEngine } from '../src/journal-replay-engine.js';
import { makeFsStore } from '../src/store-fs.js';

const COUNTER_SOURCE = `
(() => {
  let count = 0;
  return Far('Counter', {
    incr: () => {
      count += 1;
      return count;
    },
    getCount: () => count,
  });
})()
`;

const makeClient = async label => {
  const client = await makeOcapn({
    codec: syrupCodec,
    debugLabel: label,
    network: (handlers, logger) => makeTcpNetLayer({ handlers, logger }),
  });
  return client;
};

/** @param {string} statePath */
const makeDaemon = statePath =>
  makeSiestaDaemon({
    store: makeFsStore(statePath),
    engine: makeJournalReplayEngine(),
    codec: syrupCodec,
    makeNetlayer: ({ handlers, logger }) =>
      makeTcpNetLayer({ handlers, logger }),
  });

test('worker exports served as sturdy refs survive daemon restart', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-ocapn-test-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));

  let secret;
  {
    const daemon = await makeDaemon(statePath);
    const worker = await daemon.host.createWorker({ debugLabel: 'counter' });
    const counter = await worker.evaluate(COUNTER_SOURCE);
    secret = await worker.publish(counter);

    const client = await makeClient('client-1');
    const sturdyRef = client.makeSturdyRef(daemon.location, secret);
    const remoteCounter = await client.enlivenSturdyRef(sturdyRef);
    t.is(await E(remoteCounter).incr(), 1);
    t.is(await E(remoteCounter).incr(), 2);

    client.shutdown();
    await daemon.shutdown();
  }

  {
    const daemon = await makeDaemon(statePath);
    const client = await makeClient('client-2');
    const sturdyRef = client.makeSturdyRef(daemon.location, secret);
    const remoteCounter = await client.enlivenSturdyRef(sturdyRef);
    t.is(
      await E(remoteCounter).incr(),
      3,
      'worker state survived the daemon restart',
    );

    client.shutdown();
    await daemon.shutdown();
  }
});

test('a sleeping worker wakes for a sturdy ref call', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-ocapn-test-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));

  const daemon = await makeDaemon(statePath);
  const worker = await daemon.host.createWorker({ debugLabel: 'counter' });
  const counter = await worker.evaluate(COUNTER_SOURCE);
  const secret = await worker.publish(counter, 'sleepy-counter');

  const client = await makeClient('client');
  const sturdyRef = client.makeSturdyRef(daemon.location, secret);
  const remoteCounter = await client.enlivenSturdyRef(sturdyRef);
  t.is(await E(remoteCounter).incr(), 1);

  await worker.sleep();
  t.false(worker.isAwake());

  t.is(
    await E(remoteCounter).incr(),
    2,
    'the remote call transparently woke the worker',
  );
  t.true(worker.isAwake());

  client.shutdown();
  await daemon.shutdown();
});
