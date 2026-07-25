// @ts-check

import test from '@endo/ses-ava/test.js';
import harden from '@endo/harden';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

import { makeOcapn } from '@endo/ocapn';
import { syrupCodec } from '@endo/ocapn/syrup';

import { makeIrohNetLayer } from '../index.js';
import { buildIrohLocation } from '../src/location.js';
import { makeMockIroh } from './_mock-iroh.js';

/**
 * @typedef {Awaited<ReturnType<typeof makeIrohNetLayer>>} IrohNetLayer
 */

/**
 * Spin up one `@endo/ocapn` instance backed by an iroh netlayer wired to
 * a shared mock iroh network. Private (loopback) direct addresses are
 * published because the mock has no discovery service.
 *
 * @param {{
 *   iroh: ReturnType<typeof makeMockIroh>,
 *   name: string,
 *   locator?: Map<string, any>,
 *   netlayerOptions?: object,
 * }} options
 */
const makeIrohPeer = async ({
  iroh,
  name,
  locator = new Map(),
  netlayerOptions = {},
}) => {
  /** @type {{ netlayer?: IrohNetLayer }} */
  const netlayerRef = {};
  const client = await makeOcapn({
    codec: syrupCodec,
    network: (handlers, logger) =>
      makeIrohNetLayer({
        handlers,
        logger,
        iroh,
        publishPrivateAddresses: true,
        ...netlayerOptions,
      }).then(netlayer => {
        netlayerRef.netlayer = netlayer;
        return netlayer;
      }),
    debugLabel: name,
    locator,
    debugMode: true,
  });
  const { netlayer } = netlayerRef;
  if (!netlayer) {
    throw Error('makeIrohNetLayer did not resolve a netlayer');
  }
  return harden({ client, netlayer, location: netlayer.location });
};

const ALPN_BYTES = Array.from(new TextEncoder().encode('ocapn/netstring/0'));

/** @type {import('@endo/ocapn/client/types').Logger} */
const quietLogger = harden({ log() {}, error() {}, info() {} });

/**
 * @param {number} fill
 * @returns {number[]}
 */
const secret32 = fill => Array.from({ length: 32 }, () => fill);

/**
 * Build the mock EndpointAddr for a netlayer's own designator.
 *
 * @param {ReturnType<typeof makeMockIroh>} iroh
 * @param {string} designator
 */
const addrFor = (iroh, designator) =>
  new iroh.EndpointAddr(iroh.EndpointId.fromString(designator));

test('two iroh-backed OCapN peers exchange method calls via bootstrap fetch', async t => {
  const iroh = makeMockIroh();

  const locatorA = new Map();
  locatorA.set(
    'Greeter',
    Far('Greeter', {
      hello: (who = 'world') => `hello, ${who}`,
    }),
  );

  const peerA = await makeIrohPeer({ iroh, name: 'iroh-A', locator: locatorA });
  t.teardown(() => peerA.client.shutdown());
  const peerB = await makeIrohPeer({ iroh, name: 'iroh-B' });
  t.teardown(() => peerB.client.shutdown());

  t.is(peerA.location.network, 'iroh');
  t.truthy(peerA.location.designator);
  t.not(peerA.location.designator, peerB.location.designator);

  // B opens a session to A, fetches A's greeter via SturdyRef, and calls
  // it: a round trip of two CapTP deliveries over the mock iroh wire,
  // netstring-reassembled from deliberately tiny chunks.
  const sturdyRef = peerB.client.makeSturdyRef(peerA.location, 'Greeter');
  const greeter = await peerB.client.enlivenSturdyRef(sturdyRef);
  const reply = await E(greeter).hello('Alice');
  t.is(reply, 'hello, Alice');

  // A second fetch over the same (reused) session also works.
  const greeterAgain = await peerB.client.enlivenSturdyRef(sturdyRef);
  t.is(await E(greeterAgain).hello('Bob'), 'hello, Bob');
});

