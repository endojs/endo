// @ts-check

import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { autoNAT } from '@libp2p/autonat';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';
import { dcutr } from '@libp2p/dcutr';
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

const VERBOSE_COMPONENTS = harden([
  'libp2p:circuit-relay',
  'libp2p:dcutr',
  'libp2p:kad-dht',
  'libp2p:autonat',
  'libp2p:webrtc',
  'libp2p:connection-manager',
  'libp2p:dialer',
  'libp2p:transport-manager',
]);

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
 * Format: libp2p+captp0:///<peerId>?ma=<multiaddr1>&ma=<multiaddr2>...
 *
 * The peer ID is in the pathname (not hostname) to preserve
 * case — URL hostnames are lowercased, but libp2p peer IDs are
 * case-sensitive.
 *
 * Includes current relay and WebRTC multiaddrs as `ma` query params
 * so the dialing side can attempt them before falling back to DHT
 * discovery. Private/localhost addresses are excluded.
 *
 * @param {string} peerId
 * @param {Array<{ toString(): string }>} multiaddrs
 * @returns {string[]}
 */
const buildAddresses = (peerId, multiaddrs) => {
  const baseUrl = new URL(`${URL_PROTOCOL}:///`);
  baseUrl.pathname = `/${peerId}`;

  const publicAddrs = multiaddrs.filter(ma => {
    const s = ma.toString();
    return (
      !s.includes('/127.0.0.1/') &&
      !s.includes('/0.0.0.0/') &&
      !s.includes('/10.') &&
      !s.includes('/192.168.') &&
      !s.includes('/172.16.') &&
      !s.includes('/172.17.') &&
      !s.includes('/172.18.') &&
      !s.includes('/172.19.') &&
      !s.includes('/172.2') &&
      !s.includes('/172.3') &&
      !s.includes('/ip6/::1/') &&
      !s.includes('/ip6/fd') &&
      !s.includes('/ip6/fe80')
    );
  });

  for (const ma of publicAddrs) {
    baseUrl.searchParams.append('ma', ma.toString());
  }

  console.log(
    `Endo libp2p buildAddresses: ${publicAddrs.length} public multiaddr(s) of ${multiaddrs.length} total attached to address`,
  );

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

  /**
   * @param {string} name
   * @returns {boolean}
   */
  const isVerboseComponent = name => {
    for (const prefix of VERBOSE_COMPONENTS) {
      if (name === prefix || name.startsWith(`${prefix}:`)) {
        return true;
      }
    }
    return false;
  };

  /** @type {import('@libp2p/interface').ComponentLogger} */
  const libp2pLogger = {
    forComponent: name => {
      const verbose = isVerboseComponent(name);
      const noop = () => {};
      const verboseLog = verbose
        ? (/** @type {unknown[]} */ ...args) =>
            console.log(`[${name}]`, ...args)
        : noop;
      const log = /** @type {any} */ (verboseLog);
      log.error = (/** @type {unknown[]} */ ...args) =>
        console.log(`[${name}:ERROR]`, ...args);
      log.trace = verbose
        ? (/** @type {unknown[]} */ ...args) =>
            console.log(`[${name}:TRACE]`, ...args)
        : noop;
      log.enabled = verbose;
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
      aminoDHT: /** @type {any} */ (
        kadDHT({
          protocol: '/ipfs/kad/1.0.0',
          peerInfoMapper: removePrivateAddressesMapper,
        })
      ),
      autoNAT: autoNAT(),
      dcutr: dcutr(),
      ping: ping(),
    },
  });

  await libp2pNode.start();

  const peerId = libp2pNode.peerId.toString();
  console.log(`Endo libp2p network started with peer ID: ${peerId}`);

  const startupAddrs = libp2pNode.getMultiaddrs();
  console.log(
    `Endo libp2p: listening on ${startupAddrs.length} address(es):`,
  );
  for (const addr of startupAddrs) {
    console.log(`  ${addr.toString()}`);
  }

  /**
   * Extract a human-readable transport label from a multiaddr string.
   *
   * @param {string} addrStr
   * @returns {string}
   */
  const identifyTransport = addrStr => {
    if (addrStr.includes('/webrtc/')) return 'webrtc';
    if (addrStr.includes('/p2p-circuit/')) return 'circuit-relay';
    if (addrStr.includes('/ws/') || addrStr.includes('/wss/'))
      return 'websocket';
    if (addrStr.includes('/tcp/')) return 'tcp';
    if (addrStr.includes('/quic')) return 'quic';
    if (addrStr.includes('/p2p/')) return 'p2p-only';
    return 'unknown';
  };

  libp2pNode.addEventListener('connection:open', evt => {
    const conn = evt.detail;
    const addrStr = conn.remoteAddr.toString();
    const transport = identifyTransport(addrStr);
    const remotePeerFull = conn.remotePeer.toString();
    console.log(
      `Endo libp2p: connection:open remotePeer=${remotePeerFull.slice(0, 16)}... dir=${conn.direction} transport=${transport} status=${conn.status} streams=${conn.streams.length} addr=${addrStr}`,
    );
    if (conn.limits) {
      console.log(
        `Endo libp2p:   connection limits: bytes=${conn.limits.bytes ?? 'none'} seconds=${conn.limits.seconds ?? 'none'}`,
      );
    }
  });

  libp2pNode.addEventListener('connection:close', evt => {
    const conn = evt.detail;
    const addrStr = conn.remoteAddr.toString();
    const transport = identifyTransport(addrStr);
    console.log(
      `Endo libp2p: connection:close remotePeer=${conn.remotePeer.toString().slice(0, 16)}... dir=${conn.direction} transport=${transport} status=${conn.status} streams=${conn.streams.length} timeline=${JSON.stringify(conn.timeline)} addr=${addrStr}`,
    );
  });

  libp2pNode.addEventListener('peer:connect', evt => {
    const remotePeerStr = evt.detail.toString();
    console.log(`Endo libp2p: peer:connect ${remotePeerStr}`);
    const conns = libp2pNode.getConnections(evt.detail);
    for (const c of conns) {
      console.log(
        `Endo libp2p:   active connection: dir=${c.direction} transport=${identifyTransport(c.remoteAddr.toString())} addr=${c.remoteAddr.toString()}`,
      );
    }
  });

  libp2pNode.addEventListener('peer:disconnect', evt => {
    console.log(
      `Endo libp2p: peer:disconnect ${evt.detail.toString()}`,
    );
  });

  libp2pNode.addEventListener('peer:discovery', evt => {
    const peerInfo = evt.detail;
    const maStrs = peerInfo.multiaddrs.map(
      (/** @type {{ toString(): string }} */ ma) => ma.toString(),
    );
    console.log(
      `Endo libp2p: peer:discovery id=${peerInfo.id.toString().slice(0, 16)}... multiaddrs=[${maStrs.join(', ')}]`,
    );
  });

  libp2pNode.addEventListener('peer:identify', evt => {
    const result = evt.detail;
    const remotePeerStr = result.peerId.toString();
    const protocols = result.protocols || [];
    const listenAddrs = (result.listenAddrs || []).map(
      (/** @type {{ toString(): string }} */ ma) => ma.toString(),
    );
    const observedAddr = result.observedAddr
      ? result.observedAddr.toString()
      : 'none';
    console.log(
      `Endo libp2p: peer:identify peer=${remotePeerStr.slice(0, 16)}... protocols=[${protocols.join(', ')}] listenAddrs=[${listenAddrs.join(', ')}] observedAddr=${observedAddr}`,
    );
  });

  // --- Inbound connection handler ---
  await libp2pNode.handle(PROTOCOL, ({ stream: rawStream, connection }) => {
    (async () => {
      const { value: connectionNumber } = connectionNumbers.next();
      const inboundAddr = connection.remoteAddr.toString();
      const transport = identifyTransport(inboundAddr);
      console.log(
        `Endo daemon accepted libp2p connection ${connectionNumber} at ${new Date().toISOString()} from ${connection.remotePeer.toString()} via ${inboundAddr} transport=${transport}`,
      );
      if (connection.limits) {
        console.log(
          `Endo libp2p inbound ${connectionNumber}: connection has limits (relay): bytes=${connection.limits.bytes ?? 'none'} seconds=${connection.limits.seconds ?? 'none'}`,
        );
      }

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
    const relayAddrs = addrs.filter(a =>
      a.toString().includes('/p2p-circuit'),
    );
    const webrtcAddrs = addrs.filter(a => a.toString().includes('/webrtc'));
    const otherAddrs = addrs.filter(
      a =>
        !a.toString().includes('/p2p-circuit') &&
        !a.toString().includes('/webrtc'),
    );
    console.log(
      `Endo libp2p: self:peer:update — ${addrs.length} total address(es): ${relayAddrs.length} relay, ${webrtcAddrs.length} webrtc, ${otherAddrs.length} other`,
    );
    for (const a of addrs) {
      console.log(`  ${a.toString()}`);
    }
  });

  /**
   * Log a snapshot of the node's network state for debugging.
   */
  const logNetworkStatus = async () => {
    const addrs = libp2pNode.getMultiaddrs();
    const connections = libp2pNode.getConnections();
    const peers = await libp2pNode.peerStore.all();
    console.log(
      `Endo libp2p status: peerId=${peerId.slice(0, 16)}... multiaddrs=${addrs.length} connections=${connections.length} knownPeers=${peers.length}`,
    );
    for (const a of addrs) {
      console.log(
        `  addr: ${a.toString()} (transport=${identifyTransport(a.toString())})`,
      );
    }
    for (const c of connections) {
      console.log(
        `  conn: peer=${c.remotePeer.toString().slice(0, 16)}... dir=${c.direction} transport=${identifyTransport(c.remoteAddr.toString())} limited=${c.limits !== undefined}`,
      );
    }
  };

  const STATUS_INTERVAL_MS = 60000;
  const statusTimer = setInterval(() => {
    logNetworkStatus().catch(() => {});
  }, STATUS_INTERVAL_MS);
  if (typeof statusTimer.unref === 'function') {
    statusTimer.unref();
  }

  logNetworkStatus().catch(() => {});

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
      const maStr = ma.toString();
      const transport = identifyTransport(maStr);
      for (let attempt = 1; attempt <= MAX_DIAL_ATTEMPTS; attempt += 1) {
        try {
          const t0 = Date.now();
          console.log(
            `Endo libp2p connect ${connectionNumber}: dial attempt ${attempt}/${MAX_DIAL_ATTEMPTS} transport=${transport} to ${maStr}`,
          );
          // eslint-disable-next-line no-await-in-loop
          const conn = await Promise.race([
            libp2pNode.dial(ma),
            connectionCancelled,
          ]);
          const dialMs = Date.now() - t0;
          const actualAddr = conn.remoteAddr.toString();
          const actualTransport = identifyTransport(actualAddr);
          console.log(
            `Endo libp2p connect ${connectionNumber}: dial succeeded in ${dialMs}ms via ${actualTransport} actualAddr=${actualAddr} remotePeer=${conn.remotePeer.toString().slice(0, 16)}...`,
          );
          if (conn.limits) {
            console.log(
              `Endo libp2p connect ${connectionNumber}:   connection limits: bytes=${conn.limits.bytes ?? 'none'} seconds=${conn.limits.seconds ?? 'none'} (limited=${conn.limits.bytes !== undefined || conn.limits.seconds !== undefined})`,
            );
          }
          console.log(
            `Endo libp2p connect ${connectionNumber}: opening protocol stream ${PROTOCOL}`,
          );
          // eslint-disable-next-line no-await-in-loop
          const stream = await Promise.race([
            conn.newStream(PROTOCOL),
            connectionCancelled,
          ]);
          console.log(
            `Endo libp2p connect ${connectionNumber}: protocol stream opened, total=${Date.now() - t0}ms`,
          );
          return stream;
        } catch (err) {
          lastErr = err;
          const errObj = /** @type {Error} */ (err);
          console.log(
            `Endo libp2p connect ${connectionNumber}: attempt ${attempt} failed for ${maStr}: ${errObj.message}`,
          );
          if (errObj.cause) {
            console.log(
              `Endo libp2p connect ${connectionNumber}:   cause: ${/** @type {Error} */ (errObj.cause).message || errObj.cause}`,
            );
          }
          if (attempt < MAX_DIAL_ATTEMPTS) {
            console.log(
              `Endo libp2p connect ${connectionNumber}: retrying in ${RETRY_DELAY_MS}ms...`,
            );
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
      console.log(
        `Endo libp2p connect ${connectionNumber}: trying ${maHints.length} multiaddr hint(s):`,
      );
      for (const h of maHints) {
        console.log(
          `  hint: ${h} (transport=${identifyTransport(h)})`,
        );
      }
      let lastError;
      for (const maStr of maHints) {
        try {
          const ma = multiaddr(maStr);
          // eslint-disable-next-line no-await-in-loop
          rawStream = await dialWithRetry(ma);
          console.log(
            `Endo libp2p connect ${connectionNumber}: succeeded via hint ${maStr}`,
          );
          break;
        } catch (err) {
          lastError = err;
          console.log(
            `Endo libp2p connect ${connectionNumber}: all attempts failed for hint ${maStr}: ${/** @type {Error} */ (err).message}`,
          );
        }
      }
      if (!rawStream) {
        console.log(
          `Endo libp2p connect ${connectionNumber}: all multiaddr hints exhausted, falling back to DHT discovery for ${remotePeerId.slice(0, 16)}...`,
        );
        const knownPeers = await libp2pNode.peerStore.all();
        const targetPeer = knownPeers.find(
          p => p.id.toString() === remotePeerId,
        );
        if (targetPeer) {
          const storedAddrs = targetPeer.addresses.map(a =>
            a.multiaddr.toString(),
          );
          console.log(
            `Endo libp2p connect ${connectionNumber}: peer store has ${storedAddrs.length} address(es) for target:`,
          );
          for (const sa of storedAddrs) {
            console.log(`  stored: ${sa}`);
          }
        } else {
          console.log(
            `Endo libp2p connect ${connectionNumber}: target peer NOT in local peer store — DHT lookup required`,
          );
        }
        try {
          rawStream = await dialWithRetry(multiaddr(`/p2p/${remotePeerId}`));
        } catch (err) {
          const dhtErr = /** @type {Error} */ (err);
          console.log(
            `Endo libp2p connect ${connectionNumber}: DHT fallback failed: ${dhtErr.message}`,
          );
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
        `Endo libp2p connect ${connectionNumber}: no multiaddr hints, dialing ${remotePeerId} by peer ID only (requires DHT resolution)`,
      );
      const knownPeers = await libp2pNode.peerStore.all();
      const totalPeers = knownPeers.length;
      const targetPeer = knownPeers.find(
        p => p.id.toString() === remotePeerId,
      );
      console.log(
        `Endo libp2p connect ${connectionNumber}: peer store contains ${totalPeers} peer(s)`,
      );
      if (targetPeer) {
        const storedAddrs = targetPeer.addresses.map(a =>
          a.multiaddr.toString(),
        );
        console.log(
          `Endo libp2p connect ${connectionNumber}: target peer found in store with ${storedAddrs.length} address(es):`,
        );
        for (const sa of storedAddrs) {
          console.log(`  stored: ${sa}`);
        }
      } else {
        console.log(
          `Endo libp2p connect ${connectionNumber}: target peer NOT in peer store — DHT lookup required`,
        );
      }
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

    const {
      closed: capTpClosed,
      getBootstrap,
      close: closeCapTp,
    } = makeNetstringCapTP('Endo', writer, reader, cancelled, localGateway);

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
    clearInterval(statusTimer);
    console.log('Endo libp2p: shutting down...');
    try {
      await libp2pNode.stop();
    } catch (_) {
      // Best-effort shutdown.
    }
    await Promise.all(Array.from(connectionClosedPromises));
    console.log('Endo libp2p: shutdown complete');
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
