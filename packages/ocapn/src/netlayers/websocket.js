// @ts-check

import { randomBytes } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import harden from '@endo/harden';

import { makeOcapnKeyPair, makeOcapnPublicKey } from '../cryptography.js';
import {
  immutableArrayBufferToUint8Array,
  uint8ArrayToImmutableArrayBuffer,
} from '../buffer-utils.js';
import { locationToLocationId } from '../client/util.js';
import { makeSyrupReader } from '../syrup/decode.js';
import { makeSyrupWriter } from '../syrup/encode.js';
import { OcapnSignatureCodec } from '../codecs/components.js';
import { makeOcapnRecordCodecFromDefinition } from '../codecs/util.js';

/**
 * @import { RawData } from 'ws'
 * @import { Connection, NetLayer, NetlayerHandlers, SocketOperations } from '../client/types.js'
 * @import { OcapnLocation, OcapnSignature } from '../codecs/components.js'
 */

/**
 * Authentication protocol (matches Spritely Goblins websocket netlayer):
 *
 *   1. Outgoing client opens the websocket and sends a syrup-encoded
 *      `<init:peer-auth payload>` record where `payload` is 32 random bytes.
 *      The record wrapper is required to prevent a signing-oracle attack
 *      (the server only ever signs typed `init:peer-auth` payloads).
 *   2. Incoming server decodes the message, asserts it is a valid
 *      `init:peer-auth` record, then signs the received bytes with its
 *      designator key and replies with a syrup-encoded
 *      `<desc:sig-envelope object signature>` record carrying both the
 *      original `init:peer-auth` and the signature.
 *   3. Outgoing client decodes the envelope, extracts the signature, and
 *      verifies it against the bytes it originally sent using the public
 *      key encoded in the remote designator.
 *
 * See goblins/ocapn/netlayer/websocket.scm in spritely/goblins.
 */

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const DESIGNATOR_CHALLENGE_PAYLOAD_BYTES = 32;
const DESIGNATOR_PUBLIC_KEY_BYTES = 32;

/** @type {Map<string, number>} */
const BASE32_DECODE_TABLE = new Map(
  [...BASE32_ALPHABET].map((char, index) => [char, index]),
);

/**
 * @typedef {object} InitPeerAuth
 * @property {'init:peer-auth'} type
 * @property {ArrayBufferLike} payload
 */

/**
 * @typedef {object} InitPeerAuthSigEnvelope
 * @property {'desc:sig-envelope'} type
 * @property {InitPeerAuth} object
 * @property {OcapnSignature} signature
 */

const InitPeerAuthCodec = makeOcapnRecordCodecFromDefinition(
  'InitPeerAuth',
  'init:peer-auth',
  {
    payload: 'bytestring',
  },
);

const InitPeerAuthSigEnvelopeCodec = makeOcapnRecordCodecFromDefinition(
  'InitPeerAuthSigEnvelope',
  'desc:sig-envelope',
  {
    object: InitPeerAuthCodec,
    signature: OcapnSignatureCodec,
  },
);

/**
 * @param {RawData} rawData
 * @returns {Uint8Array}
 */
