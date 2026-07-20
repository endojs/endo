// @ts-check
import test from '@endo/ses-ava/test.js';

import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';
import { makeOcapn } from '@endo/ocapn';
import { makeTcpNetLayer } from '@endo/ocapn/netlayer/tcp-testing';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeSiestaDaemon } from '../src/daemon.js';
import { makeDurableNetLayer } from '../src/durable-netlayer.js';
import { makePeerJournalReplayEngine } from '../src/peer-replay-engine.js';
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
const makeDaemon = (statePath, port, resources = {}) =>
  makeSiestaDaemon({
    store: makeFsStore(statePath),
    engine: makePeerJournalReplayEngine(),
    codec: syrupCodec,
    resources,
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
  const worker = await daemon1.createWorker({ debugLabel: 'counter' });
  const counter = await worker.evaluate(COUNTER_SOURCE);
  const secret = daemon1.publish(counter);

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

test('a resumed session continues without a handshake', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-durable-keys-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));

  const daemon1 = await makeDaemon(statePath, 0);
  const port = Number(daemon1.location.hints.port);
  const worker = await daemon1.createWorker({ debugLabel: 'counter' });
  const counter = await worker.evaluate(COUNTER_SOURCE);
  const secret = daemon1.publish(counter);

  const client = await makeDurableClient('keys-client');
  t.teardown(() => client.shutdown());
  const remoteCounter = await client.enlivenSturdyRef(
    client.makeSturdyRef(daemon1.location, secret),
  );
  t.is(await E(remoteCounter).incr(), 1);

  const store = makeFsStore(statePath);
  const [token] = store.listSessionTokens();
  const metaPath = join(statePath, 'sessions', token, 'meta.json');
  const before = JSON.parse(readFileSync(metaPath, 'utf8'));
  t.true(before.established, 'the session recorded its frame watermarks');
  t.true(Number(before.recvSeq) > 0);

  await daemon1.shutdown();
  const daemon2 = await makeDaemon(statePath, port);
  t.teardown(() => daemon2.shutdown());
  t.is(
    await E(remoteCounter).incr(),
    2,
    'the resumed session continued: same hub rows, no new handshake',
  );

  const after = JSON.parse(readFileSync(metaPath, 'utf8'));
  t.true(
    Number(after.recvSeq) > Number(before.recvSeq),
    'the successor advanced the same watermark record',
  );
});

test('a promise resolution crosses a daemon restart', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-durable-prom-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));

  const GIFT_SOURCE = `
  (() => {
    let release = null;
    const gift = new Promise(resolve => {
      release = resolve;
    });
    return Far('Gifter', {
      getGift: () => harden({ gift }),
      release: value => {
        release(value);
        return 'released';
      },
    });
  })()
  `;

  const daemon1 = await makeDaemon(statePath, 0);
  const port = Number(daemon1.location.hints.port);
  const worker = await daemon1.createWorker({ debugLabel: 'gifter' });
  const gifter = await worker.evaluate(GIFT_SOURCE);
  const secret = daemon1.publish(gifter);

  const client = await makeDurableClient('promise-client');
  t.teardown(() => client.shutdown());
  const remoteGifter = await client.enlivenSturdyRef(
    client.makeSturdyRef(daemon1.location, secret),
  );

  // The client imports the worker's still-pending promise (and its
  // netlayer auto-subscribes to it via op:listen).
  const { gift } = await E(remoteGifter).getGift();
  /** @type {any} */
  let settled;
  const observed = Promise.resolve(gift).then(
    value => {
      settled = { value };
    },
    reason => {
      settled = { reason };
    },
  );

  await daemon1.shutdown();
  const daemon2 = await makeDaemon(statePath, port);
  t.teardown(() => daemon2.shutdown());

  // The worker resolves the promise AFTER the restart: the resolution
  // flows worker -> restored worker-promise export -> re-attached
  // resolver obligation -> client.
  t.is(await E(remoteGifter).release('gifted'), 'released');
  await observed;
  t.deepEqual(
    settled,
    { value: 'gifted' },
    'the promise a client awaited resolved across the daemon restart',
  );
});

test('an answer a resource owes rejects after a restart', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-durable-ans-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));

  // A host-resource answer is the one kind of pending obligation that
  // genuinely dies with the daemon process: worker heaps replay their
  // pending state, hub rows persist, but a resource promise lives in
  // endpoint memory. The endpoint's records reject it at-most-once on
  // restart, so the guest sees a rejection, never a hang.
  const resources = {
    gate: () =>
      Far('Gate', {
        wait: () => new Promise(() => {}),
      }),
  };

  const daemon1 = await makeDaemon(statePath, 0, resources);
  const port = Number(daemon1.location.hints.port);
  const worker = await daemon1.createWorker({ debugLabel: 'waiter' });
  const gate = daemon1.makeResource('gate');
  const waiter = await worker.evaluate(
    `
    (() => {
      let failure = null;
      E(gate)
        .wait()
        .catch(reason => {
          failure = String((reason && reason.message) || reason);
        });
      return Far('Waiter', {
        ping: () => 'pong',
        getFailure: () => failure,
      });
    })()
    `,
    ['gate'],
    [gate],
  );
  const secret = daemon1.publish(waiter);

  const client = await makeDurableClient('answer-client');
  t.teardown(() => client.shutdown());
  const remoteWaiter = await client.enlivenSturdyRef(
    client.makeSturdyRef(daemon1.location, secret),
  );
  t.is(await E(remoteWaiter).ping(), 'pong');
  t.is(await E(remoteWaiter).getFailure(), null, 'the wait is outstanding');

  // Crash, not clean shutdown: the resource promise dies with the
  // process; everything else is rows and heaps.
  await daemon1.crash();
  const daemon2 = await makeDaemon(statePath, port, resources);
  t.teardown(() => daemon2.shutdown());

  t.is(await E(remoteWaiter).ping(), 'pong', 'the session itself resumed');
  /** @type {any} */
  let failure = null;
  for (let i = 0; i < 1000 && failure === null; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    failure = await E(remoteWaiter).getFailure();
  }
  t.regex(
    String(failure),
    /aborted/,
    'the guest saw the at-most-once rejection, not a hang',
  );
});

test('a call issued while the daemon is down completes after restart', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-durable-sess2-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));

  const daemon1 = await makeDaemon(statePath, 0);
  const port = Number(daemon1.location.hints.port);
  const worker = await daemon1.createWorker({ debugLabel: 'counter' });
  const counter = await worker.evaluate(COUNTER_SOURCE);
  const secret = daemon1.publish(counter);

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
  const worker = await daemon.createWorker({ debugLabel: 'counter' });
  const counter = await worker.evaluate(COUNTER_SOURCE);
  const secret = daemon.publish(counter);

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
