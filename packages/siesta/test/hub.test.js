// @ts-check

/**
 * The OCapN hub (`@endo/ocapn/hub`): the non-reifying core of the
 * next-generation siesta daemon. The hub is not a client — it holds
 * only c-list tables and forwards every message by structural
 * transcoding (slot rewriting), with bootstrap `fetch` as its only
 * endpoint behavior. These tests drive real OCapN endpoints — worker
 * peers and an ordinary client — connected exclusively through the
 * hub, and restart the hub from its persisted tables mid-session.
 */
import test from '@endo/ses-ava/test.js';

import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { E } from '@endo/eventual-send';
import { makeOcapn } from '@endo/ocapn';
import { makeOcapnHub } from '@endo/ocapn/hub';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makePipeNetwork } from '../src/pipe-network.js';
import { makeWorkerPeer } from '../src/worker-peer.js';

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

/**
 * Attach an OCapN worker peer to a hub. Returns a rebind handle so a
 * successor hub (restarted from the same tables) can take the duct
 * over — the worker, like a snapshot-restored heap, never notices.
 *
 * @param {any} hub
 * @param {string} workerId
 * @param {string} debugLabel
 */
const attachWorker = async (hub, workerId, debugLabel) => {
  /** @type {{ sink: any, pending: Array<Uint8Array> }} */
  const outbound = { sink: undefined, pending: [] };
  const worker = await makeWorkerPeer({
    workerId,
    debugLabel,
    send: frame => {
      if (outbound.sink === undefined) {
        outbound.pending.push(frame);
      } else {
        outbound.sink.deliver(frame);
      }
    },
  });
  /** @param {any} nextHub */
  const rebind = nextHub => {
    outbound.sink = nextHub.attachSession(workerId, {
      send: (/** @type {Uint8Array} */ bytes) => worker.deliver(bytes),
    });
    for (const frame of outbound.pending.splice(0)) {
      outbound.sink.deliver(frame);
    }
  };
  rebind(hub);
  return { worker, rebind };
};

/**
 * Attach an ordinary (reifying) OCapN client to a hub — the stand-in
 * for a remote peer.
 *
 * @param {any} hub
 * @param {string} clientKey
 * @param {string} debugLabel
 */
const attachClient = async (hub, clientKey, debugLabel) => {
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
    debugLabel,
  });
  const session = await client.provideSession(pipe.peerLocation);
  /** @param {any} nextHub */
  const rebind = nextHub => {
    outbound.sink = nextHub.attachSession(clientKey, {
      send: (/** @type {Uint8Array} */ bytes) => pipe.deliver(bytes),
    });
    for (const frame of outbound.pending.splice(0)) {
      outbound.sink.deliver(frame);
    }
  };
  rebind(hub);
  return { client, session, rebind };
};

test('the hub forwards everything by slot rewriting alone', async t => {
  const hub = makeOcapnHub({ codec: syrupCodec });
  const idA = 'a'.repeat(32);
  const idB = 'b'.repeat(32);
  const { worker: workerA } = await attachWorker(hub, idA, 'owner');
  const { worker: workerB } = await attachWorker(hub, idB, 'holder');
  const { client, session } = await attachClient(hub, 'c'.repeat(32), 'peer');
  t.teardown(() => client.shutdown());
  t.teardown(() => workerA.shutdown());
  t.teardown(() => workerB.shutdown());

  // Workers' own bootstraps are just reference rows (origin, 0).
  hub.publish('worker-a', { session: idA, position: 0n });
  hub.publish('worker-b', { session: idB, position: 0n });

  const hubBootstrap = session.getBootstrap();
  const bootA = await E(hubBootstrap).fetch(bytesOf('worker-a'));
  const shellA = await E(bootA).fetch(SHELL_SWISSNUM);
  // Pipelined through a hub answer row: deliver targets the pending
  // fetch answer before it resolves.
  const shellB = await E(E(hubBootstrap).fetch(bytesOf('worker-b'))).fetch(
    SHELL_SWISSNUM,
  );

  const counter = await E(shellA).evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  t.is(await E(counter).incr(), 2);

  // Cross-worker: the client endows B with A's counter; B's calls
  // route B → hub → A with no value ever materializing in the hub.
  const puller = await E(shellB).evaluate(
    `Far('Puller', { pull: () => E(c).incr() })`,
    ['c'],
    [counter],
  );
  t.is(await E(puller).pull(), 3, 'cross-worker call relayed by rewriting');

  // Identity: a reference round-tripped through the hub and back to
  // its origin unwraps to the original object in the origin heap.
  const registry = await E(shellA).evaluate(
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
    'identity preserved through slot rewriting',
  );

  // Promises: subscription and settlement are ordinary forwarded
  // messages; the hub holds no subscription state at all.
  const gifter = await E(shellA).evaluate(
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
  t.is(await gift, 'gifted', 'settlement forwarded owner → subscriber');

  // An unknown swissnum breaks instead of hanging.
  await t.throwsAsync(() => E(hubBootstrap).fetch(bytesOf('nope')), {
    message: /secret not found/,
  });
});

test('the hub restarts from its tables mid-session', async t => {
  /** @type {any} */
  let persisted;
  const store = {
    getState: () => persisted,
    setState: (/** @type {any} */ state) => {
      // Simulate real persistence: only JSON survives.
      persisted = JSON.parse(JSON.stringify(state));
    },
  };
  const idA = 'a'.repeat(32);

  const hub1 = makeOcapnHub({ codec: syrupCodec, store });
  const attachedA = await attachWorker(hub1, idA, 'owner');
  const attachedC = await attachClient(hub1, 'c'.repeat(32), 'peer');
  t.teardown(() => attachedC.client.shutdown());
  t.teardown(() => attachedA.worker.shutdown());

  hub1.publish('worker-a', { session: idA, position: 0n });
  const bootstrap = attachedC.session.getBootstrap();
  const shellA = await E(E(bootstrap).fetch(bytesOf('worker-a'))).fetch(
    SHELL_SWISSNUM,
  );
  const counter = await E(shellA).evaluate(COUNTER_SOURCE);
  t.is(await E(counter).incr(), 1);
  t.is(await E(counter).incr(), 2);

  const gifter = await E(shellA).evaluate(
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

  // The hub dies. Its entire being was tables; the successor loads
  // them and the endpoints re-bind their ducts. (The endpoints stand
  // in for what siesta makes durable by other means: worker heaps by
  // snapshot, remote clients by being other people's processes.)
  const hub2 = makeOcapnHub({ codec: syrupCodec, store });
  attachedA.rebind(hub2);
  attachedC.rebind(hub2);

  t.is(await E(counter).incr(), 3, 'a live reference survived the restart');
  t.is(await E(counter).getCount(), 3, 'nothing lost, nothing doubled');
  t.is(await E(gifter).release('gifted'), 'released');
  t.is(await gift, 'gifted', 'a pre-restart subscription settled after it');

  // Publications survived too.
  const shellAgain = await E(E(bootstrap).fetch(bytesOf('worker-a'))).fetch(
    SHELL_SWISSNUM,
  );
  t.is(
    await E(shellAgain).evaluate('1 + 1'),
    2,
    'a fresh fetch works against the successor',
  );
});
