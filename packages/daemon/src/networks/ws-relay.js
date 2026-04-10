// @ts-check
/* global clearTimeout, setTimeout */
/// <reference types="ses" />

import { WebSocket } from 'ws';

import harden from '@endo/harden';
import { E, Far } from '@endo/far';
import { makePipe } from '@endo/stream';
import { makePromiseKit } from '@endo/promise-kit';
import { makeNetstringCapTP } from '../connection.js';
import { fromHex, toHex } from '../hex.js';
// eslint-disable-next-line import/order
import {
  MSG_CHALLENGE,
  MSG_AUTH_OK,
  MSG_AUTH_FAIL,
  MSG_INCOMING,
  MSG_OPENED,
  MSG_OPEN_FAILED,
  MSG_DATA,
  MSG_CLOSE,
  MSG_PEER_GONE,
  decodeFrame,
  decodeChallenge,
  decodeAuthFail,
  decodeIncoming,
  decodeOpened,
  decodeOpenFailed,
  decodeDataFrame,
  decodeClose,
  decodePeerGone,
  encodeHello,
  encodeResponse,
  encodeOpen,
  encodeData,
  encodeClose as encodeCloseFrame,
} from '@endo/relay-server/protocol.js';

const protocol = 'ws-relay+captp0';

const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

/**
 * Build a channel-to-stream adapter. Each multiplexed channel becomes
 * a { reader, writer, sink, closed, resolveClosed } triple suitable
 * for feeding into makeNetstringCapTP, following the same model as
 * libp2p-stream-adapter.js.
 *
 * @param {(channelId: number, data: Uint8Array) => void} sendDataFn
 * @param {(channelId: number) => void} sendCloseFn
 * @param {number} channelId
 */
