// @ts-check

/**
 * Round-trip + crossed-hellos coverage on a fragmenting in-process
 * fabric.  Each `writer.next(value)` is split into 1..maxChunk-byte
 * sub-writes before delivery, with the netstring layer reassembling
 * frames: exactly the path that flows through TCP under real load.
 *
 * The fabric is seeded so any failure reproduces; the seed is asserted
 * back so the failure message tells you which seed to retry.
 */

import test from '@endo/ses-ava/test.js';

import { cborCodec } from '@endo/ocapn/cbor';
import { makeOcapnNoiseNetwork } from '../index.js';
import { makeFragmentingMockMeshFabric } from './_fabric-fragmenting.js';

/**
 * @param {ReturnType<typeof makeOcapnNoiseNetwork>} network
 */
const addFreshKey = network => {
  const signingKeys = network.generateSigningKeys();
  const keyId = network.addSigningKeys(signingKeys);
  return { keyId, ...signingKeys };
};

test('fragmenting mock fabric: handshake completes and message round-trips', async t => {
  const fabric = makeFragmentingMockMeshFabric({
    seed: 0xc0_ffee,
    maxChunk: 7,
  });
  t.teardown(() => fabric.shutdown());
  const netA = makeOcapnNoiseNetwork({ codec: cborCodec });
  t.teardown(() => netA.shutdown());
  const netB = makeOcapnNoiseNetwork({ codec: cborCodec });
  t.teardown(() => netB.shutdown());
  const keyA = addFreshKey(netA).keyId;
  const keyB = addFreshKey(netB).keyId;
  await netA.addTransport(fabric.transportFor('A'));
  await netB.addTransport(fabric.transportFor('B'));
  const locB = { ...netB.locationFor(keyB), hints: { 'frag:to': 'B' } };

  const [sessionA, sessionB] = await Promise.all([
    netA.provideSession(locB),
    netB.waitForInboundSession(keyA),
  ]);

  // A → B
  await sessionA.writer.next(new TextEncoder().encode('alpha'));
  const fromA = await sessionB.reader.next(undefined);
  t.false(fromA.done);
  if (!fromA.done) {
    t.is(new TextDecoder().decode(fromA.value), 'alpha', `seed=${fabric.seed}`);
  }

  // B → A
  await sessionB.writer.next(new TextEncoder().encode('beta'));
  const fromB = await sessionA.reader.next(undefined);
  t.false(fromB.done);
  if (!fromB.done) {
    t.is(new TextDecoder().decode(fromB.value), 'beta', `seed=${fabric.seed}`);
  }

  sessionA.close();
  sessionB.close();
});

test('fragmenting mock fabric: crossed hellos resolve to one session per side', async t => {
  const fabric = makeFragmentingMockMeshFabric({
    seed: 0xfe_edfa,
    maxChunk: 5,
  });
  t.teardown(() => fabric.shutdown());
  const netA = makeOcapnNoiseNetwork({ codec: cborCodec });
  t.teardown(() => netA.shutdown());
  const netB = makeOcapnNoiseNetwork({ codec: cborCodec });
  t.teardown(() => netB.shutdown());
  const keyA = addFreshKey(netA).keyId;
  const keyB = addFreshKey(netB).keyId;
  await netA.addTransport(fabric.transportFor('A'));
  await netB.addTransport(fabric.transportFor('B'));
  const locA = { ...netA.locationFor(keyA), hints: { 'frag:to': 'A' } };
  const locB = { ...netB.locationFor(keyB), hints: { 'frag:to': 'B' } };

  // Simultaneous bidirectional dials race against each other; the
  // crossed-hellos dedup logic in network.js should pick exactly one
  // surviving session per side (not zero, not two).
  const [aSession, bSession] = await Promise.all([
    netA.provideSession(locB),
    netB.provideSession(locA),
  ]);

  // Both sides must agree on which underlying handshake won by
  // observing identical session-ids; that's the canonical
  // "exactly-one session" property.
  t.deepEqual(
    new Uint8Array(aSession.sessionId),
    new Uint8Array(bSession.sessionId),
    `seed=${fabric.seed}`,
  );

  // And they must be on opposite ends of one handshake.
  t.is(aSession.isInitiator, !bSession.isInitiator, `seed=${fabric.seed}`);

  aSession.close();
  bSession.close();
});
