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

import { E, Far } from '@endo/far';

import { fromHex } from '../hex.js';
import { makeNetstringCapTP } from '../connection.js';
import { adaptLibp2pStream } from './libp2p-stream-adapter.js';

const PROTOCOL = '/endo-captp/1.0.0';
const URL_PROTOCOL = 'libp2p+captp0';

const DEFAULT_VERBOSE_COMPONENTS = harden([
  // Keep this focused - these are the high-signal components for
  // internet connectivity and hole-punch diagnostics.
  'libp2p:connection-manager:dial-queue',
  'libp2p:transport-manager',
  'libp2p:kad-dht:network',
  'libp2p:kad-dht:peer-routing',
  'libp2p:autonat',
  'libp2p:dcutr',
  'libp2p:webrtc',
]);

/**
 * Parse a comma-separated list of libp2p logger component prefixes.
 *
 * @param {string | undefined} value
 * @returns {string[] | undefined}
 */
const parseVerboseComponents = value => {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const prefixes = value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  return prefixes.length > 0 ? prefixes : undefined;
};

const processEnv = /** @type {any} */ (globalThis).process?.env;
const configuredVerboseComponents =
  parseVerboseComponents(processEnv?.ENDO_LIBP2P_VERBOSE_COMPONENTS) ?? [
    ...DEFAULT_VERBOSE_COMPONENTS,
  ];

const VERBOSE_COMPONENTS = harden(configuredVerboseComponents);

const AMINO_DHT_BOOTSTRAP_NODES = harden([
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
]);

const PRIVATE_172_IPV4 = /\/ip4\/172\.(1[6-9]|2[0-9]|3[01])\./;
const MAX_LOGGED_MULTIADDRS = 6;

/**
 * @param {string} addrStr
 * @returns {{ include: boolean, reason: string }}
 */
const classifyAddressHint = addrStr => {
  if (addrStr.includes('/127.0.0.1/')) {
    return { include: false, reason: 'loopback IPv4' };
  }
  if (addrStr.includes('/0.0.0.0/')) {
    return { include: false, reason: 'unspecified IPv4' };
  }
  if (addrStr.includes('/10.')) {
    return { include: false, reason: 'private IPv4 (10/8)' };
  }
  if (addrStr.includes('/192.168.')) {
    return { include: false, reason: 'private IPv4 (192.168/16)' };
  }
  if (PRIVATE_172_IPV4.test(addrStr)) {
    return { include: false, reason: 'private IPv4 (172.16/12)' };
  }
  if (addrStr.includes('/ip6/::1/')) {
    return { include: false, reason: 'loopback IPv6' };
  }
  if (addrStr.includes('/ip6/fc') || addrStr.includes('/ip6/fd')) {
    return { include: false, reason: 'unique-local IPv6' };
  }
  if (addrStr.includes('/ip6/fe80')) {
    return { include: false, reason: 'link-local IPv6' };
  }
  return { include: true, reason: 'public or relay candidate' };
};

/**
 * @param {string[]} addrs
 * @returns {string}
 */
const summarizeAddressStrings = addrs => {
  if (addrs.length === 0) {
    return 'none';
  }
  const shown = addrs.slice(0, MAX_LOGGED_MULTIADDRS);
  const suffix =
    addrs.length > shown.length ? ` (+${addrs.length - shown.length} more)` : '';
  return `${shown.join(', ')}${suffix}`;
};

/**
 * @param {unknown} value
 * @returns {string}
 */
const toPeerString = value => {
  if (typeof value === 'string') {
    return value;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    'toString' in value &&
    typeof value.toString === 'function'
  ) {
    return value.toString();
  }
  return String(value);
};

/**
 * @param {unknown} value
 * @returns {string}
 */
const shortPeer = value => {
  const full = toPeerString(value);
  return full.length > 16 ? `${full.slice(0, 16)}...` : full;
};

/**
 * @param {unknown} error
 * @returns {string}
 */
const formatErrorChain = error => {
  if (error === undefined || error === null) {
    return 'unknown error';
  }
  /** @type {string[]} */
  const parts = [];
  /** @type {Set<object>} */
  const seen = new Set();
  /** @type {any} */
  let cursor = error;
  while (cursor !== undefined && cursor !== null) {
    if (typeof cursor === 'object') {
      if (seen.has(cursor)) {
        break;
      }
      seen.add(cursor);
    }
    if (cursor instanceof Error) {
      parts.push(`${cursor.name}: ${cursor.message}`);
      cursor = cursor.cause;
      continue;
    }
    parts.push(String(cursor));
    break;
  }
  return parts.join(' <- ');
};

/**
 * @param {unknown} path
 * @returns {string}
 */
