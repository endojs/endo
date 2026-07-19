// @ts-check
import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
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
 * Wraps the TCP netlayer factory so a test can sever every live
 * socket, simulating network failure between two live processes.
 */
const makeDroppableTcp = () => {
  /** @type {Set<{ end: () => void }>} */
  const live = new Set();
  /** @param {{ handlers: any, logger: any }} powers */
  const factory = ({ handlers, logger }) => {
    const wrapped = harden({
      makeConnection: (netlayer, isOutgoing, socketOps) => {
        live.add(socketOps);
        return handlers.makeConnection(netlayer, isOutgoing, socketOps);
      },
      handleMessageData: handlers.handleMessageData,
      handleConnectionClose: handlers.handleConnectionClose,
    });
    return makeTcpNetLayer({ handlers: wrapped, logger });
  };
  const dropAll = () => {
    for (const socketOps of live) {
      try {
        socketOps.end();
      } catch (_error) {
        // Already gone.
      }
    }
    live.clear();
  };
  return { factory, dropAll };
};

/**
 * @param {import('ava').ExecutionContext} t
 */
const makeDurableDaemon = async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-durable-net-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const daemon = await makeSiestaDaemon({
    store: makeFsStore(statePath),
    engine: makeJournalReplayEngine(),
    codec: syrupCodec,
    makeNetlayer: ({ handlers, logger }) =>
      makeDurableNetLayer({
        handlers,
        logger,
        makeBaseNetlayer: powers => makeTcpNetLayer(powers),
      }),
  });
  return daemon;
};

/**
 * @param {string} label
 * @param {ReturnType<typeof makeDroppableTcp>['factory']} baseFactory
 */
const makeDurableClient = async (label, baseFactory) => {
  return makeOcapn({
    codec: syrupCodec,
    debugLabel: label,
    network: (handlers, logger) =>
      makeDurableNetLayer({
        handlers,
        logger,
        makeBaseNetlayer: baseFactory,
        reconnectDelayMs: 25,
      }),
  });
};

test('live remote references survive dropped connections', async t => {
  const daemon = await makeDurableDaemon(t);
  t.teardown(() => daemon.shutdown());
  const worker = await daemon.host.createWorker({ debugLabel: 'counter' });
  const counter = await worker.evaluate(COUNTER_SOURCE);
  const secret = await worker.publish(counter);

  const dropper = makeDroppableTcp();
  const client = await makeDurableClient('durable-client', dropper.factory);
  t.teardown(() => client.shutdown());

  const sturdyRef = client.makeSturdyRef(daemon.location, secret);
  const remoteCounter = await client.enlivenSturdyRef(sturdyRef);
  t.is(await E(remoteCounter).incr(), 1);

  // Sever every socket. The OCapN sessions on both sides are never
  // told; the client's netlayer reconnects with a resume preamble and
  // both sides replay unacknowledged frames.
  dropper.dropAll();
  t.is(
    await E(remoteCounter).incr(),
    2,
    'the same presence works across a dropped connection',
  );

  // A call issued immediately after the drop, before any reconnect,
  // is buffered and delivered on resume.
  dropper.dropAll();
  const stalled = E(remoteCounter).incr();
  t.is(await stalled, 3, 'a call in flight across the drop still resolves');

  // Repeated failures: each drop is survived independently.
  for (let expected = 4; expected <= 6; expected += 1) {
    dropper.dropAll();
    // eslint-disable-next-line no-await-in-loop
    t.is(await E(remoteCounter).incr(), expected);
  }
  t.is(await E(remoteCounter).getCount(), 6, 'no call was lost or doubled');
});

test('a sleeping worker wakes for a call that crossed a drop', async t => {
  const daemon = await makeDurableDaemon(t);
  t.teardown(() => daemon.shutdown());
  const worker = await daemon.host.createWorker({ debugLabel: 'counter' });
  const counter = await worker.evaluate(COUNTER_SOURCE);
  const secret = await worker.publish(counter);

  const dropper = makeDroppableTcp();
  const client = await makeDurableClient('durable-client-2', dropper.factory);
  t.teardown(() => client.shutdown());

  const remoteCounter = await client.enlivenSturdyRef(
    client.makeSturdyRef(daemon.location, secret),
  );
  t.is(await E(remoteCounter).incr(), 1);

  await worker.sleep();
  t.false(worker.isAwake());
  dropper.dropAll();

  t.is(
    await E(remoteCounter).incr(),
    2,
    'the resumed session wakes the sleeping worker',
  );
  t.true(worker.isAwake());
});