const rawDataToBytes = rawData => {
  if (Array.isArray(rawData)) {
    const totalLength = rawData.reduce(
      (sum, piece) => sum + piece.byteLength,
      0,
    );
    const joined = new Uint8Array(totalLength);
    let offset = 0;
    for (const piece of rawData) {
      joined.set(piece, offset);
      offset += piece.byteLength;
    }
    return joined;
  }
  if (rawData instanceof ArrayBuffer) {
    return new Uint8Array(rawData);
  }
  if (ArrayBuffer.isView(rawData)) {
    const view = new Uint8Array(
      rawData.buffer,
      rawData.byteOffset,
      rawData.byteLength,
    );
    // Syrup reader requires byteOffset === 0.
    return new Uint8Array(view);
  }
  throw Error('Unsupported websocket message type');
};

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
const base32Encode = bytes => {
  let value = 0;
  let bits = 0;
  let output = '';
  for (const byte of bytes) {
    value = value * 256 + byte;
    bits += 8;
    while (bits >= 5) {
      const divisor = 2 ** (bits - 5);
      const index = Math.floor(value / divisor);
      output += BASE32_ALPHABET[index];
      value -= index * divisor;
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[value * 2 ** (5 - bits)];
  }
  return output;
};

/**
 * @param {string} value
 * @returns {Uint8Array}
 */
const base32Decode = value => {
  const cleaned = value.toLowerCase().replaceAll('=', '').replaceAll('-', '');
  let bits = 0;
  let accumulator = 0;
  /** @type {number[]} */
  const output = [];
  for (const char of cleaned) {
    const index = BASE32_DECODE_TABLE.get(char);
    if (index === undefined) {
      throw Error(`Invalid base32 character: ${char}`);
    }
    accumulator = accumulator * 32 + index;
    bits += 5;
    while (bits >= 8) {
      const divisor = 2 ** (bits - 8);
      const byte = Math.floor(accumulator / divisor);
      output.push(byte);
      accumulator -= byte * divisor;
      bits -= 8;
    }
  }
  return new Uint8Array(output);
};

/**
 * @param {Uint8Array} payload
 * @returns {Uint8Array}
 */
const encodeInitPeerAuth = payload => {
  const syrupWriter = makeSyrupWriter();
  InitPeerAuthCodec.write(
    {
      type: 'init:peer-auth',
      payload: uint8ArrayToImmutableArrayBuffer(payload),
    },
    syrupWriter,
  );
  return syrupWriter.getBytes();
};

/**
 * @param {Uint8Array} bytes
 * @returns {InitPeerAuth}
 */
const decodeInitPeerAuth = bytes => {
  const syrupReader = makeSyrupReader(bytes);
  return InitPeerAuthCodec.read(syrupReader);
};

/**
 * @param {InitPeerAuth} initPeerAuth
 * @param {OcapnSignature} signature
 * @returns {Uint8Array}
 */
const encodeInitPeerAuthSigEnvelope = (initPeerAuth, signature) => {
  const syrupWriter = makeSyrupWriter();
  InitPeerAuthSigEnvelopeCodec.write(
    {
      type: 'desc:sig-envelope',
      object: initPeerAuth,
      signature,
    },
    syrupWriter,
  );
  return syrupWriter.getBytes();
};

/**
 * @param {Uint8Array} bytes
 * @returns {InitPeerAuthSigEnvelope}
 */
const decodeInitPeerAuthSigEnvelope = bytes => {
  const syrupReader = makeSyrupReader(bytes);
  return InitPeerAuthSigEnvelopeCodec.read(syrupReader);
};

/**
 * @typedef {object} OutgoingSocketState
 * @property {boolean} authenticated
 * @property {Uint8Array[]} pendingWrites
 */

/**
 * @param {WebSocket} ws
 * @param {OutgoingSocketState} state
 * @returns {SocketOperations}
 */
const makeOutgoingSocketOperations = (ws, state) => {
  return {
    write(bytes) {
      if (state.authenticated && ws.readyState === WebSocket.OPEN) {
        ws.send(bytes, { binary: true });
      } else {
        state.pendingWrites.push(bytes);
      }
    },
    end() {
      ws.close();
    },
  };
};

/**
 * @param {WebSocket} ws
 * @returns {SocketOperations}
 */
const makeIncomingSocketOperations = ws => {
  return {
    write(bytes) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(bytes, { binary: true });
      }
    },
    end() {
      ws.close();
    },
  };
};

/**
 * @typedef {object} WebSocketNetLayerDebug
 * @property {Uint8Array} designatorPublicKey
 *
 * @typedef {NetLayer & { _debug: WebSocketNetLayerDebug }} WebSocketNetLayer
 */

/**
 * @param {object} options
 * @param {NetlayerHandlers} options.handlers
 * @param {import('../client/types.js').Logger} options.logger
 * @param {number} [options.specifiedPort]
 * @param {string} [options.specifiedHostname]
 * @param {string} [options.specifiedUrl]
 * @returns {Promise<WebSocketNetLayer>}
 */
