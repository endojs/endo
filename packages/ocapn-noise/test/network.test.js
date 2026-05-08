// @ts-check
/* global setTimeout */

import test from '@endo/ses-ava/test.js';
import { makeQueue } from '@endo/stream';
import harden from '@endo/harden';

import { cborCodec } from '@endo/ocapn/cbor';
import { makeOcapnNoiseNetwork } from '../index.js';
import { makeMockTransportPair } from '../src/transports/mock.js';
import { makeMockMeshFabric } from './_fabric.js';

/**
 * Register a freshly-minted Ed25519 key on the network and return the
 * keyId the network reports.
 *
 * @param {ReturnType<typeof makeOcapnNoiseNetwork>} network
 */
const addFreshKey = network => {
  const signingKeys = network.generateSigningKeys();
  const keyId = network.addSigningKeys(signingKeys);
  return { keyId, ...signingKeys };
};

/**
 * Build an OcapnNoiseNetwork and register an automatic
 * `t.teardown(() => net.shutdown())` so a failed assertion mid-test
 * still releases the network's transports, listeners, and WASM
 * cipher state. `network.shutdown()` is idempotent, so explicit
 * shutdown calls in the test body remain safe.
 *
 * @param {import('ava').ExecutionContext<unknown>} t
 * @param {Parameters<typeof makeOcapnNoiseNetwork>[0]} options
 */
const makeNetworkForTest = (t, options) => {
  const net = makeOcapnNoiseNetwork(options);
  t.teardown(() => net.shutdown());
  return net;
};

/**
 * Build a mock-mesh fabric with automatic teardown.
 *
 * @param {import('ava').ExecutionContext<unknown>} t
 */
const makeFabricForTest = t => {
  const fabric = makeMockMeshFabric();
  t.teardown(() => fabric.shutdown());
  return fabric;
};

test('makeOcapnNoiseNetwork exposes the np network identity without any keys', async t => {
  const network = makeNetworkForTest(t, { codec: cborCodec });
  t.is(network.networkId, 'np');
  t.deepEqual(network.listSigningKeys(), []);
  t.deepEqual(network.listTransports(), []);
  t.deepEqual(network.locations(), []);
  network.shutdown();
});

test('addSigningKeys returns the 64-char keyId and registers a locator', async t => {
  const network = makeNetworkForTest(t, { codec: cborCodec });
  const { keyId } = addFreshKey(network);
  t.is(keyId.length, 64);
  t.deepEqual(network.listSigningKeys(), [keyId]);
  const [loc] = network.locations();
  t.is(loc.network, 'np');
  t.is(loc.designator, keyId);
  network.shutdown();
});

test('addTransport picks up transport hints in subsequent locations()', async t => {
  const network = makeNetworkForTest(t, { codec: cborCodec });
  const { keyId } = addFreshKey(network);
  t.is(network.locationFor(keyId).hints, false);

  const { transportA } = makeMockTransportPair();
  await network.addTransport(transportA);
  const loc = network.locationFor(keyId);
  t.deepEqual(loc.hints, { 'mock:to': 'default' });

  network.removeTransport(transportA);
  t.is(network.locationFor(keyId).hints, false);
  network.shutdown();
});

test('two peers handshake and exchange encrypted messages via mock transport', async t => {
  const netA = makeNetworkForTest(t, { codec: cborCodec });
  const netB = makeNetworkForTest(t, { codec: cborCodec });
  const { keyId: keyA } = addFreshKey(netA);
  const { keyId: keyB } = addFreshKey(netB);

  const { transportA, transportB } = makeMockTransportPair();
  await netA.addTransport(transportA);
  await netB.addTransport(transportB);

  const [sessionA, sessionB] = await Promise.all([
    netA.provideSession(netB.locationFor(keyB)),
    netB.waitForInboundSession(keyA),
  ]);

  t.is(sessionA.isInitiator, true);
  t.is(sessionB.isInitiator, false);
  t.is(sessionA.remoteLocation.designator, keyB);
  t.is(sessionB.remoteLocation.designator, keyA);
  t.is(sessionA.selfIdentity.keyId, keyA);
  t.is(sessionB.selfIdentity.keyId, keyB);

  // Exercise both directions.
  await sessionA.writer.next(new TextEncoder().encode('ping'));
  await sessionB.writer.next(new TextEncoder().encode('pong'));
  const recvOnB = await sessionB.reader.next(undefined);
  const recvOnA = await sessionA.reader.next(undefined);
  t.false(recvOnA.done);
  t.false(recvOnB.done);
  if (!recvOnA.done && !recvOnB.done) {
    t.is(new TextDecoder().decode(recvOnA.value), 'pong');
    t.is(new TextDecoder().decode(recvOnB.value), 'ping');
  }

  sessionA.close();
  sessionB.close();
  netA.shutdown();
  netB.shutdown();
});