const formatDhtPath = path => {
  if (path === null || typeof path !== 'object') {
    return 'path=unknown';
  }
  const detail = /** @type {any} */ (path);
  return `path[index=${detail.index ?? '?'} queued=${detail.queued ?? '?'} running=${detail.running ?? '?'} total=${detail.total ?? '?'}]`;
};

/**
 * @param {unknown} detail
 * @returns {string}
 */
const formatDialQueueAddresses = detail => {
  if (!Array.isArray(detail)) {
    return 'addresses=unknown';
  }
  const addrs = detail.map(entry => {
    const candidate = /** @type {any} */ (entry);
    const ma =
      candidate?.multiaddr && typeof candidate.multiaddr.toString === 'function'
        ? candidate.multiaddr.toString()
        : String(candidate?.multiaddr ?? candidate);
    return `${ma}${candidate?.isCertified ? ' (certified)' : ''}`;
  });
  return `addresses=${addrs.length} [${summarizeAddressStrings(addrs)}]`;
};

/**
 * @param {string} type
 * @param {unknown} detail
 * @returns {string}
 */
const formatDhtProgressDetail = (type, detail) => {
  const data = /** @type {any} */ (detail);
  if (type === 'kad-dht:query:add-peer') {
    return `peer=${shortPeer(data?.peer)} ${formatDhtPath(data?.path)}`;
  }
  if (type === 'kad-dht:query:dial-peer') {
    return `peer=${shortPeer(data?.peer)} ${formatDhtPath(data?.path)}`;
  }
  if (type === 'kad-dht:query:send-query') {
    return `to=${shortPeer(data?.to)} message=${data?.messageName ?? data?.messageType ?? 'unknown'} ${formatDhtPath(data?.path)}`;
  }
  if (type === 'kad-dht:query:peer-response') {
    const closer = Array.isArray(data?.closer) ? data.closer.length : 0;
    const providers = Array.isArray(data?.providers) ? data.providers.length : 0;
    const hasRecord = data?.record !== undefined;
    return `from=${shortPeer(data?.from)} closer=${closer} providers=${providers} record=${hasRecord} ${formatDhtPath(data?.path)}`;
  }
  if (type === 'kad-dht:query:final-peer') {
    const addrs = Array.isArray(data?.peer?.multiaddrs)
      ? data.peer.multiaddrs.map(ma => toPeerString(ma))
      : [];
    return `peer=${shortPeer(data?.peer?.id ?? data?.peer)} addrs=${addrs.length} [${summarizeAddressStrings(addrs)}] ${formatDhtPath(data?.path)}`;
  }
  if (type === 'kad-dht:query:query-error') {
    return `from=${shortPeer(data?.from)} error=${formatErrorChain(data?.error)} ${formatDhtPath(data?.path)}`;
  }
  if (type === 'kad-dht:query:path-ended') {
    return formatDhtPath(data?.path);
  }
  if (type === 'kad-dht:query:provider') {
    const providers = Array.isArray(data?.providers) ? data.providers : [];
    return `from=${shortPeer(data?.from)} providers=${providers.length} ${formatDhtPath(data?.path)}`;
  }
  if (type === 'kad-dht:query:value') {
    const valueSize =
      data?.value instanceof Uint8Array ? data.value.byteLength : 'unknown';
    return `from=${shortPeer(data?.from)} valueBytes=${valueSize} ${formatDhtPath(data?.path)}`;
  }
  return `detail=${String(detail)}`;
};

/**
 * @param {unknown} event
 * @returns {string}
 */
