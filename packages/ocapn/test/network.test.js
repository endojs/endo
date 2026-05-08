// @ts-check

import harden from '@endo/harden';
import test from '@endo/ses-ava/test.js';
import { makeQueue } from '@endo/stream';
import { makeOcapn } from '../src/client/index.js';
import { syrupCodec } from '../src/syrup/index.js';
import { makeCryptography, makeSessionId } from '../src/cryptography.js';

/**
 * @import { NetworkSession, OcapnNetwork } from '../src/client/types.js'
 * @import { OcapnLocation } from '../src/codecs/components.js'
 */

const crypto = makeCryptography(syrupCodec);

/**
 * Build a pair of keypairs and the session id that both peers would compute.
 */
const makeAuthenticatedPair = () => {
  const localKeyPair = crypto.makeOcapnKeyPair();
  const remoteKeyPair = crypto.makeOcapnKeyPair();
  const sessionId = makeSessionId(
    localKeyPair.publicKey.id,
    remoteKeyPair.publicKey.id,
  );
  return { localKeyPair, remoteKeyPair, sessionId };
};

test('makeOcapn requires codec', async t => {
  await t.throwsAsync(
    async () =>
      makeOcapn(
        /** @type {any} */ ({
          network: harden({ networkId: 'x', shutdown: () => {} }),
        }),
      ),
    { message: /`codec` is required/ },
  );
});

test('makeOcapn requires network', async t => {
  await t.throwsAsync(
    async () => makeOcapn(/** @type {any} */ ({ codec: syrupCodec })),
    { message: /`network` is required/ },
  );
});

test('makeOcapn rejects codec mismatch against network.codec', async t => {
  /** @type {OcapnNetwork} */
  const network = harden({
    networkId: 'pretend',
    // A different codec object: the identity check compares by reference.
    codec: /** @type {any} */ (harden({ ...syrupCodec })),
    shutdown: () => {},
    provideSession: async _location => {
      throw Error('not called');
    },
  });
  await t.throwsAsync(async () => makeOcapn({ codec: syrupCodec, network }), {
    message: /`network.codec` does not match `codec`/,
  });
});

test('makeOcapn rejects a network that implements neither connect nor provideSession', async t => {
  /** @type {OcapnNetwork} */
  const network = harden({
    networkId: 'broken',
    shutdown: () => {},
  });

  const ocapn = await makeOcapn({ codec: syrupCodec, network });
  await t.throwsAsync(
    async () =>
      ocapn.provideSession({
        type: 'ocapn-peer',
        network: 'broken',
        transport: 'broken',
        designator: 'peer',
        hints: false,
      }),
    { message: /network must implement `connect` or `provideSession`/ },
  );
});

test('provideSession routes through OcapnNetwork.provideSession and adopts its identity', async t => {
  /** @type {OcapnLocation} */
  const localLocation = {
    type: 'ocapn-peer',
    network: 'fake-noise',
    transport: 'fake-noise',
    designator: 'local',
    hints: false,
  };

  /** @type {OcapnLocation} */
  const remoteLocation = {
    type: 'ocapn-peer',
    network: 'fake-noise',
    transport: 'fake-noise',
    designator: 'remote',
    hints: false,
  };

  const { localKeyPair, remoteKeyPair, sessionId } = makeAuthenticatedPair();
  const localSelfIdentity = {
    keyPair: localKeyPair,
    location: localLocation,
    locationSignature: crypto.signLocation(
      localLocation,
      localKeyPair,
      new ArrayBuffer(0),
    ),
  };
  const remoteLocationSignature = crypto.signLocation(
    remoteLocation,
    remoteKeyPair,
    new ArrayBuffer(0),
  );

  let provideSessionCalls = 0;
  let writesFromClient = 0;
  let closed = false;

  /** @type {OcapnNetwork} */
  const network = harden({
    networkId: 'fake-noise',
    location: localLocation,
    shutdown: () => {},
    provideSession: async location => {
      provideSessionCalls += 1;
      t.deepEqual(location, remoteLocation);
      const inbound = makeQueue();
      const writer = /** @type {any} */ (
        harden({
          async next(_value) {
            writesFromClient += 1;
            return harden({ done: false, value: undefined });
          },
          async return() {
            return harden({ done: true, value: undefined });
          },
          async throw(err) {
            throw err;
          },
          [Symbol.asyncIterator]() {
            return writer;
          },
        })
      );
      const reader = /** @type {any} */ (
        harden({
          next: () => inbound.get(),
          async return() {
            inbound.put(harden({ done: true, value: undefined }));
            return harden({ done: true, value: undefined });
          },
          async throw(err) {
            throw err;
          },
          [Symbol.asyncIterator]() {
            return reader;
          },
        })
      );
      /** @type {NetworkSession} */
      const networkSession = harden({
        sessionId,
        selfIdentity: localSelfIdentity,
        remotePublicKeyBytes: remoteKeyPair.publicKey.bytes,
        remoteLocation,
        remoteLocationSignature,
        isInitiator: true,
        reader,
        writer,
        close: () => {
          closed = true;
          inbound.put(harden({ done: true, value: undefined }));
        },
      });
      return networkSession;
    },
  });

  const ocapn = await makeOcapn({
    codec: syrupCodec,
    network,
    debugMode: true,
  });

  const session = await ocapn.provideSession(remoteLocation);
  t.is(provideSessionCalls, 1);
  t.truthy(session.getBootstrap());

  // eslint-disable-next-line no-underscore-dangle
  const debug = ocapn._debug;
  if (!debug) throw Error('ocapn._debug missing despite debugMode');
  const peerKey = debug.sessionManager.getPeerPublicKeyForSessionId(sessionId);
  if (!peerKey) throw Error('expected peer public key registered for session');
  t.is(peerKey.bytes.byteLength, 32);
  t.deepEqual(peerKey.id, remoteKeyPair.publicKey.id);

  session.abort();
  t.true(closed, 'NetworkSession.close runs when the session aborts');
  t.is(
    writesFromClient,
    0,
    'No writes flow for a session with no peer interaction',
  );
});