test('provideSession rejects without any registered signing keys', async t => {
  const network = makeNetworkForTest(t, { codec: cborCodec });
  const { transportA } = makeMockTransportPair();
  await network.addTransport(transportA);
  await t.throwsAsync(
    async () =>
      network.provideSession({
        type: 'ocapn-peer',
        network: 'np',
        transport: 'np',
        designator: '00'.repeat(32),
        hints: { 'mock:to': 'default' },
      }),
    { message: /requires at least one signing key/ },
  );
  network.shutdown();
});

test('provideSession rejects locations with a short designator', async t => {
  const network = makeNetworkForTest(t, { codec: cborCodec });
  addFreshKey(network);
  const { transportA } = makeMockTransportPair();
  await network.addTransport(transportA);
  await t.throwsAsync(
    async () =>
      network.provideSession({
        type: 'ocapn-peer',
        network: 'np',
        transport: 'np',
        designator: 'abcd',
        hints: { 'mock:to': 'default' },
      }),
    { message: /designator must be a 32-byte Ed25519 key/ },
  );
  network.shutdown();
});

test('multiple keys on one network route inbound sessions to the right local key', async t => {
  const netA = makeNetworkForTest(t, { codec: cborCodec });
  const netB = makeNetworkForTest(t, { codec: cborCodec });
  const { keyId: keyA1 } = addFreshKey(netA);
  const { keyId: keyA2 } = addFreshKey(netA);
  const { keyId: keyB } = addFreshKey(netB);
  const { transportA, transportB } = makeMockTransportPair();
  await netA.addTransport(transportA);
  await netB.addTransport(transportB);

  // B initiates to A using keyA2 as the intended responder.
  const [sessionB, sessionA] = await Promise.all([
    netB.provideSession(netA.locationFor(keyA2)),
    netA.waitForInboundSession(keyB),
  ]);

  t.is(sessionA.selfIdentity.keyId, keyA2);
  t.is(sessionB.remoteLocation.designator, keyA2);
  t.not(keyA1, keyA2);

  sessionA.close();
  sessionB.close();
  netA.shutdown();
  netB.shutdown();
});

test('provideSession rejects when an active session under a different local key already exists', async t => {
  const netA = makeNetworkForTest(t, { codec: cborCodec });
  const netB = makeNetworkForTest(t, { codec: cborCodec });
  const { keyId: keyA1 } = addFreshKey(netA);
  const { keyId: keyA2 } = addFreshKey(netA);
  const { keyId: keyB } = addFreshKey(netB);
  const { transportA, transportB } = makeMockTransportPair();
  await netA.addTransport(transportA);
  await netB.addTransport(transportB);

  // First session: A reaches B as A1.
  const [sessionA, sessionB] = await Promise.all([
    netA.provideSession(netB.locationFor(keyB), { localKeyId: keyA1 }),
    netB.waitForInboundSession(keyA1),
  ]);
  t.is(sessionA.selfIdentity.keyId, keyA1);
  t.is(sessionB.remoteLocation.designator, keyA1);

  // Second `provideSession` to the same peer under A2 must not be
  // silently aliased to the A1 session: the caller asked to be
  // authenticated as A2 and would otherwise be unwittingly speaking
  // as A1.
  await t.throwsAsync(
    netA.provideSession(netB.locationFor(keyB), { localKeyId: keyA2 }),
    { message: /already has an active session under local keyId/ },
  );

  // Same caller, same key: still returns the live session.
  const sessionAReuse = await netA.provideSession(netB.locationFor(keyB), {
    localKeyId: keyA1,
  });
  t.is(sessionAReuse, sessionA);

  sessionA.close();
  sessionB.close();
  netA.shutdown();
  netB.shutdown();
});

/**
 * A transport whose `connect` returns a stream that never delivers any
 * bytes (a slow-loris peer) used to exercise the handshake-timeout and
 * shutdown paths.
 *
 * @returns {import('../src/types.js').OcapnNoiseTransport}
 */