test('sessions work in both directions between the same two peers', async t => {
  const iroh = makeMockIroh();

  const locatorA = new Map();
  locatorA.set(
    'EchoA',
    Far('EchoA', {
      echo: value => `A:${value}`,
    }),
  );
  const locatorB = new Map();
  locatorB.set(
    'EchoB',
    Far('EchoB', {
      echo: value => `B:${value}`,
    }),
  );

  const peerA = await makeIrohPeer({ iroh, name: 'iroh-A', locator: locatorA });
  t.teardown(() => peerA.client.shutdown());
  const peerB = await makeIrohPeer({ iroh, name: 'iroh-B', locator: locatorB });
  t.teardown(() => peerB.client.shutdown());

  const echoB = await peerA.client.enlivenSturdyRef(
    peerA.client.makeSturdyRef(peerB.location, 'EchoB'),
  );
  const echoA = await peerB.client.enlivenSturdyRef(
    peerB.client.makeSturdyRef(peerA.location, 'EchoA'),
  );
  t.is(await E(echoB).echo('x'), 'B:x');
  t.is(await E(echoA).echo('y'), 'A:y');
});

test('crossed hellos: simultaneous dials in both directions settle', async t => {
  const iroh = makeMockIroh();

  const locatorA = new Map();
  locatorA.set(
    'EchoA',
    Far('EchoA', {
      echo: value => `A:${value}`,
    }),
  );
  const locatorB = new Map();
  locatorB.set(
    'EchoB',
    Far('EchoB', {
      echo: value => `B:${value}`,
    }),
  );

  const peerA = await makeIrohPeer({ iroh, name: 'iroh-A', locator: locatorA });
  t.teardown(() => peerA.client.shutdown());
  const peerB = await makeIrohPeer({ iroh, name: 'iroh-B', locator: locatorB });
  t.teardown(() => peerB.client.shutdown());

  const [echoB, echoA] = await Promise.all([
    peerA.client.enlivenSturdyRef(
      peerA.client.makeSturdyRef(peerB.location, 'EchoB'),
    ),
    peerB.client.enlivenSturdyRef(
      peerB.client.makeSturdyRef(peerA.location, 'EchoA'),
    ),
  ]);
  const [replyB, replyA] = await Promise.all([
    E(echoB).echo('x'),
    E(echoA).echo('y'),
  ]);
  t.is(replyB, 'B:x');
  t.is(replyA, 'A:y');
});

test('three-party handoff: A forwards a cap from B into C, and C invokes it', async t => {
  const iroh = makeMockIroh();

  const locatorB = new Map();
  locatorB.set(
    'ObjectMaker',
    Far('ObjectMaker', {
      makeObject: () =>
        Far('Object', {
          getNumber: () => 42,
        }),
    }),
  );

  const locatorC = new Map();
  locatorC.set(
    'ObjectUser',
    Far('ObjectUser', {
      // Receives a remote cap (from B, via A) and invokes it.
      useObject: async object => E(object).getNumber(),
    }),
  );

  const peerA = await makeIrohPeer({ iroh, name: 'iroh-A' });
  t.teardown(() => peerA.client.shutdown());
  const peerB = await makeIrohPeer({ iroh, name: 'iroh-B', locator: locatorB });
  t.teardown(() => peerB.client.shutdown());
  const peerC = await makeIrohPeer({ iroh, name: 'iroh-C', locator: locatorC });
  t.teardown(() => peerC.client.shutdown());

  // A fetches ObjectMaker from B and ObjectUser from C via SturdyRefs.
  // Asking ObjectUser to invoke an Object created on B triggers the
  // three-party handoff protocol between B and C.
  const objectMaker = await peerA.client.enlivenSturdyRef(
    peerA.client.makeSturdyRef(peerB.location, 'ObjectMaker'),
  );
  const objectUser = await peerA.client.enlivenSturdyRef(
    peerA.client.makeSturdyRef(peerC.location, 'ObjectUser'),
  );
  const object = await E(objectMaker).makeObject();
  const result = await E(objectUser).useObject(object);
  t.is(result, 42);
});

test('dialing an unknown designator rejects', async t => {
  const iroh = makeMockIroh();

  const peerA = await makeIrohPeer({ iroh, name: 'iroh-A' });
  t.teardown(() => peerA.client.shutdown());

  const ghostLocation = buildIrohLocation({ nodeId: 'ff'.repeat(32) });
  await t.throwsAsync(() => peerA.client.provideSession(ghostLocation), {
    message: /no addressing information/,
  });
});

test('dialing a location on another network rejects', async t => {
  const iroh = makeMockIroh();

  const peerA = await makeIrohPeer({ iroh, name: 'iroh-A' });
  t.teardown(() => peerA.client.shutdown());

  await t.throwsAsync(
    () =>
      peerA.client.provideSession(
        /** @type {any} */ ({
          type: 'ocapn-peer',
          network: 'tcp-testing-only',
          transport: 'tcp-testing-only',
          designator: '0000',
          hints: { host: '127.0.0.1', port: '1' },
        }),
      ),
    { message: /unsupported network/ },
  );
});

