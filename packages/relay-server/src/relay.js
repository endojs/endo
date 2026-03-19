// @ts-check
/* global clearInterval, clearTimeout, setInterval, setTimeout */
import crypto from 'node:crypto';
import { ed25519 } from '@noble/curves/ed25519';
import {
  MSG_HELLO,
  MSG_RESPONSE,
  MSG_OPEN,
  MSG_DATA,
  MSG_CLOSE,
  decodeFrame,
  decodeHello,
  decodeResponse,
  decodeOpen,
  decodeDataFrame,
  decodeClose,
  encodeChallenge,
  encodeAuthOk,
  encodeAuthFail,
  encodeIncoming,
  encodeOpened,
  encodeData,
  encodeClose as encodeCloseFrame,
  encodePeerGone,
  toHex,
} from './protocol.js';

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

/**
 * @typedef {{
 *   nodeId: Uint8Array | null,
 *   hexNodeId: string | null,
 *   nonce: Uint8Array | null,
 *   authed: boolean,
 *   channels: Set<number>,
 *   pingTimer: ReturnType<typeof setInterval> | null,
 *   pongTimeout: ReturnType<typeof setTimeout> | null,
 * }} ConnectionState
 */

/**
 * @param {string} domain - Relay domain bound into challenge signatures
 */