const makeStallingTransport = () => {
  const queue = makeQueue();
  /** @type {any} */
  const reader = harden({
    next: () => queue.get(),
    return: async () => harden({ done: true, value: undefined }),
    throw: async () => harden({ done: true, value: undefined }),
    [Symbol.asyncIterator]() {
      return reader;
    },
  });
  /** @type {any} */
  const writer = harden({
    next: async () => harden({ done: false, value: undefined }),
    return: async () => harden({ done: true, value: undefined }),
    throw: async () => harden({ done: true, value: undefined }),
    [Symbol.asyncIterator]() {
      return writer;
    },
  });
  return harden({
    scheme: 'stall',
    connect: async () => harden({ reader, writer }),
    shutdown: () => {},
  });
};

test('active session is preserved when a second inbound handshake arrives', async t => {
  const fabric = makeFabricForTest(t);
  const netA = makeNetworkForTest(t, { codec: cborCodec });
  const netB = makeNetworkForTest(t, { codec: cborCodec });
  const keyA = addFreshKey(netA).keyId;
  const keyB = addFreshKey(netB).keyId;
  await netA.addTransport(fabric.transportFor('A'));
  await netB.addTransport(fabric.transportFor('B'));
  const locA = { ...netA.locationFor(keyA), hints: { 'mesh:to': 'A' } };
  const locB = { ...netB.locationFor(keyB), hints: { 'mesh:to': 'B' } };

  const [sessionA, sessionB] = await Promise.all([
    netA.provideSession(locB),
    netB.waitForInboundSession(keyA),
  ]);

  // A's surviving session must not be disturbed by subsequent inbound
  // handshakes. Kick off a background read on the original session;
  // then trigger another B→A handshake and confirm the original read
  // still delivers the bytes B writes afterward.
  const originalRead = sessionA.reader.next(undefined);

  const sessionBTake2 = netB
    .provideSession(locA, { localKeyId: keyB })
    .catch(() => undefined);
  await new Promise(resolve => setTimeout(resolve, 50));
  await sessionB.writer.next(new TextEncoder().encode('still-here'));
  const received = await originalRead;
  t.false(received.done, 'active session is still live');
  if (!received.done) {
    t.is(new TextDecoder().decode(received.value), 'still-here');
  }

  sessionA.close();
  sessionB.close();
  await sessionBTake2;
  netA.shutdown();
  netB.shutdown();
  fabric.shutdown();
});

test('provideSession rejects after handshake timeout', async t => {
  const net = makeNetworkForTest(t, {
    codec: cborCodec,
    handshakeTimeoutMs: 50,
  });
  addFreshKey(net);
  await net.addTransport(makeStallingTransport());

  const peerKey = '11'.repeat(32);
  await t.throwsAsync(
    async () =>
      net.provideSession({
        type: 'ocapn-peer',
        network: 'np',
        transport: 'np',
        designator: peerKey,
        hints: { 'stall:to': 'anywhere' },
      }),
    { message: /timed out/ },
  );
  net.shutdown();
});

test('provideSession with multiple keys demands an explicit localKeyId', async t => {
  const net = makeNetworkForTest(t, { codec: cborCodec });
  addFreshKey(net);
  addFreshKey(net);
  const { transportA } = makeMockTransportPair();
  await net.addTransport(transportA);
  await t.throwsAsync(
    async () =>
      net.provideSession({
        type: 'ocapn-peer',
        network: 'np',
        transport: 'np',
        designator: '00'.repeat(32),
        hints: { 'mock:to': 'default' },
      }),
    { message: /requires `localKeyId`/ },
  );
  net.shutdown();
});

test('provideSession rejects an unknown localKeyId', async t => {
  const net = makeNetworkForTest(t, { codec: cborCodec });
  addFreshKey(net);
  const { transportA } = makeMockTransportPair();
  await net.addTransport(transportA);
  await t.throwsAsync(
    async () =>
      net.provideSession(
        {
          type: 'ocapn-peer',
          network: 'np',
          transport: 'np',
          designator: '00'.repeat(32),
          hints: { 'mock:to': 'default' },
        },
        { localKeyId: 'ff'.repeat(32) },
      ),
    { message: /unknown local keyId/ },
  );
  net.shutdown();
});