test('shutdown closes the endpoint so peers can no longer dial it', async t => {
  const iroh = makeMockIroh();

  const locatorA = new Map();
  locatorA.set(
    'Greeter',
    Far('Greeter', {
      hello: () => 'hi',
    }),
  );

  const peerA = await makeIrohPeer({ iroh, name: 'iroh-A', locator: locatorA });
  // Safety net if an assertion throws before the explicit shutdown below;
  // client.shutdown() is idempotent.
  t.teardown(() => peerA.client.shutdown());
  const peerB = await makeIrohPeer({ iroh, name: 'iroh-B' });
  t.teardown(() => peerB.client.shutdown());

  const greeter = await peerB.client.enlivenSturdyRef(
    peerB.client.makeSturdyRef(peerA.location, 'Greeter'),
  );
  t.is(await E(greeter).hello(), 'hi');

  peerA.client.shutdown();

  // A fresh peer cannot reach the shut-down endpoint.
  const peerD = await makeIrohPeer({ iroh, name: 'iroh-D' });
  t.teardown(() => peerD.client.shutdown());
  await t.throwsAsync(() => peerD.client.provideSession(peerA.location), {
    message: /no addressing information/,
  });
});

test('concurrent sessions to the same peer dedupe to one working session', async t => {
  t.timeout(10_000);
  const iroh = makeMockIroh();

  const locatorA = new Map();
  locatorA.set(
    'Greeter',
    Far('Greeter', {
      hello: (who = 'world') => `hello, ${who}`,
    }),
  );

  const peerA = await makeIrohPeer({ iroh, name: 'iroh-A', locator: locatorA });
  t.teardown(() => peerA.client.shutdown());
  const peerB = await makeIrohPeer({ iroh, name: 'iroh-B' });
  t.teardown(() => peerB.client.shutdown());

  // Two same-turn establishments to one location. Without in-flight
  // dedup, both dial, both send a hello over the one reused connection,
  // and the peer aborts the session on the second unexpected hello. Both
  // must resolve to a usable session.
  const ref = peerB.client.makeSturdyRef(peerA.location, 'Greeter');
  const [g1, g2] = await Promise.all([
    peerB.client.enlivenSturdyRef(ref),
    peerB.client.enlivenSturdyRef(ref),
  ]);
  t.is(await E(g1).hello('one'), 'hello, one');
  t.is(await E(g2).hello('two'), 'hello, two');
});

test('an inbound session completing during our dial is adopted, not rejected', async t => {
  t.timeout(10_000);
  const iroh = makeMockIroh();

  const locatorA = new Map();
  locatorA.set(
    'EchoA',
    Far('EchoA', {
      echo: value => `A:${value}`,
    }),
  );
  const locatorB = new Map();
  locatorB.set(
    'EchoB',
    Far('EchoB', {
      echo: value => `B:${value}`,
    }),
  );

  const peerA = await makeIrohPeer({ iroh, name: 'iroh-A', locator: locatorA });
  t.teardown(() => peerA.client.shutdown());
  const peerB = await makeIrohPeer({ iroh, name: 'iroh-B', locator: locatorB });
  t.teardown(() => peerB.client.shutdown());

  // Slow B's outbound dials so A's dial to B (and the inbound handshake
  // it drives on B) completes while B's own dial to A is still in flight.
  // B's dial must then adopt the active session rather than send a second
  // hello and reject.
  iroh.setConnectDelay(peerB.location.designator, 40);

  const [echoB, echoA] = await Promise.all([
    peerA.client.enlivenSturdyRef(
      peerA.client.makeSturdyRef(peerB.location, 'EchoB'),
    ),
    peerB.client.enlivenSturdyRef(
      peerB.client.makeSturdyRef(peerA.location, 'EchoA'),
    ),
  ]);
  t.is(await E(echoB).echo('x'), 'B:x');
  t.is(await E(echoA).echo('y'), 'A:y');
});

