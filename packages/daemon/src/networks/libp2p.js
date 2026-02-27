// @ts-check

import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { identify } from '@libp2p/identify';
import { kadDHT, removePrivateAddressesMapper } from '@libp2p/kad-dht';
import { ping } from '@libp2p/ping';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import * as wsFilters from '@libp2p/websockets/filters';
import { multiaddr } from '@multiformats/multiaddr';
import { createLibp2p } from 'libp2p';
import { fromHex } from '../hex.js';

import { E, Far } from '@endo/far';

import { makeNetstringCapTP } from '../connection.js';
import { adaptLibp2pStream } from './libp2p-stream-adapter.js';

const PROTOCOL = '/endo-captp/1.0.0';
const URL_PROTOCOL = 'libp2p+captp0';

const AMINO_DHT_BOOTSTRAP_NODES = harden([
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
]);

/**
 * Derive a deterministic Ed25519 private key from the daemon's node ID hash.
 * The node ID is a hex-encoded 512-bit hash; we use the first 32 bytes as
 * the Ed25519 seed so the libp2p peer ID is stable across restarts.
 *
 * @param {string} nodeIdHex
 */
const derivePrivateKey = async nodeIdHex => {
  const seed = fromHex(nodeIdHex);
  return generateKeyPairFromSeed('Ed25519', seed);
};

/**
 * Build a URL-safe address string for this peer.
 *
 * Format: libp2p+captp0:///<peerId>
 *
 * Only the bare peer ID is advertised. The dialing side discovers
 * reachable multiaddrs via the DHT. This avoids advertising
 * localhost/private IPs and stale relay addresses that break after
 * restart. The peer ID is in the pathname (not hostname) to preserve
 * case — URL hostnames are lowercased, but libp2p peer IDs are
 * case-sensitive.
 *
 * @param {string} peerId
 * @param {Array<{ toString(): string }>} _multiaddrs
 * @returns {string[]}
 */
const buildAddresses = (peerId, _multiaddrs) => {
  const baseUrl = new URL(`${URL_PROTOCOL}:///`);
  baseUrl.pathname = `/${peerId}`;
  return [baseUrl.href];
};

/**
 * Endo daemon network module for libp2p.
 *
 * Loaded as an unconfined caplet via `endo run`. Bootstraps into the IPFS
 * Amino DHT and discovers relay peers automatically via Circuit Relay v2.
 * No open ports or self-hosted relay infrastructure required.
 *
 * WebRTC support (@libp2p/webrtc) is loaded via trusted shims — its
 * transitive dependency `reflect-metadata` modifies `Reflect` before
 * lockdown freezes it.
 *
 * @param {object} powers - Daemon powers provided to unconfined caplets
 * @param {object} context - Caplet lifecycle context
 */