test('addTransport rolls back when listen fails', async t => {
  const net = makeNetworkForTest(t, { codec: cborCodec });
  addFreshKey(net);
  const broken = harden({
    scheme: 'broken',
    connect: async () => {
      throw Error('not used');
    },
    listen: async () => {
      throw Error('synthetic listen failure');
    },
    shutdown: () => {},
  });
  await t.throwsAsync(
    async () => net.addTransport(/** @type {any} */ (broken)),
    { message: /synthetic listen failure/ },
  );
  t.deepEqual(net.listTransports(), []);
  net.shutdown();
});

test('shutdown rejects pending provideSession waiters', async t => {
  const net = makeNetworkForTest(t, { codec: cborCodec });
  addFreshKey(net);
  await net.addTransport(makeStallingTransport());
  const pending = net.provideSession({
    type: 'ocapn-peer',
    network: 'np',
    transport: 'np',
    designator: '22'.repeat(32),
    hints: { 'stall:to': 'x' },
  });
  const rejected = t.throwsAsync(pending, { message: /network shutdown/ });
  net.shutdown();
  await rejected;
});

test('generateSigningKeys produces a valid 32-byte keypair without booting WASM', t => {
  const net = makeNetworkForTest(t, { codec: cborCodec });
  const { privateKey, publicKey } = net.generateSigningKeys();
  t.is(privateKey.length, 32);
  t.is(publicKey.length, 32);
  // Round-trip through addSigningKeys to prove the public half is
  // consistent with the private half under the codec's cryptography.
  const keyId = net.addSigningKeys({ privateKey, publicKey });
  t.is(keyId.length, 64);
  net.shutdown();
});

test('SYN addressed to an unknown local key is silently dropped', async t => {
  const fabric = makeFabricForTest(t);
  const netA = makeNetworkForTest(t, { codec: cborCodec });
  const netB = makeNetworkForTest(t, { codec: cborCodec });
  const keyA = addFreshKey(netA).keyId;
  addFreshKey(netB);
  await netA.addTransport(fabric.transportFor('A'));
  await netB.addTransport(fabric.transportFor('B'));
  const locA = { ...netA.locationFor(keyA), hints: { 'mesh:to': 'A' } };

  // Remove A's key before B dials. B's SYN will be addressed to a
  // designator that A no longer recognizes; A must drop the stream
  // (not spin, not throw on A's side). B's initiate sees a closed
  // stream and its provideSession rejects; that's the observable
  // consequence.
  netA.removeSigningKeys(keyA);
  t.deepEqual(netA.listSigningKeys(), [], 'A has no keys left');

  await t.throwsAsync(async () => netB.provideSession(locA), {
    // Either stream-closed (A dropped SYN) or timeout.
    message: /stream closed before expected|timed out/,
  });

  netA.shutdown();
  netB.shutdown();
  fabric.shutdown();
});

test('removeSigningKeys forgets a previously registered identity', t => {
  const net = makeNetworkForTest(t, { codec: cborCodec });
  const { keyId } = addFreshKey(net);
  t.deepEqual(net.listSigningKeys(), [keyId]);
  net.removeSigningKeys(keyId);
  t.deepEqual(net.listSigningKeys(), []);
  net.shutdown();
});

test('addSigningKeys rejects wrong-length keys', t => {
  const net = makeNetworkForTest(t, { codec: cborCodec });
  t.throws(
    () =>
      net.addSigningKeys({
        privateKey: new Uint8Array(31),
        publicKey: new Uint8Array(31),
      }),
    { message: /must be 32 bytes/ },
  );
  net.shutdown();
});

test('addSigningKeys rejects mismatched (privateKey, publicKey) pair', t => {
  const net = makeNetworkForTest(t, { codec: cborCodec });
  const { privateKey, publicKey } = net.generateSigningKeys();
  // Replace the first byte with a different value so the tampered
  // key no longer matches the one derived from privateKey.
  const tamperedPublicKey = new Uint8Array(publicKey);
  tamperedPublicKey[0] = tamperedPublicKey[0] === 0 ? 1 : 0;
  t.throws(
    () => net.addSigningKeys({ privateKey, publicKey: tamperedPublicKey }),
    { message: /publicKey does not match privateKey/ },
  );
  // Sanity: omitting publicKey is fine; it's derived from privateKey.
  const keyId = net.addSigningKeys({
    privateKey,
    publicKey: /** @type {any} */ (undefined),
  });
  t.is(keyId.length, 64);
  net.shutdown();
});