test('rejects a peer whose designator does not match its authenticated EndpointId', async t => {
  t.timeout(10_000);
  const iroh = makeMockIroh();

  /** @type {(connection: any) => void} */
  let resolveWired = () => {};
  /** @type {Promise<any>} */
  const wiredConnection = new Promise(resolve => {
    resolveWired = resolve;
  });
  const handlers = /** @type {any} */ (
    harden({
      /**
       * @param {any} netlayer
       * @param {boolean} isOutgoing
       */
      makeConnection: (netlayer, isOutgoing) => {
        const connection = harden({
          netlayer,
          isOutgoing,
          get isDestroyed() {
            return false;
          },
          write() {},
          end() {},
        });
        resolveWired(connection);
        return connection;
      },
      handleMessageData: () => {},
      handleConnectionClose: () => {},
    })
  );

  const victim = await makeIrohNetLayer({
    handlers,
    logger: quietLogger,
    iroh,
    publishPrivateAddresses: true,
  });
  t.teardown(() => victim.shutdown());

  // A raw endpoint dials the victim and opens a stream so the victim
  // wires an inbound connection whose QUIC-authenticated identity is the
  // attacker's real EndpointId.
  const attacker = await iroh.Endpoint.bind({
    secretKey: secret32(0xa1),
    alpns: [ALPN_BYTES],
  });
  const attackerId = attacker.id().toString();
  const attackerConn = await attacker.connect(
    addrFor(iroh, victim.location.designator),
    ALPN_BYTES,
  );
  await attackerConn.openBi();
  const connection = await wiredConnection;

  // Claiming a third party's designator is rejected; claiming its own
  // authenticated identity is accepted.
  const victimNetlayer = /** @type {any} */ (victim);
  t.throws(
    () =>
      victimNetlayer.verifyPeerLocation(
        connection,
        buildIrohLocation({ nodeId: 'ff'.repeat(32) }),
      ),
    { message: /does not match QUIC-authenticated EndpointId/ },
  );
  t.notThrows(() =>
    victimNetlayer.verifyPeerLocation(
      connection,
      buildIrohLocation({ nodeId: attackerId }),
    ),
  );
});

test('a peer that never completes the handshake is reaped by the deadline', async t => {
  t.timeout(10_000);
  const iroh = makeMockIroh();

  const peerV = await makeIrohPeer({
    iroh,
    name: 'iroh-V',
    netlayerOptions: { handshakeTimeoutMs: 50 },
  });
  t.teardown(() => peerV.client.shutdown());

  const attacker = await iroh.Endpoint.bind({
    secretKey: secret32(0xb2),
    alpns: [ALPN_BYTES],
  });
  const conn = await attacker.connect(
    addrFor(iroh, peerV.location.designator),
    ALPN_BYTES,
  );
  await conn.openBi();
  // The attacker sends nothing; the handshake deadline must close the
  // connection (otherwise this await — and the test — hangs to timeout).
  await conn.closed();
  t.pass();
});

test('inbound in-progress cap refuses excess un-authenticated connections', async t => {
  t.timeout(10_000);
  const iroh = makeMockIroh();

  /** @type {(value?: unknown) => void} */
  let resolveFirstWired = () => {};
  const firstWired = new Promise(resolve => {
    resolveFirstWired = resolve;
  });
  const handlers = /** @type {any} */ (
    harden({
      /**
       * @param {any} netlayer
       * @param {boolean} isOutgoing
       */
      makeConnection: (netlayer, isOutgoing) => {
        const connection = harden({
          netlayer,
          isOutgoing,
          get isDestroyed() {
            return false;
          },
          write() {},
          end() {},
        });
        resolveFirstWired();
        return connection;
      },
      handleMessageData: () => {},
      handleConnectionClose: () => {},
    })
  );

  const victim = await makeIrohNetLayer({
    handlers,
    logger: quietLogger,
    iroh,
    publishPrivateAddresses: true,
    maxInboundInProgress: 1,
    handshakeTimeoutMs: 100_000,
  });
  t.teardown(() => victim.shutdown());

  const a1 = await iroh.Endpoint.bind({
    secretKey: secret32(0xc1),
    alpns: [ALPN_BYTES],
  });
  const c1 = await a1.connect(
    addrFor(iroh, victim.location.designator),
    ALPN_BYTES,
  );
  await c1.openBi();
  // Wait until the first connection is wired (in-progress count is 1).
  await firstWired;

  const a2 = await iroh.Endpoint.bind({
    secretKey: secret32(0xc2),
    alpns: [ALPN_BYTES],
  });
  const c2 = await a2.connect(
    addrFor(iroh, victim.location.designator),
    ALPN_BYTES,
  );
  await c2.openBi();
  // The cap is reached, so the second connection is refused and closed
  // (this await hangs to timeout if the cap does not fire).
  await c2.closed();
  t.pass();
});
