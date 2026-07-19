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
import { makeDurableNetLayer } from '../src/durable-netlayer.js';
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

/**
 * @param {string} statePath
 * @param {number} port 0 to pick a port; a restarted daemon must pin
 *   its predecessor's port so the peer's reconnect finds it
 */
const makeDaemon = (statePath, port) =>
  makeSiestaDaemon({
    store: makeFsStore(statePath),
    engine: makeJournalReplayEngine(),
    codec: syrupCodec,
    makeNetlayer: ({ handlers, logger, resumption }) =>
      makeDurableNetLayer({
        handlers,
        logger,
        resumption,
        makeBaseNetlayer: powers =>
          makeTcpNetLayer({ ...powers, specifiedPort: port }),
      }),
  });

/** @param {string} label */
const makeDurableClient = label =>
  makeOcapn({
    codec: syrupCodec,
    debugLabel: label,
    network: (handlers, logger) =>
      makeDurableNetLayer({
        handlers,
        logger,
        makeBaseNetlayer: powers => makeTcpNetLayer(powers),
        reconnectDelayMs: 25,
      }),
  });

test('live remote references survive a daemon restart', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-durable-sess-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));

  const daemon1 = await makeDaemon(statePath, 0);
  const port = Number(daemon1.location.hints.port);
  const worker = await daemon1.host.createWorker({ debugLabel: 'counter' });
  const counter = await worker.evaluate(COUNTER_SOURCE);
  const secret = await worker.publish(counter);

  const client = await makeDurableClient('restart-client');
  t.teardown(() => client.shutdown());

  const remoteCounter = await client.enlivenSturdyRef(
    client.makeSturdyRef(daemon1.location, secret),
  );
  t.is(await E(remoteCounter).incr(), 1);
  t.is(await E(remoteCounter).incr(), 2);

  // Restart: the first daemon shuts down (parking its durable
  // sessions), and a successor process boots from the same store on
  // the same port. The client is never told anything ended.
  await daemon1.shutdown();
  const daemon2 = await makeDaemon(statePath, port);
  t.teardown(() => daemon2.shutdown());

  t.is(
    await E(remoteCounter).incr(),
    3,
    'the same live presence works across the daemon restart',
  );
  t.is(await E(remoteCounter).getCount(), 3, 'no call was lost or doubled');
});

test('a call issued while the daemon is down completes after restart', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-durable-sess2-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));

  const daemon1 = await makeDaemon(statePath, 0);
  const port = Number(daemon1.location.hints.port);
  const worker = await daemon1.host.createWorker({ debugLabel: 'counter' });
  const counter = await worker.evaluate(COUNTER_SOURCE);
  const secret = await worker.publish(counter);

  const client = await makeDurableClient('gap-client');
  t.teardown(() => client.shutdown());

  const remoteCounter = await client.enlivenSturdyRef(
    client.makeSturdyRef(daemon1.location, secret),
  );
  t.is(await E(remoteCounter).incr(), 1);

  await daemon1.shutdown();

  // The daemon is down: the call buffers in the client's netlayer,
  // which keeps trying to reconnect.
  const stalled = E(remoteCounter).incr();

  const daemon2 = await makeDaemon(statePath, port);
  t.teardown(() => daemon2.shutdown());

  t.is(await stalled, 2, 'the buffered call was delivered to the successor');
});

test('sessions survive repeated daemon restarts', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-durable-sess3-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));

  let daemon = await makeDaemon(statePath, 0);
  const port = Number(daemon.location.hints.port);
  const worker = await daemon.host.createWorker({ debugLabel: 'counter' });
  const counter = await worker.evaluate(COUNTER_SOURCE);
  const secret = await worker.publish(counter);

  const client = await makeDurableClient('serial-client');
  t.teardown(() => client.shutdown());

  const remoteCounter = await client.enlivenSturdyRef(
    client.makeSturdyRef(daemon.location, secret),
  );
  t.is(await E(remoteCounter).incr(), 1);

  for (let expected = 2; expected <= 4; expected += 1) {
    // eslint-disable-next-line no-await-in-loop
    await daemon.shutdown();
    // eslint-disable-next-line no-await-in-loop
    daemon = await makeDaemon(statePath, port);
    // eslint-disable-next-line no-await-in-loop
    t.is(await E(remoteCounter).incr(), expected);
  }
  await daemon.shutdown();
});
