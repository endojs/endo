// @ts-check
import test from '@endo/ses-ava/test.js';

import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { E } from '@endo/eventual-send';
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
const makeDaemon = (statePath, port) =>
  makeSiestaDaemon({
    store: makeFsStore(statePath),
    engine: makePeerJournalReplayEngine(),
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

test('a resumed session keeps its identity, including its keys', async t => {
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
  t.regex(String(before.sessionId), /^[0-9a-f]{64}$/);
  t.regex(String(before.selfPrivateKey), /^[0-9a-f]{64}$/);

  await daemon1.shutdown();
  const daemon2 = await makeDaemon(statePath, port);
  t.teardown(() => daemon2.shutdown());
  t.is(await E(remoteCounter).incr(), 2);

  // The resumed session re-recorded its identity: same session id,
  // same session private key — not a lookalike with fresh keys.
  const after = JSON.parse(readFileSync(metaPath, 'utf8'));
  t.is(after.sessionId, before.sessionId, 'session id survives');
  t.is(
    after.selfPrivateKey,
    before.selfPrivateKey,
    'the session keys survive, so pre-restart handoff signatures keep verifying',
  );
  t.is(after.peerPublicKey, before.peerPublicKey);
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

test('an answer pending across a restart rejects instead of hanging', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-durable-ans-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));

  const daemon1 = await makeDaemon(statePath, 0);
  const port = Number(daemon1.location.hints.port);
  const worker = await daemon1.createWorker({ debugLabel: 'hanger' });
  const hanger = await worker.evaluate(
    `Far('Hanger', { hang: () => new Promise(() => {}), ping: () => 'pong' })`,
  );
  const secret = daemon1.publish(hanger);

  const client = await makeDurableClient('answer-client');
  t.teardown(() => client.shutdown());
  const remoteHanger = await client.enlivenSturdyRef(
    client.makeSturdyRef(daemon1.location, secret),
  );

  const hung = E(remoteHanger).hang();
  hung.catch(() => {});
  t.is(await E(remoteHanger).ping(), 'pong');

  // Crash, not clean shutdown: a worker owing an answer is not
  // quiescent, so a park would have to wait for it — but the journal
  // already holds everything durable. Abandon the first daemon's
  // live state exactly as a power failure would.
  await daemon1.crash();
  const daemon2 = await makeDaemon(statePath, port);
  t.teardown(() => daemon2.shutdown());

  // The computation that owed the answer died with the first daemon:
  // at-most-once means the client sees a rejection, never a hang.
  t.is(await E(remoteHanger).ping(), 'pong', 'the session itself resumed');
  await t.throwsAsync(() => hung, {
    message: /pending answer aborted/,
  });
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
