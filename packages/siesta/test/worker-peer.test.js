// @ts-check
import test from '@endo/ses-ava/test.js';

import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { E } from '@endo/eventual-send';
import { makeOcapn } from '@endo/ocapn';
import { makeTcpNetLayer } from '@endo/ocapn/netlayer/tcp-testing';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makePipeNetwork, workerPipeLocation } from '../src/pipe-network.js';
import { makeRoutingNetwork } from '../src/routing-network.js';
import { makeWorkerPeer } from '../src/worker-peer.js';

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

/**
 * An in-process duct: each side's outbound frames arrive at the other
 * side on a microtask hop, decoupling the two dispatch stacks the way
 * a real pipe would.
 */
const makeDuct = () => {
  /** @type {{ toWorker?: (bytes: Uint8Array) => void, toHost?: (bytes: Uint8Array) => void }} */
  const ends = {};
  return {
    /** @param {Uint8Array} bytes */
    hostSend: bytes => {
      Promise.resolve().then(() => ends.toWorker && ends.toWorker(bytes));
    },
    /** @param {Uint8Array} bytes */
    workerSend: bytes => {
      Promise.resolve().then(() => ends.toHost && ends.toHost(bytes));
    },
    /** @param {(bytes: Uint8Array) => void} fn */
    bindWorker: fn => {
      ends.toWorker = fn;
    },
    /** @param {(bytes: Uint8Array) => void} fn */
    bindHost: fn => {
      ends.toHost = fn;
    },
  };
};

test('a worker peer speaks OCapN p2p to the host over a pipe', async t => {
  const workerId = 'a'.repeat(32);
  const duct = makeDuct();

  const worker = await makeWorkerPeer({
    workerId,
    send: duct.workerSend,
    debugLabel: 'worker-peer',
  });
  duct.bindWorker(worker.deliver);

  const hostPipe = makePipeNetwork({
    codec: syrupCodec,
    workerId,
    role: 'host',
    send: duct.hostSend,
  });
  duct.bindHost(hostPipe.deliver);

  const hostClient = await makeOcapn({
    codec: syrupCodec,
    network: hostPipe.network,
    debugLabel: 'host-of-worker',
  });
  t.teardown(() => hostClient.shutdown());
  t.teardown(() => worker.shutdown());

  const session = await hostClient.provideSession(hostPipe.peerLocation);
  const shell = await E(session.getBootstrap()).fetch(SHELL_SWISSNUM);
  const counter = await E(shell).evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  t.is(await E(counter).incr(), 2);
  t.is(await E(counter).getCount(), 2);

  // Endowments cross the pipe as capabilities and identity holds.
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
  t.is(
    await E(registry).isKept(counter),
    true,
    'a presence passed back unwraps to the original in the worker heap',
  );

  // A worker promise resolves to the host after the fact.
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
  t.is(await E(gifter).release('gifted'), 'released');
  t.is(await gift, 'gifted');
});

test('one daemon client relays a TCP peer to an OCapN worker', async t => {
  const workerId = 'b'.repeat(32);
  const duct = makeDuct();

  const worker = await makeWorkerPeer({
    workerId,
    send: duct.workerSend,
    debugLabel: 'relayed-worker',
  });
  duct.bindWorker(worker.deliver);

  const hostPipe = makePipeNetwork({
    codec: syrupCodec,
    workerId,
    role: 'host',
    send: duct.hostSend,
  });
  duct.bindHost(hostPipe.deliver);

  // The daemon: ONE OCapN client whose network routes siesta-pipe
  // locations to worker ducts and everything else to TCP.
  /** @type {Map<string, any>} */
  const daemonLocator = new Map();
  /** @type {any} */
  let daemonLocation;
  const daemonClient = await makeOcapn({
    codec: syrupCodec,
    locator: daemonLocator,
    debugLabel: 'unified-daemon',
    // Relay policy: never hand off a pipe-origin grant — worker
    // locations are unreachable by design, so the daemon re-exports
    // worker references as its own objects and proxies deliveries.
    shouldHandoff: grantDetails =>
      (grantDetails.location.network ?? grantDetails.location.transport) !==
      'siesta-pipe',
    network: async (handlers, logger) => {
      const tcp = await makeTcpNetLayer({ handlers, logger });
      daemonLocation = tcp.location;
      return makeRoutingNetwork({
        resolvePipe: designator =>
          designator === `${workerId}-worker` ? hostPipe : undefined,
        fallback: tcp,
      });
    },
  });
  t.teardown(() => daemonClient.shutdown());
  t.teardown(() => worker.shutdown());

  // Daemon side: reach the worker through the same client and publish
  // a worker export under a swissnum.
  const workerSession = await daemonClient.provideSession(
    workerPipeLocation(workerId),
  );
  const shell = await E(workerSession.getBootstrap()).fetch(SHELL_SWISSNUM);
  const counter = await E(shell).evaluate(COUNTER_SOURCE);
  daemonLocator.set('counter-cap', counter);

  // Remote side: an ordinary TCP OCapN client enlivens the sturdy ref;
  // its calls route TCP -> daemon -> pipe -> worker heap, all through
  // the daemon's single session manager.
  const remote = await makeOcapn({
    codec: syrupCodec,
    debugLabel: 'remote-peer',
    network: (handlers, logger) => makeTcpNetLayer({ handlers, logger }),
  });
  t.teardown(() => remote.shutdown());

  const remoteCounter = await remote.enlivenSturdyRef(
    remote.makeSturdyRef(daemonLocation, 'counter-cap'),
  );
  t.is(await E(remoteCounter).incr(), 1);
  t.is(await E(remoteCounter).incr(), 2);
  t.is(
    await E(remoteCounter).getCount(),
    2,
    'calls relayed TCP -> daemon -> pipe reached one worker heap',
  );
});
