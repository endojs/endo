// @ts-check
/* global process, atob, btoa */

/**
 * Protocol unification phase 2 exit criterion: the OCapN worker peer
 * runs inside a real XS machine (`siesta-xs-worker` evaluating
 * `dist-xs/worker-peer.js`), speaks the OCapN p2p wire protocol to the
 * host over the process duct, and survives a heap-snapshot restore
 * while the host's OCapN session stays live. Requires the built
 * artifacts (see the package README):
 *
 *   `yarn workspace @endo/siesta build:xs-bundles`
 *   `cargo build --release -p siesta-xs-worker`
 *
 * When either is missing these tests are skipped.
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
import { syrupCodec } from '@endo/ocapn/syrup';

import { makePipeNetwork } from '../src/pipe-network.js';
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
    'worker-peer-xs tests skipped: build siesta-xs-worker and dist-xs first',
  );
}

// Wire swissnums are (immutable) bytes, as `enlivenSturdyRef` encodes.
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

/** @param {Uint8Array} bytes */
const encodeBase64 = bytes => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/** @param {string} text */
const decodeBase64 = text => {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
};

testXs('an XS worker peer survives snapshot restore mid-session', async t => {
  const statePath = await mkdtemp(join(tmpdir(), 'siesta-peer-xs-test-'));
  t.teardown(() => rm(statePath, { recursive: true, force: true }));
  const engine = makeXsEngine({
    workerBinary,
    bootPath,
    bundlePath,
    casPath: join(statePath, 'cas'),
  });

  const workerId = 'c'.repeat(32);

  // The duct: OCapN frames ride `{ t: 'f', b64 }` JSON envelopes over
  // the binary's deliver/outbound protocol. `incarnation` is mutable so
  // the same pipe network spans a terminate/restore.
  /** @type {import('../src/host.js').WorkerIncarnation} */
  let incarnation;
  const hostPipe = makePipeNetwork({
    codec: syrupCodec,
    workerId,
    role: 'host',
    send: bytes => {
      incarnation
        .deliver({ t: 'f', b64: encodeBase64(bytes) })
        .catch(error => t.log('deliver failed:', error.message));
    },
  });
  // The engine hands outbound duct envelopes over already parsed.
  /** @param {any} envelope */
  const onOutbound = envelope => {
    envelope.t === 'f' || t.fail(`unexpected duct envelope type ${envelope.t}`);
    hostPipe.deliver(decodeBase64(envelope.b64));
  };

  incarnation = await engine.start({
    debugName: 'peer-xs',
    snapshot: null,
    onOutbound,
  });
  t.teardown(async () => incarnation.terminate());
  await incarnation.deliver({ t: 'init', workerId, debugLabel: 'peer-xs' });

  const hostClient = await makeOcapn({
    codec: syrupCodec,
    network: hostPipe.network,
    debugLabel: 'host-of-xs-peer',
  });
  t.teardown(() => hostClient.shutdown());

  const session = await hostClient.provideSession(hostPipe.peerLocation);
  const shell = await E(session.getBootstrap()).fetch(SHELL_SWISSNUM);
  const counter = await E(shell).evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  t.is(await E(counter).incr(), 2);

  // Presences round-trip to the worker heap with identity intact.
  const registry = await E(shell).evaluate(
    `
    (() => {
      let kept;
      return Far('Registry', {
        keep: thing => {
          kept = thing;
          return 'kept';
        },
        isKept: specimen => specimen === kept,
      });
    })()
    `,
  );
  t.is(await E(registry).keep(counter), 'kept');

  // A promise minted before the snapshot: the host subscribes to it,
  // the worker's resolver lives in the heap that is about to be
  // snapshotted.
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

  // Snapshot the quiescent heap, kill the process, restore into a
  // fresh incarnation. The host's OCapN session — its import/export
  // tables and the pipe network — stays live throughout; the restored
  // heap is indistinguishable from the one that was snapshotted.
  const ref = await incarnation.snapshot();
  await incarnation.terminate();
  incarnation = await engine.start({
    debugName: 'peer-xs-restored',
    snapshot: ref,
    onOutbound,
  });

  t.is(
    await E(counter).incr(),
    3,
    'the counter continued from the restored XS heap',
  );
  t.is(await E(counter).getCount(), 3);
  t.is(
    await E(registry).isKept(counter),
    true,
    'presence identity held across the snapshot restore',
  );

  // The pre-snapshot promise settles from the restored heap.
  t.is(await E(gifter).release('gifted'), 'released');
  t.is(await gift, 'gifted');
});
