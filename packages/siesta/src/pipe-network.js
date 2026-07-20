// @ts-check
import harden from '@endo/harden';
import { sha256 } from '@noble/hashes/sha2.js';
import { Fail, q } from '@endo/errors';
import { makeCryptography, makeSessionId } from '@endo/ocapn/cryptography';
import { makeQueue } from '@endo/stream';

/**
 * An OCapN network over a trusted in-host byte duct — the host↔worker
 * edge of the protocol-unified machine (design § Protocol unification).
 *
 * There is no wire handshake at all: both ends derive BOTH identities
 * deterministically from the worker id, so each side fabricates the
 * same fully-authenticated session (same session id) independently via
 * the `provideSession` network seam. The keys carry no authority — the
 * duct itself (a pipe between the host and a worker it spawned) is the
 * trust boundary; identities exist only to satisfy OCapN's session
 * plumbing, deterministically so that sessions are restart-stable.
 *
 * The frame streams are the caller's: `send` carries outbound OCapN
 * frames onto the duct, and the returned `deliver` accepts inbound
 * ones. Framing, journaling, replay, and wake policy live with the
 * duct's owner, not here.
 *
 * @typedef {'host' | 'worker'} PipeRole
 */

const NETWORK_ID = 'siesta-pipe';

const textEncoder = new TextEncoder();

/** @param {PipeRole} role */
const otherRole = role => (role === 'host' ? 'worker' : 'host');

/**
 * @param {ReturnType<typeof makeCryptography>} cryptography
 * @param {string} workerId
 * @param {PipeRole} role
 */
const makeSideIdentity = (cryptography, workerId, role) => {
  const seed = sha256(textEncoder.encode(`${NETWORK_ID}:${role}:${workerId}`));
  const keyPair = cryptography.makeOcapnKeyPairFromPrivateKey(seed);
  const location = harden({
    type: /** @type {const} */ ('ocapn-peer'),
    network: NETWORK_ID,
    transport: NETWORK_ID,
    designator: `${workerId}-${role}`,
    hints: /** @type {const} */ (false),
  });
  return harden({ seed, keyPair, location });
};

/**
 * The deterministic session-resumption record for one end of a worker
 * pipe: everything `handlers.resumeSession` needs, derived from the
 * worker id alone. Because both identities and the session id are
 * derived, the host can (re-)establish its side of a worker session at
 * any time — fresh worker, wake from snapshot, or daemon restart —
 * with no wire handshake and nothing persisted.
 *
 * @param {object} options
 * @param {any} options.codec
 * @param {string} options.workerId
 * @param {PipeRole} [options.role] which end this resumption is for
 *   (default `'host'`)
 */
export const derivePipeResumption = ({ codec, workerId, role = 'host' }) => {
  const cryptography = makeCryptography(codec);
  const self = makeSideIdentity(cryptography, workerId, role);
  const peer = makeSideIdentity(cryptography, workerId, otherRole(role));
  return harden({
    sessionId: makeSessionId(
      self.keyPair.publicKey.id,
      peer.keyPair.publicKey.id,
    ),
    peerLocation: peer.location,
    peerLocationSignature: cryptography.signLocation(
      peer.location,
      peer.keyPair,
      new ArrayBuffer(0),
    ),
    peerPublicKeyBytes: peer.keyPair.publicKey.bytes,
    selfPrivateKeyBytes: self.seed,
  });
};
harden(derivePipeResumption);

/**
 * @param {object} options
 * @param {any} options.codec an OCapN codec (both ends must agree)
 * @param {string} options.workerId
 * @param {PipeRole} options.role which end of the duct this network is
 * @param {(bytes: Uint8Array) => void} options.send outbound frames
 * @returns {{
 *   network: any,
 *   deliver: (bytes: Uint8Array) => void,
 *   close: () => void,
 *   location: any,
 *   peerLocation: any,
 *   sessionId: any,
 * }}
 */
export const makePipeNetwork = ({ codec, workerId, role, send }) => {
  const cryptography = makeCryptography(codec);
  const self = makeSideIdentity(cryptography, workerId, role);
  const peer = makeSideIdentity(cryptography, workerId, otherRole(role));
  const selfIdentity = harden({
    keyPair: self.keyPair,
    location: self.location,
    locationSignature: cryptography.signLocation(
      self.location,
      self.keyPair,
      new ArrayBuffer(0),
    ),
  });
  // Deterministic on both ends: derived from the two derived public
  // keys, so host and worker agree without exchanging anything.
  const sessionId = makeSessionId(
    self.keyPair.publicKey.id,
    peer.keyPair.publicKey.id,
  );

  const inbound = makeQueue();
  let closed = false;

  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    inbound.put(harden({ done: true, value: undefined }));
  };

  /** @param {Uint8Array} bytes */
  const deliver = bytes => {
    if (closed) {
      return;
    }
    inbound.put(harden({ done: false, value: bytes }));
  };

  /** @type {any} */
  const reader = harden({
    next: () => inbound.get(),
    async return() {
      close();
      return harden({ done: true, value: undefined });
    },
    /** @param {unknown} err */
    async throw(err) {
      throw err;
    },
    [Symbol.asyncIterator]() {
      return reader;
    },
  });

  /** @type {any} */
  const writer = harden({
    /** @param {Uint8Array} bytes */
    async next(bytes) {
      if (!closed) {
        send(bytes);
      }
      return harden({ done: false, value: undefined });
    },
    async return() {
      return harden({ done: true, value: undefined });
    },
    /** @param {unknown} err */
    async throw(err) {
      throw err;
    },
    [Symbol.asyncIterator]() {
      return writer;
    },
  });

  /** @type {any} */
  let networkSession;

  const network = harden({
    networkId: NETWORK_ID,
    codec,
    location: self.location,
    shutdown: close,
    /** @param {any} remoteLocation */
    provideSession: async remoteLocation => {
      const remoteNetworkId =
        remoteLocation.network ?? remoteLocation.transport;
      if (remoteNetworkId !== NETWORK_ID) {
        // Not ours: let a routing network fall through to another
        // transport.
        return undefined;
      }
      remoteLocation.designator === peer.location.designator ||
        Fail`siesta-pipe: this duct reaches ${q(
          peer.location.designator,
        )}, not ${q(remoteLocation.designator)}`;
      if (networkSession === undefined) {
        networkSession = harden({
          sessionId,
          selfIdentity,
          remotePublicKeyBytes: peer.keyPair.publicKey.bytes,
          remoteLocation: peer.location,
          // We hold the (deterministic, authority-free) peer key too,
          // so we can fabricate the signature the plumbing expects.
          remoteLocationSignature: cryptography.signLocation(
            peer.location,
            peer.keyPair,
            new ArrayBuffer(0),
          ),
          isInitiator: role === 'host',
          reader,
          writer,
          close,
        });
      }
      return networkSession;
    },
  });

  return harden({
    network,
    deliver,
    close,
    location: self.location,
    peerLocation: peer.location,
    sessionId,
  });
};
harden(makePipeNetwork);

/**
 * The OCapN location of a worker's pipe end, as the host addresses it.
 *
 * @param {string} workerId
 */
export const workerPipeLocation = workerId =>
  harden({
    type: /** @type {const} */ ('ocapn-peer'),
    network: NETWORK_ID,
    transport: NETWORK_ID,
    designator: `${workerId}-worker`,
    hints: /** @type {const} */ (false),
  });
harden(workerPipeLocation);
