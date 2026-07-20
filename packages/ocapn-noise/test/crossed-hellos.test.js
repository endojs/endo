// @ts-check

import test from '@endo/ses-ava/test.js';

import harden from '@endo/harden';
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

/**
 * One round of the late-crossed-hello interleaving: A settles on its
 * own dial before B's SYN ever reaches it, while B graduates both
 * handshakes and runs the tiebreaker. Without the responder-side
 * refusal in `handleIncoming`, B may adopt the very session A is
 * about to drop — each side then closes the session the other
 * adopted, and both live sessions die mid-use. The gate below forces
 * that ordering: B's outbound connect is held until A has fully
 * settled.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {number} i - iteration label for assertion messages.
 */
const runLateCrossedHello = async (t, i) => {
  await null;
  const fabric = makeMockMeshFabric();
  const netA = makeOcapnNoiseNetwork({ codec: cborCodec });
  const netB = makeOcapnNoiseNetwork({ codec: cborCodec });
  try {
    const keyA = addFreshKey(netA);
    const keyB = addFreshKey(netB);

    await netA.addTransport(fabric.transportFor('A'));

    /** @type {(value?: unknown) => void} */
    let releaseGate = () => {};
    const gate = new Promise(resolve => {
      releaseGate = resolve;
    });
    const baseB = fabric.transportFor('B');
    /** @type {import('../src/types.js').OcapnNoiseTransport} */
    const gatedB = harden({
      ...baseB,
      connect: async hints => {
        await gate;
        return baseB.connect(hints);
      },
    });
    await netB.addTransport(gatedB);

    const locA = {
      ...netA.locationFor(keyA),
      hints: { 'mesh:to': 'A' },
    };
    const locB = {
      ...netB.locationFor(keyB),
      hints: { 'mesh:to': 'B' },
    };

    // B dials first so its handshake registers in-progress, but its
    // SYN is parked behind the gate...
    const pB = netB.provideSession(locA);
    // ...while A dials through and settles on its own handshake,
    // never having seen B's.
    const sessionA = await netA.provideSession(locB);
    // Only now does B's SYN land at A — after A adopted a session.
    releaseGate();
    const sessionB = await pB;

    t.deepEqual(
      new Uint8Array(sessionA.sessionId),
      new Uint8Array(sessionB.sessionId),
      `iteration ${i}: A and B converge on one session`,
    );

    // Both adopted sessions must still be live: the late dial must
    // not have torn either down.
    await sessionA.writer.next(new TextEncoder().encode('ping from A'));
    await sessionB.writer.next(new TextEncoder().encode('ping from B'));
    const recvB = await sessionB.reader.next(undefined);
    const recvA = await sessionA.reader.next(undefined);
    t.false(recvA.done, `iteration ${i}: A's session survived`);
    t.false(recvB.done, `iteration ${i}: B's session survived`);

    sessionA.close();
    sessionB.close();
  } finally {
    netA.shutdown();
    netB.shutdown();
    fabric.shutdown();
  }
};

test('late crossed hello: a dial landing after the peer settled converges on the shared session', async t => {
  // The tiebreaker is a random per-handshake ephemeral, so unfixed
  // code survives a round whenever the coin lands on the inbound
  // session; iterate serially (fresh networks each round) to make a
  // regression overwhelmingly likely to trip.
  await null;
  for (let i = 0; i < 8; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await runLateCrossedHello(t, i);
  }
});