const formatProgressEvent = event => {
  const progress = /** @type {any} */ (event);
  const type = typeof progress?.type === 'string' ? progress.type : 'unknown';
  const detail = progress?.detail;
  if (type === 'transport-manager:selected-transport') {
    return `${type} transport=${String(detail)}`;
  }
  if (type === 'dial-queue:calculated-addresses') {
    return `${type} ${formatDialQueueAddresses(detail)}`;
  }
  if (type.startsWith('kad-dht:query:')) {
    return `${type} ${formatDhtProgressDetail(type, detail)}`;
  }
  return detail === undefined ? type : `${type} detail=${String(detail)}`;
};

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

  const analyzedAddrs = multiaddrs.map(ma => {
    const value = ma.toString();
    const { include, reason } = classifyAddressHint(value);
    return harden({ value, include, reason });
  });
  const publicAddrs = analyzedAddrs.filter(item => item.include);

  for (const item of publicAddrs) {
    baseUrl.searchParams.append('ma', item.value);
  }

  console.log(
    `Endo libp2p buildAddresses: ${publicAddrs.length} public multiaddr(s) of ${multiaddrs.length} total attached to address`,
  );
  if (publicAddrs.length > 0) {
    const published = publicAddrs.map(item => item.value);
    console.log(
      `Endo libp2p buildAddresses: published hints [${summarizeAddressStrings(published)}]`,
    );
  } else if (analyzedAddrs.length > 0) {
    for (const item of analyzedAddrs) {
      console.log(
        `Endo libp2p buildAddresses: excluded hint ${item.value} (${item.reason})`,
      );
    }
  }

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
  /** @type {Set<string>} */
  const tracedRemotePeers = new Set();

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
  console.log(
    `Endo libp2p: verbose component prefixes [${VERBOSE_COMPONENTS.join(', ')}]`,
  );

  const startupAddrs = libp2pNode.getMultiaddrs();
  console.log(
    `Endo libp2p: listening on ${startupAddrs.length} address(es):`,
  );
  for (const addr of startupAddrs) {
    console.log(`  ${addr.toString()}`);
  }
  const aminoDHT = /** @type {any} */ (libp2pNode.services.aminoDHT);

  const getDhtMode = () => {
    if (aminoDHT && typeof aminoDHT.getMode === 'function') {
      try {
        return aminoDHT.getMode();
      } catch {
        return 'unknown';
      }
    }
    return 'unavailable';
  };

  const getDhtRoutingTableSize = () => {
    const size = aminoDHT?.routingTable?.size;
    return typeof size === 'number' ? size : undefined;
  };

  /**
   * @param {string} label
   */
  const logDialQueueSnapshot = label => {
    const pending = libp2pNode.getDialQueue();
    console.log(`Endo libp2p: dial queue ${label}: ${pending.length} pending`);
    for (const dial of pending) {
      const dialPeer = dial.peerId ? shortPeer(dial.peerId) : 'unknown';
      const dialAddrs = dial.multiaddrs.map(ma => ma.toString());
      console.log(
        `Endo libp2p:   pending dial id=${dial.id} status=${dial.status} peer=${dialPeer} addrs=[${summarizeAddressStrings(dialAddrs)}]`,
      );
    }
  };

  /**
   * @param {string} remotePeerId
   * @param {string} label
   */
  const logPeerStoreEntry = async (remotePeerId, label) => {
    const peers = await libp2pNode.peerStore.all();
    const target = peers.find(peer => peer.id.toString() === remotePeerId);
    if (target === undefined) {
      console.log(
        `Endo libp2p: peerStore ${label}: peer ${shortPeer(remotePeerId)} not present`,
      );
      return;
    }
    const addrs = target.addresses.map(entry => entry.multiaddr.toString());
    const protocols = target.protocols || [];
    console.log(
      `Endo libp2p: peerStore ${label}: peer=${shortPeer(remotePeerId)} addrs=${addrs.length} [${summarizeAddressStrings(addrs)}] protocols=[${protocols.join(', ')}]`,
    );
  };

  console.log(
    `Endo libp2p: DHT mode=${getDhtMode()} routingTableSize=${getDhtRoutingTableSize() ?? 'n/a'}`,
  );

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

  libp2pNode.addEventListener('peer:update', evt => {
    const peerUpdate = evt.detail;
    const peerValue = peerUpdate.peer;
    const remotePeerId = peerValue.id.toString();
    if (!tracedRemotePeers.has(remotePeerId)) {
      return;
    }

    const previousAddrs = (peerUpdate.previous?.addresses || []).map(
      entry => entry.multiaddr.toString(),
    );
    const nextAddrs = (peerValue.addresses || []).map(entry =>
      entry.multiaddr.toString(),
    );
    const previousSet = new Set(previousAddrs);
    const nextSet = new Set(nextAddrs);
    const added = nextAddrs.filter(addr => !previousSet.has(addr));
    const removed = previousAddrs.filter(addr => !nextSet.has(addr));
    const protocols = peerValue.protocols || [];
    console.log(
      `Endo libp2p: traced peer:update peer=${shortPeer(remotePeerId)} addrs=${nextAddrs.length} added=[${summarizeAddressStrings(added)}] removed=[${summarizeAddressStrings(removed)}] protocols=[${protocols.join(', ')}]`,
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
    const publishableHintCount = addrs.filter(a =>
      classifyAddressHint(a.toString()).include,
    ).length;
    console.log(
      `Endo libp2p: self:peer:update — ${addrs.length} total address(es): ${relayAddrs.length} relay, ${webrtcAddrs.length} webrtc, ${otherAddrs.length} other, ${publishableHintCount} publishable hint(s), DHT mode=${getDhtMode()} routingTableSize=${getDhtRoutingTableSize() ?? 'n/a'}`,
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
    const dialQueue = libp2pNode.getDialQueue();
    const peers = await libp2pNode.peerStore.all();
    console.log(
      `Endo libp2p status: peerId=${peerId.slice(0, 16)}... multiaddrs=${addrs.length} connections=${connections.length} pendingDials=${dialQueue.length} knownPeers=${peers.length} dhtMode=${getDhtMode()} dhtRoutingTable=${getDhtRoutingTableSize() ?? 'n/a'}`,
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
    tracedRemotePeers.add(remotePeerId);
    console.log(
      `Endo libp2p connect ${connectionNumber}: peer=${remotePeerId.slice(0, 16)}..., ${maHints.length} multiaddr hint(s)`,
    );
    console.log(
      `Endo libp2p connect ${connectionNumber}: DHT mode=${getDhtMode()} routingTableSize=${getDhtRoutingTableSize() ?? 'n/a'}`,
    );
    logDialQueueSnapshot(`before connect ${connectionNumber}`);

    /**
     * @param {string} label
     */
    const maybeLogPeerStoreEntry = async label => {
      try {
        await logPeerStoreEntry(remotePeerId, label);
      } catch (err) {
        console.log(
          `Endo libp2p connect ${connectionNumber}: failed to inspect peer store for ${shortPeer(remotePeerId)}: ${formatErrorChain(err)}`,
        );
      }
    };

    await maybeLogPeerStoreEntry(`before connect ${connectionNumber}`);

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
     * @param {string} dialLabel
     * @returns {Promise<any>}
     */
    const dialWithRetry = async (ma, dialLabel) => {
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
            libp2pNode.dial(ma, {
              onProgress: progressEvent => {
                console.log(
                  `Endo libp2p connect ${connectionNumber}: dial progress (${dialLabel}) attempt ${attempt}/${MAX_DIAL_ATTEMPTS}: ${formatProgressEvent(progressEvent)}`,
                );
              },
            }),
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
          console.log(
            `Endo libp2p connect ${connectionNumber}: attempt ${attempt} failed for ${maStr}: ${formatErrorChain(err)}`,
          );
          logDialQueueSnapshot(
            `after failure attempt ${attempt} (${dialLabel}) for connect ${connectionNumber}`,
          );
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
          rawStream = await dialWithRetry(ma, `hint ${maStr}`);
          console.log(
            `Endo libp2p connect ${connectionNumber}: succeeded via hint ${maStr}`,
          );
          break;
        } catch (err) {
          lastError = err;
          console.log(
            `Endo libp2p connect ${connectionNumber}: all attempts failed for hint ${maStr}: ${formatErrorChain(err)}`,
          );
        }
      }
      if (!rawStream) {
        console.log(
          `Endo libp2p connect ${connectionNumber}: all multiaddr hints exhausted, falling back to DHT discovery for ${remotePeerId.slice(0, 16)}...`,
        );
        await maybeLogPeerStoreEntry(
          `before DHT fallback for connect ${connectionNumber}`,
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
          if (storedAddrs.length > 0) {
            console.log(
              `Endo libp2p connect ${connectionNumber}: note: peer ID dial may reuse these cached peerStore addresses before issuing a network DHT lookup`,
            );
          }
        } else {
          console.log(
            `Endo libp2p connect ${connectionNumber}: target peer NOT in local peer store — DHT lookup required`,
          );
        }
        try {
          rawStream = await dialWithRetry(
            multiaddr(`/p2p/${remotePeerId}`),
            `peer-id fallback /p2p/${remotePeerId}`,
          );
        } catch (err) {
          console.log(
            `Endo libp2p connect ${connectionNumber}: DHT fallback failed: ${formatErrorChain(err)}`,
          );
          await maybeLogPeerStoreEntry(
            `after DHT fallback failure for connect ${connectionNumber}`,
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
        if (storedAddrs.length > 0) {
          console.log(
            `Endo libp2p connect ${connectionNumber}: note: peer ID dial may reuse these cached peerStore addresses before issuing a network DHT lookup`,
          );
        }
      } else {
        console.log(
          `Endo libp2p connect ${connectionNumber}: target peer NOT in peer store — DHT lookup required`,
        );
      }
      rawStream = await dialWithRetry(
        multiaddr(`/p2p/${remotePeerId}`),
        `peer-id only /p2p/${remotePeerId}`,
      );
    }

    await maybeLogPeerStoreEntry(`after successful connect ${connectionNumber}`);
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
      tracedRemotePeers.delete(remotePeerId);
      cancelConnection();
      logDialQueueSnapshot(`after close of connect ${connectionNumber}`);
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