export const makeWebSocketNetLayer = async ({
  handlers,
  logger,
  specifiedPort = 0,
  specifiedHostname = '127.0.0.1',
  specifiedUrl,
}) => {
  const designatorKeyPair = makeOcapnKeyPair();
  const designatorPublicKey = immutableArrayBufferToUint8Array(
    designatorKeyPair.publicKey.bytes,
  );
  const designator = base32Encode(designatorPublicKey);

  const server = new WebSocketServer({
    host: specifiedHostname,
    port: specifiedPort,
  });

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const addressInfo = server.address();
  if (!addressInfo || typeof addressInfo === 'string') {
    throw Error('Unexpected websocket server address info');
  }
  const host = addressInfo.address;
  const port = addressInfo.port;
  const publicUrl = specifiedUrl ?? `ws://${host}:${port}`;

  /** @type {OcapnLocation} */
  const localLocation = {
    type: 'ocapn-peer',
    transport: 'websocket',
    designator,
    hints: {
      url: publicUrl,
    },
  };

  /** @type {Map<string, Connection>} */
  const outgoingConnections = new Map();
  /** @type {Set<WebSocket>} */
  const activeSockets = new Set();
  /** @type {WebSocketNetLayer} */
  let netlayer;

  /**
   * @param {OcapnLocation} remoteLocation
   * @returns {Connection}
   */
  const connect = remoteLocation => {
    if (remoteLocation.transport !== localLocation.transport) {
      throw Error(`Unsupported transport: ${remoteLocation.transport}`);
    }
    if (
      typeof remoteLocation.hints !== 'object' ||
      remoteLocation.hints === null
    ) {
      throw Error('Websocket location requires hints.url');
    }
    const wsUrl = remoteLocation.hints.url;
    if (typeof wsUrl !== 'string' || wsUrl.length === 0) {
      throw Error('Websocket location requires a non-empty hints.url');
    }

    const locationId = locationToLocationId(remoteLocation);
    const existing = outgoingConnections.get(locationId);
    if (existing && !existing.isDestroyed) {
      return existing;
    }
    if (existing) {
      outgoingConnections.delete(locationId);
    }

    const remotePublicKeyBytes = base32Decode(remoteLocation.designator);
    if (remotePublicKeyBytes.byteLength !== DESIGNATOR_PUBLIC_KEY_BYTES) {
      throw Error(
        `Expected websocket designator to decode to ${DESIGNATOR_PUBLIC_KEY_BYTES} bytes, got ${remotePublicKeyBytes.byteLength}`,
      );
    }
    const remotePublicKey = makeOcapnPublicKey(
      uint8ArrayToImmutableArrayBuffer(remotePublicKeyBytes),
    );

    logger.info('Connecting to websocket', { wsUrl });
    const ws = new WebSocket(wsUrl);
    activeSockets.add(ws);

    /** @type {OutgoingSocketState} */
    const socketState = {
      authenticated: false,
      pendingWrites: [],
    };

    /** @type {Uint8Array} */
    let challengeMessage = new Uint8Array(0);
    const socketOps = makeOutgoingSocketOperations(ws, socketState);
    const connection = handlers.makeConnection(netlayer, true, socketOps);

    ws.on('open', () => {
      const payload = Uint8Array.from(
        randomBytes(DESIGNATOR_CHALLENGE_PAYLOAD_BYTES),
      );
      challengeMessage = encodeInitPeerAuth(payload);
      ws.send(challengeMessage, { binary: true });
    });

    ws.on('message', rawData => {
      const messageBytes = rawDataToBytes(rawData);
      if (!socketState.authenticated) {
        try {
          const envelope = decodeInitPeerAuthSigEnvelope(messageBytes);
          remotePublicKey.assertSignatureValid(
            uint8ArrayToImmutableArrayBuffer(challengeMessage),
            envelope.signature,
          );
          socketState.authenticated = true;
          for (const pendingWrite of socketState.pendingWrites) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(pendingWrite, { binary: true });
            }
          }
          socketState.pendingWrites = [];
        } catch (error) {
          logger.error('Websocket outgoing auth failure', error);
          connection.end();
        }
        return;
      }
      if (!connection.isDestroyed) {
        handlers.handleMessageData(connection, messageBytes);
      }
    });

    ws.on('error', error => {
      logger.error('Websocket outgoing connection error', error);
      connection.end();
    });

    ws.on('close', () => {
      activeSockets.delete(ws);
      outgoingConnections.delete(locationId);
      handlers.handleConnectionClose(connection);
    });

    outgoingConnections.set(locationId, connection);
    return connection;
  };

  const shutdown = () => {
    for (const socket of activeSockets) {
      socket.terminate();
    }
    activeSockets.clear();
    outgoingConnections.clear();
    server.close();
  };

  netlayer = harden({
    location: localLocation,
    locationId: locationToLocationId(localLocation),
    connect,
    shutdown,
    // eslint-disable-next-line no-underscore-dangle
    _debug: {
      designatorPublicKey,
    },
  });

  server.on('connection', ws => {
    activeSockets.add(ws);
    /** @type {Connection | undefined} */
    let connection;

    ws.on('message', rawData => {
      const messageBytes = rawDataToBytes(rawData);

      if (!connection) {
        try {
          const initPeerAuth = decodeInitPeerAuth(messageBytes);
          // Sign the received bytes verbatim. The wrapping `init:peer-auth`
          // record prevents this from being used as a generic signing oracle.
          const signature = designatorKeyPair.sign(
            uint8ArrayToImmutableArrayBuffer(messageBytes),
          );
          const responseBytes = encodeInitPeerAuthSigEnvelope(
            initPeerAuth,
            signature,
          );
          ws.send(responseBytes, { binary: true });

          const socketOps = makeIncomingSocketOperations(ws);
          connection = handlers.makeConnection(netlayer, false, socketOps);
        } catch (error) {
          logger.error('Websocket incoming auth failure', error);
          ws.close();
        }
        return;
      }

      if (!connection.isDestroyed) {
        handlers.handleMessageData(connection, messageBytes);
      }
    });

    ws.on('error', error => {
      logger.error('Websocket incoming connection error', error);
      if (connection) {
        connection.end();
      } else {
        ws.close();
      }
    });

    ws.on('close', () => {
      activeSockets.delete(ws);
      if (connection) {
        handlers.handleConnectionClose(connection);
      }
    });
  });

  return netlayer;
};
