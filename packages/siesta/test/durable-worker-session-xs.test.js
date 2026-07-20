// @ts-check
/* global process */

/**
 * The durable worker transport on the real XS engine: the hub's
 * durability envelope running `dist-xs/worker-peer.js` in
 * `siesta-xs-worker` — sleepy OCapN workers with real heap snapshots,
 * journal-suffix wakes, and crash recovery, all under one live hub
 * session. Requires the built artifacts (see the package README);
 * skips itself when they are absent.
 */
import test from '@endo/ses-ava/test.js';

import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { E } from '@endo/eventual-send';
import { makeOcapn } from '@endo/ocapn';
import { makeOcapnHub } from '@endo/ocapn/hub';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeDurableWorkerTransport } from '../src/durable-worker-transport.js';
import { makePipeNetwork } from '../src/pipe-network.js';
import { makeFsStore } from '../src/store-fs.js';
import { makeXsEngine } from '../src/xs-engine.js';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const workerBinary =
  process.env.SIESTA_XS_WORKER ??
  join(repoRoot, 'target/release/siesta-xs-worker');
const bootPath = fileURLToPath(new URL('../dist-xs/boot.js', import.meta.url));
const bundlePath = fileURLToPath(
  new URL('../dist-xs/worker-peer.js', import.meta.url),
);

const available =
  existsSync(workerBinary) && existsSync(bootPath) && existsSync(bundlePath);
const testXs = available ? test.serial : test.serial.skip;
if (!available) {
  console.error(
    'durable-worker-session-xs tests skipped: build siesta-xs-worker and dist-xs first',
  );
}

const textEncoder = new TextEncoder();
/** @param {string} text */
const bytesOf = text => bytesToImmutable(textEncoder.encode(text));
const SHELL_SWISSNUM = bytesOf('shell');

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

testXs('an XS worker session sleeps, wakes, and survives crashes', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-dws-xs-test-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const engine = makeXsEngine({
    workerBinary,
    bootPath,
    bundlePath,
    casPath: join(statePath, 'cas'),
  });
  const store = makeFsStore(statePath);
  const workerId = '1'.repeat(32);
  const workerStore = store.provideWorkerStore(workerId);

  const hub = makeOcapnHub({ codec: syrupCodec });
  /** @type {any} */
  const holder = {};
  const transport = makeDurableWorkerTransport({
    workerId,
    store: workerStore,
    engine,
    debugLabel: 'xs-sleeper',
    onFrame: (/** @type {Uint8Array} */ bytes) => holder.sink.deliver(bytes),
  });
  t.teardown(() => transport.retire());
  holder.sink = hub.attachSession(workerId, {
    send: (/** @type {Uint8Array} */ bytes) => transport.write(bytes),
    durable: true,
  });
  hub.publish('worker', { session: workerId, position: 0n });

  const clientKey = 'c'.repeat(32);
  /** @type {{ sink: any, pending: Array<Uint8Array> }} */
  const outbound = { sink: undefined, pending: [] };
  const pipe = makePipeNetwork({
    codec: syrupCodec,
    workerId: clientKey,
    role: 'worker',
    send: frame => {
      if (outbound.sink === undefined) {
        outbound.pending.push(frame);
      } else {
        outbound.sink.deliver(frame);
      }
    },
  });
  const client = await makeOcapn({
    codec: syrupCodec,
    network: pipe.network,
    debugLabel: 'embedder-xs',
  });
  t.teardown(() => client.shutdown());
  const session = await client.provideSession(pipe.peerLocation);
  outbound.sink = hub.attachSession(clientKey, {
    send: (/** @type {Uint8Array} */ bytes) => pipe.deliver(bytes),
  });
  for (const frame of outbound.pending.splice(0)) {
    outbound.sink.deliver(frame);
  }

  const shell = await E(E(session.getBootstrap()).fetch(bytesOf('worker'))).fetch(
    SHELL_SWISSNUM,
  );
  const counter = await E(shell).evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  t.is(await E(counter).incr(), 2);

  // Sleep takes a real XS heap snapshot, truncates the journal, and
  // kills the process; the hub session stays live.
  await transport.sleep();
  t.false(transport.isAwake());
  const meta = workerStore.getMeta();
  const snapshotRecord = meta.snapshot;
  if (!snapshotRecord) {
    throw t.fail('sleep did not commit a heap snapshot');
  }
  t.is(typeof snapshotRecord.ref, 'string');
  t.is(meta.outboundSinceSnapshot, 0, 'the outbound watermark reset');
  t.true(
    existsSync(join(statePath, 'cas', String(snapshotRecord.ref))),
    'the snapshot is in the content-addressed store',
  );

  t.is(await E(counter).incr(), 3, 'the delivery woke the restored heap');
  t.true(transport.isAwake());

  // Crash without sleep: frames delivered since the snapshot replay
  // from the journal suffix into a fresh restore; the watermark
  // absorbs the regenerated outbound.
  await transport.crash();
  t.false(transport.isAwake());
  t.is(await E(counter).incr(), 4, 'crash recovery replayed the suffix');
  t.is(await E(counter).getCount(), 4);

  // Identity and pending promises hold across another sleep.
  const gifter = await E(shell).evaluate(
    `
    (() => {
      let release;
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
    `,
  );
  const { gift } = await E(gifter).getGift();
  await transport.sleep();
  t.is(await E(gifter).release('gifted'), 'released');
  t.is(await gift, 'gifted', 'a pre-sleep promise settled after the wake');
});