export const make = async (powers, context) => {
  const cancelled = /** @type {Promise<never>} */ (E(context).whenCancelled());
  const cancelServer = error => E(context).cancel(error);

  const { node: localNodeId } = await E(powers).getPeerInfo();
  const localGreeter = E(powers).greeter();
  const localGateway = E(powers).gateway();

  const connectionNumbers = (function* generateNumbers() {
    let n = 0;
    for (;;) {
      yield n;
      n += 1;
    }
  })();

  /** @type {Set<Promise<void>>} */
  const connectionClosedPromises = new Set();

  const privateKey = await derivePrivateKey(localNodeId);

  /** @type {import('@libp2p/interface').ComponentLogger} */
  const libp2pLogger = {
    forComponent: name => {
      const noop = () => {};
      const log = /** @type {any} */ (noop);
      log.error = (...args) => console.log(`[${name}:ERROR]`, ...args);
      log.trace = noop;
      log.enabled = false;
      log.newScope = (/** @type {string} */ sub) =>
        libp2pLogger.forComponent(`${name}:${sub}`);
      return log;
    },
  };

  const libp2pNode = await createLibp2p({
    privateKey,
    logger: libp2pLogger,
    addresses: {
      listen: ['/webrtc', '/ip4/127.0.0.1/tcp/0/ws', '/p2p-circuit'],
      appendAnnounce: ['/webrtc'],
    },
    transports: [
      webSockets({ filter: wsFilters.all }),
      webRTC({
        rtcConfiguration: {
          iceServers: [
            {
              urls: [
                'stun:stun.l.google.com:19302',
                'stun:global.stun.twilio.com:3478',
              ],
            },
          ],
        },
      }),
      circuitRelayTransport(),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      denyDialMultiaddr: async () => false,
    },
    peerDiscovery: [bootstrap({ list: [...AMINO_DHT_BOOTSTRAP_NODES] })],
    services: {
      identify: identify(),
      aminoDHT: /** @type {any} */ (kadDHT({
        protocol: '/ipfs/kad/1.0.0',
        peerInfoMapper: removePrivateAddressesMapper,
      })),
      ping: ping(),
    },
  });

  await libp2pNode.start();

  const peerId = libp2pNode.peerId.toString();
  console.log(`Endo libp2p network started with peer ID: ${peerId}`);

  libp2pNode.addEventListener('connection:open', evt => {
    const conn = evt.detail;
    console.log(
      `Endo libp2p: connection:open remotePeer=${conn.remotePeer.toString().slice(0, 16)}... dir=${conn.direction} status=${conn.status} streams=${conn.streams.length} addr=${conn.remoteAddr.toString()}`,
    );
  });

  libp2pNode.addEventListener('connection:close', evt => {
    const conn = evt.detail;
    console.log(
      `Endo libp2p: connection:close remotePeer=${conn.remotePeer.toString().slice(0, 16)}... dir=${conn.direction} status=${conn.status} streams=${conn.streams.length} timeline=${JSON.stringify(conn.timeline)} addr=${conn.remoteAddr.toString()}`,
    );
  });

  libp2pNode.addEventListener('peer:connect', evt => {
    console.log(
      `Endo libp2p: peer:connect ${evt.detail.toString().slice(0, 16)}...`,
    );
  });

  libp2pNode.addEventListener('peer:disconnect', evt => {
    console.log(
      `Endo libp2p: peer:disconnect ${evt.detail.toString().slice(0, 16)}...`,
    );
  });

  // --- Inbound connection handler ---
  await libp2pNode.handle(PROTOCOL, ({ stream: rawStream, connection }) => {
    (async () => {
      const { value: connectionNumber } = connectionNumbers.next();
      console.log(
        `Endo daemon accepted libp2p connection ${connectionNumber} at ${new Date().toISOString()} from ${connection.remotePeer.toString().slice(0, 16)}... via ${connection.remoteAddr.toString()}`,
      );

      const {
        reader,
        writer,
        closed: streamClosed,
      } = adaptLibp2pStream(rawStream);

      const { closed: capTpClosed, close: closeCapTp } = makeNetstringCapTP(
        'Endo',
        writer,
        reader,
        cancelled,
        localGreeter,
      );

      streamClosed.then(
        () => closeCapTp(new Error('libp2p stream closed')),
        () => {},
      );

      const closed = Promise.race([streamClosed, capTpClosed]);
      connectionClosedPromises.add(closed);
      closed.finally(() => {
        connectionClosedPromises.delete(closed);
        console.log(
          `Endo daemon closed libp2p connection ${connectionNumber} at ${new Date().toISOString()}`,
        );
      });
    })().catch(cancelServer);
  });
  console.log(`Endo libp2p: protocol handler registered for ${PROTOCOL}`);

  // Relay discovery happens in the background via bootstrap peers.
  // addresses() reads getMultiaddrs() live so callers always get current state.
  libp2pNode.addEventListener('self:peer:update', () => {
    const addrs = libp2pNode.getMultiaddrs();
    if (addrs.length > 0) {
      console.log(
        `Endo libp2p: ${addrs.length} relay address(es) now available`,
      );
    }
  });

  // --- Outbound connect ---
  /**
   * @param {string} address
   * @param {object} connectionContext
   */
  const connect = async (address, connectionContext) => {
    const { value: connectionNumber } = connectionNumbers.next();
    console.log(
      `Endo libp2p connect ${connectionNumber}: starting for ${address.slice(0, 80)}`,
    );

    const connectionCancelled = /** @type {Promise<never>} */ (
      E(connectionContext).whenCancelled()
    );
    const cancelConnection = () => E(connectionContext).cancel();

    const url = new URL(address);
    const remotePeerId = decodeURIComponent(url.pathname.slice(1));
    const maHints = url.searchParams.getAll('ma');
    console.log(
      `Endo libp2p connect ${connectionNumber}: peer=${remotePeerId.slice(0, 16)}..., ${maHints.length} multiaddr hint(s)`,
    );

    /** @type {any} */
    let rawStream;

    const MAX_DIAL_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 2000;

    /**
     * Dial a multiaddr, retrying on transient muxer/connection errors.
     * Races each dial and retry delay against `connectionCancelled` so
     * externally-cancelled connections don't hang.
     *
     * @param {ReturnType<typeof multiaddr>} ma
     * @returns {Promise<any>}
     */
    const dialWithRetry = async ma => {
      let lastErr;
      for (let attempt = 1; attempt <= MAX_DIAL_ATTEMPTS; attempt += 1) {
        try {
          console.log(
            `Endo libp2p: dial attempt ${attempt}/${MAX_DIAL_ATTEMPTS} to ${ma.toString()}`,
          );
          // eslint-disable-next-line no-await-in-loop
          const conn = await Promise.race([
            libp2pNode.dial(ma),
            connectionCancelled,
          ]);
          console.log(
            `Endo libp2p: connection established, opening protocol stream`,
          );
          // eslint-disable-next-line no-await-in-loop
          const stream = await Promise.race([
            conn.newStream(PROTOCOL),
            connectionCancelled,
          ]);
          return stream;
        } catch (err) {
          lastErr = err;
          console.log(
            `Endo libp2p: attempt ${attempt} failed: ${/** @type {Error} */ (err).message}`,
          );
          if (attempt < MAX_DIAL_ATTEMPTS) {
            // eslint-disable-next-line no-await-in-loop
            await Promise.race([
              new Promise(resolve => {
                setTimeout(resolve, RETRY_DELAY_MS);
              }),
              connectionCancelled,
            ]);
          }
        }
      }
      throw /** @type {Error} */ (lastErr);
    };

    if (maHints.length > 0) {
      let lastError;
      for (const maStr of maHints) {
        try {
          const ma = multiaddr(maStr);
          // eslint-disable-next-line no-await-in-loop
          rawStream = await dialWithRetry(ma);
          break;
        } catch (err) {
          lastError = err;
          console.log(
            `Endo libp2p: all attempts failed for ${maStr}: ${/** @type {Error} */ (err).message}`,
          );
        }
      }
      if (!rawStream) {
        console.log(
          `Endo libp2p: all multiaddr hints failed, falling back to DHT discovery for ${remotePeerId.slice(0, 16)}...`,
        );
        try {
          rawStream = await dialWithRetry(multiaddr(`/p2p/${remotePeerId}`));
        } catch (err) {
          throw (
            lastError ||
            new Error(
              `Failed to connect to libp2p peer ${remotePeerId}: no multiaddr succeeded and DHT fallback failed`,
            )
          );
        }
      }
    } else {
      console.log(
        `Endo libp2p: dialing ${remotePeerId} by peer ID (no multiaddr hints)`,
      );
      rawStream = await dialWithRetry(multiaddr(`/p2p/${remotePeerId}`));
    }

    console.log(
      `Endo daemon connected ${connectionNumber} over libp2p at ${new Date().toISOString()}`,
    );

    const {
      reader,
      writer,
      closed: streamClosed,
    } = adaptLibp2pStream(rawStream);

    const { closed: capTpClosed, getBootstrap, close: closeCapTp } =
      makeNetstringCapTP('Endo', writer, reader, cancelled, localGateway);

    streamClosed.then(
      () => closeCapTp(new Error('libp2p stream closed')),
      () => {},
    );

    const closed = Promise.race([streamClosed, capTpClosed]);
    connectionClosedPromises.add(closed);
    closed.finally(() => {
      connectionClosedPromises.delete(closed);
      cancelConnection();
      console.log(
        `Endo daemon closed libp2p connection ${connectionNumber} at ${new Date().toISOString()}`,
      );
    });

    const remoteGreeter = getBootstrap();
    return E(remoteGreeter).hello(
      localNodeId,
      localGateway,
      Far('Canceller', cancelConnection),
      connectionCancelled,
    );
  };

  // --- Shutdown ---
  const stopped = cancelled.catch(async () => {
    try {
      await libp2pNode.stop();
    } catch (_) {
      // Best-effort shutdown.
    }
    await Promise.all(Array.from(connectionClosedPromises));
  });

  E.sendOnly(context).addDisposalHook(() => stopped);

  return Far('Libp2pNetwork', {
    addresses: () => harden(buildAddresses(peerId, libp2pNode.getMultiaddrs())),
    supports: address => {
      try {
        return new URL(address).protocol === `${URL_PROTOCOL}:`;
      } catch {
        return false;
      }
    },
    connect,
  });
};
harden(make);