export const makeRelay = domain => {
  /** @type {Map<string, { ws: import('ws').WebSocket, nodeId: Uint8Array }>} */
  const peers = new Map();

  /**
   * Bridges keyed from both sides: bridgeKey(ws,ch) -> bridge entry.
   * @type {Map<string, { a: { ws: import('ws').WebSocket, chId: number }, b: { ws: import('ws').WebSocket, chId: number } }>}
   */
  const bridges = new Map();

  /** @type {Map<string, Array<{ ws: import('ws').WebSocket, chId: number, fromNodeId: Uint8Array }>>} */
  const pendingOpens = new Map();

  /** @type {Map<import('ws').WebSocket, ConnectionState>} */
  const connections = new Map();

  let nextServerChannelId = 1;

  const textEncoder = new TextEncoder();

  /** @param {import('ws').WebSocket} ws */
  const getConn = ws => {
    const conn = connections.get(ws);
    if (!conn) {
      throw new Error('Unknown connection');
    }
    return conn;
  };

  /**
   * @param {import('ws').WebSocket} ws
   * @param {number} ch
   */
  const makeBridgeKey = (ws, ch) => {
    const conn = getConn(ws);
    return `${conn.hexNodeId}:${ch}`;
  };

  /**
   * @param {import('ws').WebSocket} ws
   * @param {Uint8Array} data
   */
  const sendBinary = (ws, data) => {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  };

  /** @param {import('ws').WebSocket} ws */
  const cleanupConnection = ws => {
    const conn = connections.get(ws);
    if (!conn) return;

    if (conn.pingTimer) clearInterval(conn.pingTimer);
    if (conn.pongTimeout) clearTimeout(conn.pongTimeout);

    if (conn.authed && conn.hexNodeId) {
      peers.delete(conn.hexNodeId);
    }

    for (const ch of conn.channels) {
      const bk = makeBridgeKey(ws, ch);
      const bridge = bridges.get(bk);
      if (bridge) {
        // eslint-disable-next-line @endo/restrict-comparison-operands
        const other = bridge.a.ws === ws ? bridge.b : bridge.a;
        sendBinary(other.ws, encodePeerGone(other.chId));
        const otherConn = connections.get(other.ws);
        if (otherConn) {
          bridges.delete(makeBridgeKey(other.ws, other.chId));
          otherConn.channels.delete(other.chId);
        }
        bridges.delete(bk);
      }
    }

    for (const [target, pending] of pendingOpens.entries()) {
      const filtered = pending.filter(p => p.ws !== ws);
      if (filtered.length === 0) {
        pendingOpens.delete(target);
      } else {
        pendingOpens.set(target, filtered);
      }
    }

    connections.delete(ws);
  };

  /**
   * @param {import('ws').WebSocket} ws
   * @param {ConnectionState} conn
   */
  const handleAuthenticated = (ws, conn) => {
    conn.authed = true;
    if (!conn.nodeId || !conn.hexNodeId) {
      throw new Error('Assertion failed: nodeId must be set before auth');
    }
    peers.set(conn.hexNodeId, { ws, nodeId: conn.nodeId });
    sendBinary(ws, encodeAuthOk());

    const pending = pendingOpens.get(conn.hexNodeId);
    if (pending) {
      pendingOpens.delete(conn.hexNodeId);
      for (const req of pending) {
        const serverChId = nextServerChannelId;
        nextServerChannelId += 1;
        conn.channels.add(serverChId);

        const reqConn = connections.get(req.ws);
        if (reqConn) {
          const bkA = makeBridgeKey(req.ws, req.chId);
          const bkB = makeBridgeKey(ws, serverChId);
          const bridgeEntry = {
            a: { ws: req.ws, chId: req.chId },
            b: { ws, chId: serverChId },
          };
          bridges.set(bkA, bridgeEntry);
          bridges.set(bkB, bridgeEntry);

          sendBinary(ws, encodeIncoming(serverChId, req.fromNodeId));
          sendBinary(req.ws, encodeOpened(req.chId));
        }
      }
    }

    conn.pingTimer = setInterval(() => {
      if (ws.readyState === 1) {
        ws.ping();
        conn.pongTimeout = setTimeout(() => {
          ws.terminate();
        }, PONG_TIMEOUT_MS);
      }
    }, PING_INTERVAL_MS);
  };

  /**
   * @param {import('ws').WebSocket} ws
   * @param {Uint8Array} data
   */
  const handleMessage = (ws, data) => {
    const { type, payload } = decodeFrame(data);
    const conn = getConn(ws);

    if (!conn.authed) {
      if (type === MSG_HELLO && !conn.nodeId) {
        const { nodeId } = decodeHello(payload);
        conn.nodeId = new Uint8Array(nodeId);
        conn.hexNodeId = toHex(conn.nodeId);
        conn.nonce = new Uint8Array(crypto.randomBytes(32));
        sendBinary(ws, encodeChallenge(conn.nonce));
        return;
      }

      if (type === MSG_RESPONSE && conn.nodeId && conn.nonce) {
        const { signature } = decodeResponse(payload);
        const domainBytes = textEncoder.encode(domain);
        const challengeData = new Uint8Array(
          domainBytes.length + conn.nonce.length,
        );
        challengeData.set(domainBytes, 0);
        challengeData.set(conn.nonce, domainBytes.length);

        try {
          const valid = ed25519.verify(signature, challengeData, conn.nodeId);
          if (valid) {
            handleAuthenticated(ws, conn);
          } else {
            sendBinary(ws, encodeAuthFail('Invalid signature'));
            ws.close();
          }
        } catch (_) {
          sendBinary(ws, encodeAuthFail('Verification error'));
          ws.close();
        }
        return;
      }

      sendBinary(ws, encodeAuthFail('Unexpected message during auth'));
      ws.close();
      return;
    }

    // --- Authenticated phase ---
    // In the authenticated phase, conn.nodeId is guaranteed non-null.
    const authedNodeId = /** @type {Uint8Array} */ (conn.nodeId);
    switch (type) {
      case MSG_OPEN: {
        const { channelId, targetNodeId } = decodeOpen(payload);
        const targetHex = toHex(targetNodeId);
        conn.channels.add(channelId);

        const targetPeer = peers.get(targetHex);
        if (targetPeer) {
          const serverChId = nextServerChannelId;
          nextServerChannelId += 1;

          const targetConn = connections.get(targetPeer.ws);
          if (targetConn) {
            targetConn.channels.add(serverChId);
          }

          const bkA = makeBridgeKey(ws, channelId);
          const bkB = makeBridgeKey(targetPeer.ws, serverChId);
          const bridgeEntry = {
            a: { ws, chId: channelId },
            b: { ws: targetPeer.ws, chId: serverChId },
          };
          bridges.set(bkA, bridgeEntry);
          bridges.set(bkB, bridgeEntry);

          sendBinary(targetPeer.ws, encodeIncoming(serverChId, authedNodeId));
          sendBinary(ws, encodeOpened(channelId));
        } else {
          if (!pendingOpens.has(targetHex)) {
            pendingOpens.set(targetHex, []);
          }
          /** @type {Array<{ ws: import('ws').WebSocket, chId: number, fromNodeId: Uint8Array }>} */ (
            pendingOpens.get(targetHex)
          ).push({
            ws,
            chId: channelId,
            fromNodeId: authedNodeId,
          });
        }
        break;
      }

      case MSG_DATA: {
        const { channelId, data: frameData } = decodeDataFrame(payload);
        const bk = makeBridgeKey(ws, channelId);
        const bridge = bridges.get(bk);
        if (bridge) {
          // eslint-disable-next-line @endo/restrict-comparison-operands
          const other =
            bridge.a.ws === ws && bridge.a.chId === channelId
              ? bridge.b
              : bridge.a;
          sendBinary(other.ws, encodeData(other.chId, frameData));
        }
        break;
      }

      case MSG_CLOSE: {
        const { channelId } = decodeClose(payload);
        const bk = makeBridgeKey(ws, channelId);
        const bridge = bridges.get(bk);
        if (bridge) {
          // eslint-disable-next-line @endo/restrict-comparison-operands
          const other =
            bridge.a.ws === ws && bridge.a.chId === channelId
              ? bridge.b
              : bridge.a;
          sendBinary(other.ws, encodeCloseFrame(other.chId));
          const otherConn = connections.get(other.ws);
          if (otherConn) {
            bridges.delete(makeBridgeKey(other.ws, other.chId));
            otherConn.channels.delete(other.chId);
          }
          bridges.delete(bk);
          conn.channels.delete(channelId);
        }
        break;
      }

      default:
        break;
    }
  };

  /** @param {import('ws').WebSocket} ws */
  const handleConnection = ws => {
    /** @type {ConnectionState} */
    const conn = {
      nodeId: null,
      hexNodeId: null,
      nonce: null,
      authed: false,
      channels: new Set(),
      pingTimer: null,
      pongTimeout: null,
    };
    connections.set(ws, conn);

    ws.on('pong', () => {
      if (conn.pongTimeout) {
        clearTimeout(conn.pongTimeout);
        conn.pongTimeout = null;
      }
    });

    ws.on('message', (rawData, isBinary) => {
      if (!isBinary) {
        ws.close(1003, 'Binary frames only');
        return;
      }
      const data =
        rawData instanceof ArrayBuffer
          ? new Uint8Array(rawData)
          : new Uint8Array(
              /** @type {Buffer} */ (rawData).buffer,
              /** @type {Buffer} */ (rawData).byteOffset,
              /** @type {Buffer} */ (rawData).length,
            );
      handleMessage(ws, data);
    });

    ws.on('close', () => cleanupConnection(ws));
    ws.on('error', () => cleanupConnection(ws));
  };

  return {
    handleConnection,
    getPeerCount: () => peers.size,
    getConnectionCount: () => connections.size,
  };
};