test('addTransport rejects a second transport with the same scheme', async t => {
  const net = makeNetworkForTest(t, { codec: cborCodec });
  const fabric = makeFabricForTest(t);
  await net.addTransport(fabric.transportFor('A'));
  await t.throwsAsync(async () => net.addTransport(fabric.transportFor('B')), {
    message: /scheme.*already registered/,
  });
  net.shutdown();
  fabric.shutdown();
});

test('inboundSessions.return closes queued sessions that nobody consumed', async t => {
  const fabric = makeFabricForTest(t);
  const netA = makeNetworkForTest(t, { codec: cborCodec });
  const netB = makeNetworkForTest(t, { codec: cborCodec });
  const keyA = addFreshKey(netA).keyId;
  addFreshKey(netB);
  await netA.addTransport(fabric.transportFor('A'));
  await netB.addTransport(fabric.transportFor('B'));
  const locA = { ...netA.locationFor(keyA), hints: { 'mesh:to': 'A' } };

  // B initiates; A should buffer the session in its inboundSessions
  // queue because A hasn't started consuming.
  const sessionB = await netB.provideSession(locA);
  // Close A's iterator without ever pulling. The implementation
  // should close any buffered inbound session, which means our
  // outbound `sessionB` reader returns {done:true}.
  const it = netA.inboundSessions[Symbol.asyncIterator]();
  await it.return?.();

  const result = await sessionB.reader.next(undefined);
  t.true(result.done, 'inbound session was closed by iterator return');

  sessionB.close();
  netA.shutdown();
  netB.shutdown();
  fabric.shutdown();
});

test('active session is forgotten after close so a fresh dial starts new', async t => {
  const fabric = makeFabricForTest(t);
  const netA = makeNetworkForTest(t, { codec: cborCodec });
  const netB = makeNetworkForTest(t, { codec: cborCodec });
  addFreshKey(netA);
  const keyB = addFreshKey(netB).keyId;
  await netA.addTransport(fabric.transportFor('A'));
  await netB.addTransport(fabric.transportFor('B'));
  const locB = { ...netB.locationFor(keyB), hints: { 'mesh:to': 'B' } };

  const first = await netA.provideSession(locB);
  // A second call before close returns the same session (cache hit).
  const cached = await netA.provideSession(locB);
  t.is(cached, first, 'cache hits return the same session');

  // Close: the network should forget the entry; otherwise a third
  // call would resurrect a dead session and the read below would
  // observe {done:true} immediately.
  first.close();
  // Microtask boundary so close() finalization completes before we
  // ask for a new session.
  await Promise.resolve();
  await Promise.resolve();

  const refreshed = await netA.provideSession(locB);
  t.not(refreshed, first, 'fresh dial after close is a new session');

  refreshed.close();
  netA.shutdown();
  netB.shutdown();
  fabric.shutdown();
});

test('location signature is bound to the Noise handshake hash', async t => {
  const { makeCryptography } = await import('@endo/ocapn/cryptography');
  const { syrupCodec } = await import('@endo/ocapn/syrup');
  const crypto = makeCryptography(syrupCodec);
  const keyPair = crypto.makeOcapnKeyPair();
  /** @type {import('@endo/ocapn/components').OcapnLocation} */
  const location = harden({
    type: 'ocapn-peer',
    network: 'np',
    transport: 'np',
    designator: keyPair.publicKey.id ? '00'.repeat(32) : '00'.repeat(32),
    hints: false,
  });
  const bindingA = new Uint8Array(32);
  bindingA.fill(0xaa);
  const bindingB = new Uint8Array(32);
  bindingB.fill(0xbb);

  const sig = crypto.signLocation(location, keyPair, bindingA.buffer);

  // Same binding → verifies.
  t.notThrows(() =>
    crypto.assertLocationSignatureValid(
      location,
      sig,
      keyPair.publicKey,
      bindingA.buffer,
    ),
  );

  // Different binding → fails. Captures the deferred replay-resistance
  // property: a signature minted under one Noise handshake hash cannot
  // be replayed into a different session. Pin to the signature error
  // message so a regression that downgrades the failure to e.g. a
  // generic codec error is caught.
  t.throws(
    () =>
      crypto.assertLocationSignatureValid(
        location,
        sig,
        keyPair.publicKey,
        bindingB.buffer,
      ),
    { message: /signature/i },
  );

  // Empty binding (the tcp-testing-only convention) is also a distinct
  // domain.
  t.throws(
    () =>
      crypto.assertLocationSignatureValid(
        location,
        sig,
        keyPair.publicKey,
        new ArrayBuffer(0),
      ),
    { message: /signature/i },
  );
});