const makeChannelStreams = (sendDataFn, sendCloseFn, channelId) => {
  const { promise: closed, resolve: resolveClosed } = makePromiseKit();
  const [reader, sink] = makePipe();

  /** @type {import('@endo/stream').Writer<Uint8Array>} */
  const writer = harden({
    async next(bytes) {
      sendDataFn(channelId, bytes);
      return harden({ done: false, value: undefined });
    },
    async return() {
      sendCloseFn(channelId);
      resolveClosed(undefined);
      return harden({ value: undefined, done: true });
    },
    async throw(_error) {
      sendCloseFn(channelId);
      resolveClosed(undefined);
      return harden({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  });

  return harden({ reader, writer, sink, closed, resolveClosed });
};

export const make = async (
  powers,
  context,
  { env = /** @type {Record<string, string>} */ ({}) } = {},
) => {
  const cancelled = /** @type {Promise<never>} */ (E(context).whenCancelled());

  const { node: localNodeId } = await E(powers).getPeerInfo();
  const localGreeter = E(powers).greeter();
  const localGateway = E(powers).gateway();

  const relayUrl = env.WS_RELAY_URL;
  const relayDomain = env.WS_RELAY_DOMAIN;
  if (!relayUrl) {
    throw new Error('ws-relay network requires WS_RELAY_URL in env');
  }
  if (!relayDomain) {
    throw new Error('ws-relay network requires WS_RELAY_DOMAIN in env');
  }

  const localNodeIdBytes = fromHex(localNodeId);

  /**
   * Active channels: channelId -> { sink, resolveClosed }
   * @type {Map<number, { sink: import('@endo/stream').Stream<Uint8Array, Uint8Array, undefined, undefined>, resolveClosed: (v: undefined) => void }>}
   */
  const channels = new Map();

  let nextChannelId = 1;
  /** @type {WebSocket | null} */
  let currentWs = null;
  let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;

  const connectionNumbers = (function* generateNumbers() {
    let n = 0;
    for (;;) {
      yield n;
      n += 1;
    }
  })();

  /** @type {Set<Promise<void>>} */
  const connectionClosedPromises = new Set();

  /** @type {Map<number, { resolve: (v: undefined) => void, reject: (e: Error) => void }>} */
  const pendingOpens = new Map();

  const textEncoder = new TextEncoder();

  /** @type {ReturnType<typeof setTimeout> | null} */
  let reconnectTimer = null;
  let stopped = false;

  const { promise: stoppedPromise, resolve: resolveStopped } = makePromiseKit();

  /**
   * @param {number} channelId
   * @param {Uint8Array} data
   */
  const sendData = (channelId, data) => {
    if (currentWs && currentWs.readyState === WebSocket.OPEN) {
      currentWs.send(encodeData(channelId, data));
    }
  };

  /** @param {number} channelId */
  const sendClose = channelId => {
    if (currentWs && currentWs.readyState === WebSocket.OPEN) {
      currentWs.send(encodeCloseFrame(channelId));
    }
    channels.delete(channelId);
  };

  const closeAllChannels = () => {
    for (const [, ch] of channels) {
      ch.sink.return(undefined).catch(() => {});
      ch.resolveClosed(undefined);
    }
    channels.clear();
    for (const [, pending] of pendingOpens) {
      pending.reject(new Error('Connection lost'));
    }
    pendingOpens.clear();
  };

  /** @param {Uint8Array} payload */
  const handleIncoming = payload => {
    const { channelId, fromNodeId: _fromNodeId } = decodeIncoming(payload);
    const { value: connectionNumber } = connectionNumbers.next();

    console.log(
      `Endo daemon accepted relay connection ${connectionNumber} over ${protocol} at ${new Date().toISOString()}`,
    );

    const { reader, writer, sink, closed, resolveClosed } = makeChannelStreams(
      sendData,
      sendClose,
      channelId,
    );

    channels.set(channelId, {
      sink: /** @type {any} */ (sink),
      resolveClosed,
    });

    const { closed: capTpClosed, close: closeCapTp } = makeNetstringCapTP(
      'Endo',
      writer,
      reader,
      cancelled,
      localGreeter,
    );

    closed.then(
      () => closeCapTp(new Error('Relay channel closed')),
      () => {},
    );

    const closedRace = Promise.race([closed, capTpClosed]);
    connectionClosedPromises.add(closedRace);
    closedRace.finally(() => {
      connectionClosedPromises.delete(closedRace);
      console.log(
        `Endo daemon closed relay connection ${connectionNumber} over ${protocol} at ${new Date().toISOString()}`,
      );
    });
  };

  /** @param {Uint8Array} payload */
  const handleOpened = payload => {
    const { channelId } = decodeOpened(payload);
    const pending = pendingOpens.get(channelId);
    if (pending) {
      pendingOpens.delete(channelId);
      pending.resolve(undefined);
    }
  };

  /** @param {Uint8Array} payload */
  const handleOpenFailed = payload => {
    const { channelId, reason } = decodeOpenFailed(payload);
    const pending = pendingOpens.get(channelId);
    if (pending) {
      pendingOpens.delete(channelId);
      pending.reject(new Error(`Channel open failed: ${reason}`));
    }
  };

  /** @param {Uint8Array} payload */
  const handleDataFrame = payload => {
    const { channelId, data } = decodeDataFrame(payload);
    const ch = channels.get(channelId);
    if (ch) {
      ch.sink.next(new Uint8Array(data)).catch(() => {});
    }
  };

  /** @param {Uint8Array} payload */
  const handleCloseFrame = payload => {
    const { channelId } = decodeClose(payload);
    const ch = channels.get(channelId);
    if (ch) {
      ch.sink.return(undefined).catch(() => {});
      ch.resolveClosed(undefined);
      channels.delete(channelId);
    }
  };

  /** @param {Uint8Array} payload */
  const handlePeerGone = payload => {
    const { channelId } = decodePeerGone(payload);
    const ch = channels.get(channelId);
    if (ch) {
      ch.sink.return(undefined).catch(() => {});
      ch.resolveClosed(undefined);
      channels.delete(channelId);
    }
  };

  /**
   * @param {Uint8Array} data
   */
  const dispatchFrame = data => {
    const { type, payload } = decodeFrame(data);
    switch (type) {
      case MSG_INCOMING:
        handleIncoming(payload);
        break;
      case MSG_OPENED:
        handleOpened(payload);
        break;
      case MSG_OPEN_FAILED:
        handleOpenFailed(payload);
        break;
      case MSG_DATA:
        handleDataFrame(payload);
        break;
      case MSG_CLOSE:
        handleCloseFrame(payload);
        break;
      case MSG_PEER_GONE:
        handlePeerGone(payload);
        break;
      default:
        break;
    }
  };

  const connectToRelay = () => {
    const {
      promise: authed,
      resolve: resolveAuth,
      reject: rejectAuth,
    } = makePromiseKit();

    const ws = new WebSocket(relayUrl);
    ws.binaryType = 'arraybuffer';

    ws.on('open', () => {
      ws.send(encodeHello(localNodeIdBytes));
    });

    ws.on('message', async rawData => {
      const data =
        rawData instanceof ArrayBuffer
          ? new Uint8Array(rawData)
          : new Uint8Array(
              /** @type {Buffer} */ (rawData).buffer,
              /** @type {Buffer} */ (rawData).byteOffset,
              /** @type {Buffer} */ (rawData).length,
            );
      const { type, payload } = decodeFrame(data);

      switch (type) {
        case MSG_CHALLENGE: {
          const { nonce } = decodeChallenge(payload);
          const domainBytes = textEncoder.encode(relayDomain);
          const challengeData = new Uint8Array(
            domainBytes.length + nonce.length,
          );
          challengeData.set(domainBytes, 0);
          challengeData.set(nonce, domainBytes.length);
          const signatureHex = /** @type {string} */ (
            await E(powers).sign(toHex(challengeData))
          );
          ws.send(encodeResponse(fromHex(signatureHex)));
          break;
        }
        case MSG_AUTH_OK:
          currentWs = ws;
          reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
          resolveAuth(undefined);
          console.log(`Endo daemon authenticated with relay at ${relayUrl}`);
          break;
        case MSG_AUTH_FAIL: {
          const { reason } = decodeAuthFail(payload);
          rejectAuth(new Error(`Relay auth failed: ${reason}`));
          break;
        }
        default:
          dispatchFrame(data);
          break;
      }
    });

    ws.on('close', () => {
      if (currentWs === ws) {
        currentWs = null;
      }
      closeAllChannels();
      rejectAuth(new Error('WebSocket closed before authentication completed'));
      if (!stopped) {
        scheduleReconnect();
      }
    });

    ws.on('error', err => {
      console.error(`Relay WebSocket error: ${err.message}`);
      rejectAuth(err);
    });

    return authed;
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    console.log(`Reconnecting to relay in ${reconnectDelay}ms...`);
    reconnectTimer = setTimeout(() => {
      connectToRelay().catch(() => {});
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  };

  // Graceful shutdown: stop reconnecting, close the WebSocket, drain
  // all active CapTP channels, then resolve `stoppedPromise` so the
  // daemon knows this network is fully torn down.
  const shutdown = async () => {
    stopped = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (currentWs) {
      currentWs.close();
      currentWs = null;
    }
    closeAllChannels();
    await Promise.all(Array.from(connectionClosedPromises));
    resolveStopped(undefined);
  };

  cancelled.catch(_error => {
    shutdown().catch(() => {});
  });

  E.sendOnly(context).addDisposalHook(() => stoppedPromise);

  try {
    await connectToRelay();
    console.log(`Endo daemon started local ${protocol} network device`);
  } catch (err) {
    console.warn(
      `Endo daemon initial relay connection failed (will retry): ${/** @type {Error} */ (err).message}`,
    );
    // scheduleReconnect() was already called by the close/error handler,
    // so we just continue and return the network object.
  }

  const connect = async (address, connectionContext) => {
    const { value: connectionNumber } = connectionNumbers.next();

    const url = new URL(address);
    const targetNodeId = url.hostname;
    const targetNodeIdBytes = fromHex(targetNodeId);

    const connectionCancelled = /** @type {Promise<never>} */ (
      E(connectionContext).whenCancelled()
    );
    const cancelConnection = () => E(connectionContext).cancel();

    if (!currentWs || currentWs.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to relay');
    }

    const channelId = nextChannelId;
    nextChannelId += 1;

    const { reader, writer, sink, closed, resolveClosed } = makeChannelStreams(
      sendData,
      sendClose,
      channelId,
    );

    channels.set(channelId, {
      sink: /** @type {any} */ (sink),
      resolveClosed,
    });

    const {
      promise: opened,
      resolve: resolveOpen,
      reject: rejectOpen,
    } = makePromiseKit();
    pendingOpens.set(channelId, { resolve: resolveOpen, reject: rejectOpen });

    currentWs.send(encodeOpen(channelId, targetNodeIdBytes));

    await opened;

    console.log(
      `Endo daemon connected ${connectionNumber} over ${protocol} at ${new Date().toISOString()}`,
    );

    const {
      closed: capTpClosed,
      getBootstrap,
      close: closeCapTp,
    } = makeNetstringCapTP('Endo', writer, reader, cancelled, localGateway);

    closed.then(
      () => closeCapTp(new Error('Relay channel closed')),
      () => {},
    );

    const closedRace = Promise.race([closed, capTpClosed]);
    connectionClosedPromises.add(closedRace);
    closedRace.finally(() => {
      connectionClosedPromises.delete(closedRace);
      cancelConnection();
      console.log(
        `Endo daemon closed outbound relay connection ${connectionNumber} over ${protocol} at ${new Date().toISOString()}`,
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

  return Far('WsRelayNetwork', {
    addresses: () =>
      harden([
        `${protocol}://${localNodeId}?relay=${encodeURIComponent(relayUrl)}`,
      ]),
    supports: address => {
      try {
        return new URL(address).protocol === `${protocol}:`;
      } catch {
        return false;
      }
    },
    connect,
  });
};
harden(make);
