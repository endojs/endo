// @ts-check
/* global process */

/**
 * Protocol unification phase 3 on the real XS engine: the durable
 * worker transport running `dist-xs/worker-peer.js` in
 * `siesta-xs-worker` — sleepy OCapN workers with real heap snapshots,
 * journal-suffix wakes, and crash recovery, all under one live OCapN
 * session on the daemon's client. Requires the built artifacts (see
 * the package README); skips itself when they are absent.
 */
import test from '@endo/ses-ava/test.js';
import harden from '@endo/harden';

import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { E } from '@endo/eventual-send';
import { makeOcapn } from '@endo/ocapn';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeDurableWorkerTransport } from '../src/durable-worker-transport.js';
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

const SHELL_SWISSNUM = bytesToImmutable(new TextEncoder().encode('shell'));

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

const DAEMON_LOCATION = harden({
  type: /** @type {const} */ ('ocapn-peer'),
  network: 'siesta-daemon',
  transport: 'siesta-daemon',
  designator: 'daemon',
  hints: /** @type {const} */ (false),
});

/** @param {import('ava').ExecutionContext} t */
const makeDaemonKit = async t => {
  /** @type {any} */
  let handlers;
  const client = await makeOcapn({
    codec: syrupCodec,
    debugLabel: 'unified-daemon-xs',
    network: (/** @type {any} */ h) => {
      handlers = h;
      return harden({
        networkId: 'siesta-daemon',
        codec: syrupCodec,
        location: DAEMON_LOCATION,
        shutdown: () => {},
      });
    },
  });
  t.teardown(() => client.shutdown());
  return { client, handlers };
};

testXs('an XS worker session sleeps, wakes, and survives crashes', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-dws-xs-test-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const engine = makeXsEngine({
    workerBinary,
    bootPath,
    bundlePath,
    casPath: join(statePath, 'cas'),
  });
  const { client, handlers } = await makeDaemonKit(t);
  const store = makeFsStore(statePath);
  const workerId = '1'.repeat(32);
  const workerStore = store.provideWorkerStore(workerId);
  const transport = makeDurableWorkerTransport({
    workerId,
    store: workerStore,
    engine,
    handlers,
    codec: syrupCodec,
    debugLabel: 'xs-sleeper',
  });
  t.teardown(() => transport.retire());
  transport.establish();

  const session = await client.provideSession(transport.peerLocation);
  const shell = await E(session.getBootstrap()).fetch(SHELL_SWISSNUM);
  const counter = await E(shell).evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  t.is(await E(counter).incr(), 2);

  // Sleep takes a real XS heap snapshot, truncates the journal, and
  // kills the process; the OCapN session stays live.
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
