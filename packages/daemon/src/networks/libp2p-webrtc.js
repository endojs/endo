// @ts-check
/* global setTimeout, clearTimeout */

import { createLibp2p } from 'libp2p';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { tcp } from '@libp2p/tcp';
import { circuitRelayTransport, circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import { kadDHT, removePrivateAddressesMapper } from '@libp2p/kad-dht';
import { bootstrap } from '@libp2p/bootstrap';
import { dcutr } from '@libp2p/dcutr';
import { autoNAT } from '@libp2p/autonat';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { multiaddr } from '@multiformats/multiaddr';

import harden from '@endo/harden';
import { E, Far } from '@endo/far';
import { makePipe } from '@endo/stream';
import { mapWriter, mapReader } from '@endo/stream';
import { makeNetstringReader, makeNetstringWriter } from '@endo/netstring';
import {
  makeMessageCapTP,
  bytesToMessage,
  messageToBytes,
} from '../connection.js';

const protocol = 'libp2p+webrtc+json+captp0';

const timestamp = () => new Date().toISOString();

const log = (...args) =>
  console.log(`[libp2p-net ${timestamp()}]`, ...args);
const warn = (...args) =>
  console.warn(`[libp2p-net ${timestamp()}]`, ...args);
const error = (...args) =>
  console.error(`[libp2p-net ${timestamp()}]`, ...args);

const ENDO_PROTOCOL_ID = '/endo/captp/1.0.0';

const DEFAULT_BOOTSTRAP_PEERS = [
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
];

/**
 * Wraps a libp2p stream into the reader/writer pair expected by endo's
 * netstring/captp framing. The libp2p stream is a duplex with source
 * (AsyncIterable<Uint8ArrayList>) and sink (takes AsyncIterable<Uint8Array>).
 *
 * @param {import('libp2p').Stream} stream
 * @returns {{ reader: import('@endo/stream').Reader<Uint8Array>, writer: import('@endo/stream').Writer<Uint8Array>, closed: Promise<void> }}
 */
const wrapLibp2pStream = (stream) => {
  const [readFrom, writeTo] = makePipe();

  const sinkClosed = stream.sink(
    (async function* generate() {
      for await (const chunk of readFrom) {
        yield chunk;
      }
    })(),
  );

  const [sourceReadFrom, sourceWriteTo] = makePipe();

  const sourceConsumed = (async () => {
    try {
      for await (const data of stream.source) {
        const bytes =
          data instanceof Uint8Array ? data : new Uint8Array(data.subarray());
        await sourceWriteTo.next(bytes);
      }
    } catch (err) {
      await sourceWriteTo.throw(err);
      return;
    }
    await sourceWriteTo.return(undefined);
  })();

  const closed = Promise.all([sinkClosed, sourceConsumed]).then(() => {});

  return {
    reader: sourceReadFrom,
    writer: writeTo,
    closed,
  };
};

/**
 * @param {object} powers - EndoHost powers (getPeerInfo, greeter, gateway, request)
 * @param {object} context - Endo disposal context (whenCancelled, cancel, addDisposalHook)
 */
export const make = async (powers, context) => {
  const cancelled = /** @type {Promise<never>} */ (E(context).whenCancelled());
  const cancelServer = (err) => E(context).cancel(err);

  /** @type {Array<string>} */
  const addresses = [];

  const { node: localNodeId } = await E(powers).getPeerInfo();
  const localGreeter = E(powers).greeter();
  const localGateway = E(powers).gateway();

  log('Initializing libp2p network for endo node', localNodeId);

  const connectionNumbers = (function* generateNumbers() {
    let n = 0;
    for (;;) {
      yield n;
      n += 1;
    }
  })();

  /** @type {Set<Promise<void>>} */
  const connectionClosedPromises = new Set();

  let bootstrapPeers;
  try {
    const bootstrapConfig = await E(powers).request(
      'SELF',
      'Bootstrap peers (comma-separated multiaddrs, or "default" for public IPFS bootstrap)',
      'libp2p-bootstrap-peers',
    );
    if (bootstrapConfig && bootstrapConfig !== 'default') {
      bootstrapPeers = bootstrapConfig.split(',').map((s) => s.trim());
      log('Using custom bootstrap peers:', bootstrapPeers);
    } else {
      bootstrapPeers = DEFAULT_BOOTSTRAP_PEERS;
      log('Using default IPFS bootstrap peers');
    }
  } catch {
    bootstrapPeers = DEFAULT_BOOTSTRAP_PEERS;
    log('Defaulting to IPFS bootstrap peers (request failed or timed out)');
  }

  log('Creating libp2p node with transports: WebRTC, WebSocket, TCP, CircuitRelay');
  log('Services: identify, kad-dht, dcutr, autonat');

  const node = await createLibp2p({
    addresses: {
      listen: [
        '/ip4/0.0.0.0/tcp/0/ws',
        '/ip4/0.0.0.0/tcp/0',
        '/webrtc',
      ],
    },
    transports: [
      webSockets(),
      tcp(),
      webRTC(),
      circuitRelayTransport({ discoverRelays: 2 }),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    peerDiscovery: [
      bootstrap({ list: bootstrapPeers }),
    ],
    services: {
      identify: identify(),
      dht: kadDHT({
        clientMode: false,
        validators: {},
        selectors: {},
      }),
      dcutr: dcutr(),
      autonat: autonat(),
      relay: circuitRelayServer({
        reservations: {
          maxReservations: 128,
          defaultDurationLimit: 120000,
          defaultDataLimit: BigInt(1 << 24),
        },
      }),
    },
  });

  const localPeerId = node.peerId.toString();
  log(`libp2p node created with PeerId: ${localPeerId}`);

  // === Comprehensive event logging ===

  node.addEventListener('peer:discovery', (evt) => {
    const peer = evt.detail;
    log(
      `PEER DISCOVERED: ${peer.id.toString()}`,
      `multiaddrs: [${peer.multiaddrs.map((ma) => ma.toString()).join(', ')}]`,
    );
  });

  node.addEventListener('peer:connect', (evt) => {
    const peerId = evt.detail;
    log(`PEER CONNECTED: ${peerId.toString()}`);
    const conns = node.getConnections(peerId);
    for (const conn of conns) {
      log(
        `  Connection detail:`,
        `remoteAddr=${conn.remoteAddr.toString()}`,
        `direction=${conn.direction}`,
        `multiplexer=${conn.multiplexer || 'none'}`,
        `encryption=${conn.encryption || 'none'}`,
        `status=${conn.status}`,
        `transient=${conn.transient}`,
      );
    }
  });

  node.addEventListener('peer:disconnect', (evt) => {
    const peerId = evt.detail;
    warn(`PEER DISCONNECTED: ${peerId.toString()}`);
  });

  node.addEventListener('peer:identify', (evt) => {
    const result = evt.detail;
    log(
      `PEER IDENTIFIED: ${result.peerId.toString()}`,
      `protocols: [${(result.protocols || []).join(', ')}]`,
      `listenAddrs: [${(result.listenAddrs || []).map((a) => a.toString()).join(', ')}]`,
      `observedAddr: ${result.observedAddr ? result.observedAddr.toString() : 'none'}`,
      `agentVersion: ${result.agentVersion || 'unknown'}`,
    );
  });

  node.addEventListener('connection:open', (evt) => {
    const conn = evt.detail;
    log(
      `CONNECTION OPENED:`,
      `remote=${conn.remoteAddr.toString()}`,
      `remotePeer=${conn.remotePeer.toString()}`,
      `direction=${conn.direction}`,
      `transient=${conn.transient}`,
    );
  });

  node.addEventListener('connection:close', (evt) => {
    const conn = evt.detail;
    log(
      `CONNECTION CLOSED:`,
      `remote=${conn.remoteAddr.toString()}`,
      `remotePeer=${conn.remotePeer.toString()}`,
      `direction=${conn.direction}`,
    );
  });

  node.addEventListener('self:peer:update', (evt) => {
    const addrs = node.getMultiaddrs();
    log(
      `SELF PEER UPDATE: multiaddrs now: [${addrs.map((a) => a.toString()).join(', ')}]`,
    );
  });

  node.addEventListener('transport:listening', (evt) => {
    log(`TRANSPORT LISTENING:`, evt.detail);
  });

  node.addEventListener('transport:close', (evt) => {
    log(`TRANSPORT CLOSED:`, evt.detail);
  });

  // === DHT event logging ===

  /**
   * Publishes this endo node's connection info (endo node id + peer id mapping)
   * to the DHT so other endo nodes can find us.
   *
   * @param {string} endoNodeId
   */
  const publishToDHT = async (endoNodeId) => {
    const dhtKey = `/endo/node/${endoNodeId}`;
    const dhtValue = new TextEncoder().encode(
      JSON.stringify({
        endoNodeId,
        libp2pPeerId: localPeerId,
        multiaddrs: node.getMultiaddrs().map((ma) => ma.toString()),
        timestamp: Date.now(),
      }),
    );
    log(`DHT WRITE: key=${dhtKey} peerId=${localPeerId} addrs=[${node.getMultiaddrs().map((a) => a.toString()).join(', ')}]`);
    try {
      const dht = node.services.dht;
      for await (const event of dht.put(
        new TextEncoder().encode(dhtKey),
        dhtValue,
      )) {
        log(`DHT WRITE EVENT: type=${event.name}`, JSON.stringify(event));
      }
      log(`DHT WRITE COMPLETE: key=${dhtKey}`);
    } catch (err) {
      error(`DHT WRITE FAILED: key=${dhtKey}`, err.message, err.stack);
    }
  };

  /**
   * Looks up an endo node's libp2p connection info from the DHT.
   *
   * @param {string} endoNodeId
   * @returns {Promise<{ libp2pPeerId: string, multiaddrs: string[] } | null>}
   */
  const lookupFromDHT = async (endoNodeId) => {
    const dhtKey = `/endo/node/${endoNodeId}`;
    log(`DHT READ: looking up key=${dhtKey}`);
    try {
      const dht = node.services.dht;
      for await (const event of dht.get(new TextEncoder().encode(dhtKey))) {
        log(`DHT READ EVENT: type=${event.name}`, JSON.stringify(event));
        if (event.name === 'VALUE') {
          const decoded = JSON.parse(new TextDecoder().decode(event.value));
          log(
            `DHT READ SUCCESS: key=${dhtKey}`,
            `peerId=${decoded.libp2pPeerId}`,
            `addrs=[${(decoded.multiaddrs || []).join(', ')}]`,
            `age=${Date.now() - decoded.timestamp}ms`,
          );
          return decoded;
        }
      }
      warn(`DHT READ: no VALUE event found for key=${dhtKey}`);
      return null;
    } catch (err) {
      error(`DHT READ FAILED: key=${dhtKey}`, err.message, err.stack);
      return null;
    }
  };

  // Start the libp2p node
  await node.start();
  log('libp2p node started');

  const multiaddrs = node.getMultiaddrs();
  log(`Listening on ${multiaddrs.length} multiaddrs:`);
  for (const ma of multiaddrs) {
    log(`  ${ma.toString()}`);
  }

  // Classify addresses for debugging
  const webrtcAddrs = multiaddrs.filter((ma) =>
    ma.toString().includes('/webrtc'),
  );
  const wsAddrs = multiaddrs.filter(
    (ma) => ma.toString().includes('/ws') && !ma.toString().includes('/webrtc'),
  );
  const tcpAddrs = multiaddrs.filter(
    (ma) =>
      ma.toString().includes('/tcp') &&
      !ma.toString().includes('/ws') &&
      !ma.toString().includes('/webrtc'),
  );
  const relayAddrs = multiaddrs.filter((ma) =>
    ma.toString().includes('/p2p-circuit'),
  );
  log(
    `Address breakdown: ${tcpAddrs.length} TCP, ${wsAddrs.length} WS, ${webrtcAddrs.length} WebRTC, ${relayAddrs.length} relay`,
  );

  // Build endo-style addresses for peer discovery
  for (const ma of multiaddrs) {
    const endoAddr = `${protocol}://${localPeerId}?ma=${encodeURIComponent(ma.toString())}`;
    addresses.push(endoAddr);
  }
  log(`Publishing ${addresses.length} endo addresses`);

  // Publish our endo node ID -> libp2p peer ID mapping to the DHT
  // Retry periodically so the record stays fresh
  let dhtPublishTimer;
  const publishLoop = async () => {
    await publishToDHT(localNodeId);
    dhtPublishTimer = setTimeout(publishLoop, 60000);
  };
  // Kick off initial publish after a short delay to let DHT bootstrap
  dhtPublishTimer = setTimeout(publishLoop, 5000);

  // Handle incoming streams on the endo protocol
  const handleIncoming = async () => {
    try {
      await node.handle(ENDO_PROTOCOL_ID, async ({ stream, connection }) => {
        const { value: connectionNumber } = connectionNumbers.next();
        const remotePeerId = connection.remotePeer.toString();
        log(
          `INBOUND STREAM #${connectionNumber}: remotePeer=${remotePeerId}`,
          `remoteAddr=${connection.remoteAddr.toString()}`,
          `direction=${connection.direction}`,
          `transient=${connection.transient}`,
        );

        try {
          const {
            reader: bytesReader,
            writer: bytesWriter,
            closed: connectionClosed,
          } = wrapLibp2pStream(stream);

          const messageWriter = mapWriter(
            makeNetstringWriter(bytesWriter, { chunked: true }),
            messageToBytes,
          );
          const messageReader = mapReader(
            makeNetstringReader(bytesReader),
            bytesToMessage,
          );

          const { closed: capTpClosed } = makeMessageCapTP(
            `Endo-libp2p-in-${connectionNumber}`,
            messageWriter,
            messageReader,
            cancelled,
            localGreeter,
          );

          const closed = Promise.race([connectionClosed, capTpClosed]);
          connectionClosedPromises.add(closed);
          closed.finally(() => {
            connectionClosedPromises.delete(closed);
            log(
              `INBOUND STREAM #${connectionNumber} CLOSED: remotePeer=${remotePeerId}`,
            );
          });
        } catch (err) {
          error(
            `INBOUND STREAM #${connectionNumber} ERROR: remotePeer=${remotePeerId}`,
            err.message,
            err.stack,
          );
          cancelServer(err);
        }
      });
      log(`Registered protocol handler for ${ENDO_PROTOCOL_ID}`);
    } catch (err) {
      error('Failed to register protocol handler:', err.message);
      cancelServer(err);
    }
  };
  await handleIncoming();

  // Cleanup on cancellation
  cancelled.catch(async (err) => {
    log('Shutting down libp2p network:', err.message);
    clearTimeout(dhtPublishTimer);
    try {
      await node.stop();
      log('libp2p node stopped');
    } catch (stopErr) {
      error('Error stopping libp2p node:', stopErr.message);
    }
  });

  const stopped = cancelled
    .catch(() => {})
    .then(() => Promise.all(Array.from(connectionClosedPromises)))
    .then(() => {});
  E.sendOnly(context).addDisposalHook(() => stopped);

  /**
   * Dial a remote endo peer over libp2p.
   *
   * The address format is:
   *   libp2p+webrtc+json+captp0://<peerIdOrEndoNodeId>?ma=<multiaddr>&ma=<multiaddr>
   *
   * If only an endo node ID is provided (no multiaddrs), the DHT is consulted.
   *
   * @param {string} address
   * @param {object} connectionContext
   * @returns {Promise<object>}
   */
  const connect = async (address, connectionContext) => {
    const { value: connectionNumber } = connectionNumbers.next();

    const connectionCancelled = /** @type {Promise<never>} */ (
      E(connectionContext).whenCancelled()
    );
    const cancelConnection = () => E(connectionContext).cancel();

    const url = new URL(address);
    const remoteIdentifier = url.hostname || url.pathname.replace(/^\/\//, '');
    const explicitMultiaddrs = url.searchParams.getAll('ma');

    log(
      `DIAL #${connectionNumber} INITIATED:`,
      `address=${address}`,
      `remoteId=${remoteIdentifier}`,
      `explicitMultiaddrs=[${explicitMultiaddrs.join(', ')}]`,
    );

    let targetPeerId = remoteIdentifier;
    let targetMultiaddrs = explicitMultiaddrs;

    // If the identifier looks like an endo node ID (128 hex chars) rather than
    // a libp2p PeerId, look it up in the DHT.
    if (/^[0-9a-f]{128}$/i.test(remoteIdentifier)) {
      log(`DIAL #${connectionNumber}: identifier looks like endo node ID, consulting DHT`);
      const dhtInfo = await lookupFromDHT(remoteIdentifier);
      if (dhtInfo) {
        targetPeerId = dhtInfo.libp2pPeerId;
        if (targetMultiaddrs.length === 0) {
          targetMultiaddrs = dhtInfo.multiaddrs;
        }
        log(
          `DIAL #${connectionNumber}: DHT resolved endo node ${remoteIdentifier}`,
          `-> peerId=${targetPeerId}`,
          `-> addrs=[${targetMultiaddrs.join(', ')}]`,
        );
      } else {
        error(
          `DIAL #${connectionNumber}: DHT lookup failed for endo node ${remoteIdentifier}, no peer info found`,
        );
        throw new Error(
          `Cannot resolve endo node ${remoteIdentifier} via DHT`,
        );
      }
    }

    // Try each multiaddr, with detailed logging on each attempt
    let lastError;
    const triedAddrs = [];

    for (const maStr of targetMultiaddrs) {
      const ma = multiaddr(maStr);
      log(
        `DIAL #${connectionNumber} ATTEMPT:`,
        `multiaddr=${ma.toString()}`,
        `targetPeer=${targetPeerId}`,
      );
      triedAddrs.push(maStr);

      try {
        const startTime = Date.now();
        const stream = await node.dialProtocol(ma, ENDO_PROTOCOL_ID);
        const elapsed = Date.now() - startTime;
        log(
          `DIAL #${connectionNumber} SUCCESS:`,
          `multiaddr=${ma.toString()}`,
          `elapsed=${elapsed}ms`,
          `remotePeer=${stream.protocol}`,
        );

        const {
          reader: bytesReader,
          writer: bytesWriter,
          closed: connectionClosed,
        } = wrapLibp2pStream(stream);

        const messageWriter = mapWriter(
          makeNetstringWriter(bytesWriter, { chunked: true }),
          messageToBytes,
        );
        const messageReader = mapReader(
          makeNetstringReader(bytesReader),
          bytesToMessage,
        );

        const { closed: capTpClosed, getBootstrap } = makeMessageCapTP(
          `Endo-libp2p-out-${connectionNumber}`,
          messageWriter,
          messageReader,
          connectionCancelled,
          localGateway,
        );

        const closed = Promise.race([connectionClosed, capTpClosed]);
        connectionClosedPromises.add(closed);
        closed.finally(() => {
          connectionClosedPromises.delete(closed);
          log(
            `OUTBOUND STREAM #${connectionNumber} CLOSED: remotePeer=${targetPeerId}`,
          );
        });

        const remoteGreeter = getBootstrap();
        return E(remoteGreeter).hello(
          localNodeId,
          localGateway,
          Far('Canceller', cancelConnection),
          connectionCancelled,
        );
      } catch (dialErr) {
        warn(
          `DIAL #${connectionNumber} FAILED:`,
          `multiaddr=${ma.toString()}`,
          `error=${dialErr.message}`,
        );
        lastError = dialErr;
      }
    }

    // If explicit multiaddrs all failed, try dialing by PeerId directly
    // (libp2p may find the peer through DHT/routing).
    if (targetPeerId) {
      log(
        `DIAL #${connectionNumber}: all explicit multiaddrs failed, trying direct PeerId dial`,
        `peerId=${targetPeerId}`,
      );
      try {
        const peerMa = multiaddr(`/p2p/${targetPeerId}`);
        const startTime = Date.now();
        const stream = await node.dialProtocol(peerMa, ENDO_PROTOCOL_ID);
        const elapsed = Date.now() - startTime;
        log(
          `DIAL #${connectionNumber} SUCCESS via PeerId:`,
          `peerId=${targetPeerId}`,
          `elapsed=${elapsed}ms`,
        );

        const {
          reader: bytesReader,
          writer: bytesWriter,
          closed: connectionClosed,
        } = wrapLibp2pStream(stream);

        const messageWriter = mapWriter(
          makeNetstringWriter(bytesWriter, { chunked: true }),
          messageToBytes,
        );
        const messageReader = mapReader(
          makeNetstringReader(bytesReader),
          bytesToMessage,
        );

        const { closed: capTpClosed, getBootstrap } = makeMessageCapTP(
          `Endo-libp2p-out-${connectionNumber}`,
          messageWriter,
          messageReader,
          connectionCancelled,
          localGateway,
        );

        const closed = Promise.race([connectionClosed, capTpClosed]);
        connectionClosedPromises.add(closed);
        closed.finally(() => {
          connectionClosedPromises.delete(closed);
          log(
            `OUTBOUND STREAM #${connectionNumber} CLOSED (PeerId dial): remotePeer=${targetPeerId}`,
          );
        });

        const remoteGreeter = getBootstrap();
        return E(remoteGreeter).hello(
          localNodeId,
          localGateway,
          Far('Canceller', cancelConnection),
          connectionCancelled,
        );
      } catch (peerDialErr) {
        error(
          `DIAL #${connectionNumber} FAILED via PeerId:`,
          `peerId=${targetPeerId}`,
          `error=${peerDialErr.message}`,
          peerDialErr.stack,
        );
        lastError = peerDialErr;
      }
    }

    error(
      `DIAL #${connectionNumber} ALL ATTEMPTS EXHAUSTED:`,
      `target=${remoteIdentifier}`,
      `tried=[${triedAddrs.join(', ')}]`,
      `lastError=${lastError?.message}`,
    );
    throw lastError || new Error(`Cannot connect to peer ${remoteIdentifier}`);
  };

  /**
   * Prints a comprehensive connectivity diagnostic snapshot.
   */
  const logDiagnostics = () => {
    const peers = node.getPeers();
    const conns = node.getConnections();
    log('=== LIBP2P DIAGNOSTICS ===');
    log(`PeerId: ${localPeerId}`);
    log(`Multiaddrs: [${node.getMultiaddrs().map((a) => a.toString()).join(', ')}]`);
    log(`Known peers: ${peers.length}`);
    log(`Active connections: ${conns.length}`);
    for (const conn of conns) {
      log(
        `  Conn: peer=${conn.remotePeer.toString()}`,
        `addr=${conn.remoteAddr.toString()}`,
        `dir=${conn.direction}`,
        `transient=${conn.transient}`,
        `status=${conn.status}`,
      );
    }
    log('=== END DIAGNOSTICS ===');
  };

  // Periodic diagnostics every 30 seconds
  const diagInterval = setInterval(logDiagnostics, 30000);
  cancelled.catch(() => clearInterval(diagInterval));

  // Initial diagnostics after bootstrap
  setTimeout(logDiagnostics, 10000);

  return Far('Libp2pWebRTCService', {
    addresses: () => harden(addresses),
    supports: (address) => {
      try {
        return new URL(address).protocol === `${protocol}:`;
      } catch {
        return false;
      }
    },
    connect,
  });
};
