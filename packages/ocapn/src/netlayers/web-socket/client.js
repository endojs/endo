// @ts-check

import { makeSelfIdentity, sendHello } from '../../client/index.js';

/**
 * @typedef {import('../../codecs/components.js').OcapnLocation} OcapnLocation
 * @typedef {import('../../client/types.js').NetLayer} NetLayer
 * @typedef {import('../../client/index.js').Client} Client
 * @typedef {import('../../client/types.js').Connection} Connection
 * @typedef {import('../../client/types.js').Session} Session
 */

/**
 * @param {NetLayer} netlayer
 * @param {WebSocket} socket
 * @param {boolean} isOutgoing
 * @returns {Connection}
 */
const makeConnection = (netlayer, socket, isOutgoing) => {
  let isDestroyed = false;
  const selfIdentity = makeSelfIdentity(netlayer.location);
  /** @type {Connection} */
  const connection = harden({
    netlayer,
    isOutgoing,
    selfIdentity,
    get isDestroyed() {
      return isDestroyed;
    },
    write(bytes) {
      if (socket.readyState === WebSocket.OPEN) {
        // https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/binaryType
        socket.send(new Blob([bytes]));
      }
    },
    end() {
      isDestroyed = true;
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    },
  });
  return connection;
};

/**
 * @param {object} options
 * @param {Client} options.client
 * @param {string} [options.specifiedUrl]
 * @returns {Promise<NetLayer>}
 */
export const makeWebSocketClientNetLayer = async ({
  client,
  specifiedUrl = 'ws://localhost:8080',
}) => {
  const { logger } = client;

  // For browser WebSocket, we typically don't create a server
  // Instead, we connect to an existing WebSocket server
  // The location will represent our client endpoint

  /** @type {OcapnLocation} */
  const localLocation = {
    type: 'ocapn-node',
    transport: 'websocket',
    address: specifiedUrl,
    hints: false,
  };

  /** @type {Map<string, Connection>} */
  const connections = new Map();

  /**
   * @param {OcapnLocation} location
   * @returns {Connection}
   */
  const connect = location => {
    console.log('x: connect: ws client');
    logger.info('Connecting to', location);

    if (location.transport !== 'websocket') {
      throw new Error(`Unsupported transport: ${location.transport}`);
    }

    const socket = new WebSocket(location.address);
    // eslint-disable-next-line no-use-before-define
    const connection = makeConnection(netlayer, socket, true);

    socket.onopen = () => {
      logger.info('WebSocket connection opened');
      sendHello(connection, connection.selfIdentity);
    };

    socket.onmessage = async event => {
      await null;
      try {
        // WebSocket can receive ArrayBuffer, Blob, or string
        let bytes;
        if (event.data instanceof ArrayBuffer) {
          bytes = new Uint8Array(event.data);
        } else if (event.data instanceof Blob) {
          bytes = new Uint8Array(await event.data.arrayBuffer());
        } else if (typeof event.data === 'string') {
          // Convert string to Uint8Array (assuming UTF-8 encoding)
          const encoder = new TextEncoder();
          bytes = encoder.encode(event.data);
        } else {
          logger.error('Unknown data type received:', typeof event.data);
          return;
        }

        if (!connection.isDestroyed) {
          client.handleMessageData(connection, bytes);
        } else {
          logger.info(
            'WebSocket received message after connection was destroyed',
            bytes,
          );
        }
      } catch (err) {
        logger.error('WebSocket received error:', err);
        socket.close();
      }
    };

    socket.onerror = event => {
      logger.error('WebSocket error:', event);
      connection.end();
    };

    socket.onclose = event => {
      logger.info('WebSocket connection closed:', event.code, event.reason);
      client.handleConnectionClose(connection);
    };

    return connection;
  };

  /**
   * @param {OcapnLocation} location
   * @returns {Connection}
   */
  const lookupOrConnect = location => {
    if (location.transport !== localLocation.transport) {
      throw Error(`Unsupported transport: ${location.transport}`);
    }
    const connection = connections.get(location.address);
    if (connection) {
      return connection;
    }
    const newConnection = connect(location);
    connections.set(location.address, newConnection);
    return newConnection;
  };

  const shutdown = () => {
    for (const connection of connections.values()) {
      connection.end();
    }
    connections.clear();
  };

  /** @type {NetLayer} */
  const netlayer = harden({
    location: localLocation,
    connect: lookupOrConnect,
    shutdown,
  });

  return netlayer;
};
