// @ts-check

import test from '@endo/ses-ava/test.js';

import { cborCodec } from '@endo/ocapn/cbor';
import { makeOcapnNoiseNetwork } from '../index.js';
import { makeMockMeshFabric } from './_fabric.js';

/**
 * @param {ReturnType<typeof makeOcapnNoiseNetwork>} network
 */
const addFreshKey = network => {
  const signingKeys = network.generateSigningKeys();
  return network.addSigningKeys(signingKeys);
};

test('crossed hellos: both peers end on the same session with a stable session id', async t => {
  const fabric = makeMockMeshFabric();
  t.teardown(() => fabric.shutdown());
  const netA = makeOcapnNoiseNetwork({ codec: cborCodec });
  t.teardown(() => netA.shutdown());
  const netB = makeOcapnNoiseNetwork({ codec: cborCodec });
  t.teardown(() => netB.shutdown());
  const keyA = addFreshKey(netA);
  const keyB = addFreshKey(netB);

  await netA.addTransport(fabric.transportFor('A'));
  await netB.addTransport(fabric.transportFor('B'));

  // Synthesize locations that route through the mesh fabric.
  const locA = {
    ...netA.locationFor(keyA),
    hints: { 'mesh:to': 'A' },
  };
  const locB = {
    ...netB.locationFor(keyB),
    hints: { 'mesh:to': 'B' },
  };

  // Fire both provideSession calls in the same microtask so the two
  // handshakes register `inProgress` before either completes: the
  // canonical crossed-hellos race.
  const [sessionA, sessionB] = await Promise.all([
    netA.provideSession(locB),
    netB.provideSession(locA),
  ]);

  // The session id is derived from the two ed25519 identities, so it
  // must be identical on both sides regardless of which handshake won.
  t.deepEqual(
    new Uint8Array(sessionA.sessionId),
    new Uint8Array(sessionB.sessionId),
    'A and B compute matching session ids',
  );
  t.is(sessionA.remoteLocation.designator, keyB);
  t.is(sessionB.remoteLocation.designator, keyA);

  // Both peers must agree on who won: isInitiator on one side must
  // be the complement of isInitiator on the other.
  t.not(
    sessionA.isInitiator,
    sessionB.isInitiator,
    'exactly one side owns the winning session as initiator',
  );

  // Exchange messages on the surviving session to confirm it's live.
  await sessionA.writer.next(new TextEncoder().encode('hello from A'));
  await sessionB.writer.next(new TextEncoder().encode('hello from B'));
  const recvB = await sessionB.reader.next(undefined);
  const recvA = await sessionA.reader.next(undefined);
  t.false(recvA.done);
  t.false(recvB.done);
  if (!recvA.done && !recvB.done) {
    t.is(new TextDecoder().decode(recvA.value), 'hello from B');
    t.is(new TextDecoder().decode(recvB.value), 'hello from A');
  }

  sessionA.close();
  sessionB.close();
});
