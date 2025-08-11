// @ts-check

import { WebSocketServer, WebSocket } from 'ws';
import { Buffer } from 'node:buffer';
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
 * @param {import('ws').WebSocket} socket
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
      if (socket.readyState === socket.OPEN) {
        socket.send(Buffer.from(bytes));
      }
    },
    end() {
      isDestroyed = true;
      if (socket.readyState === socket.OPEN) {
        socket.close();
      }
    },
  });
  return connection;
};

/**
 * @param {object} options
 * @param {Client} options.client
 * @param {number} [options.port]
 * @param {string} [options.hostname]
 * @returns {Promise<NetLayer>}
 */
export const makeWebSocketServerNetLayer = async ({
  client,
  port = 8080,
  hostname = 'localhost',
}) => {
  const { logger } = client;

  // Create and start WebSocket server
  const wss = new WebSocketServer({ port, host: hostname });

  // const addressInfo = wss.address();
  // console.log('addressInfo', addressInfo);
  // if (typeof addressInfo !== 'object' || addressInfo === null) {
  //   throw Error('Unexpected Server Address Info');
  // }
  // const { address, port: actualPort } = addressInfo;
  // logger.log('WebSocket server listening on', `${address}:${actualPort}`);

  /** @type {OcapnLocation} */
  const localLocation = {
    type: 'ocapn-node',
    transport: 'websocket',
    // TODO: wss://
    address: `ws://${hostname}:${port}`,
    hints: false,
  };

  /** @type {Map<string, Connection>} */
  const connections = new Map();

  /**
   * @param {OcapnLocation} location
   * @returns {Connection}
   */
  const connect = location => {
    console.log('x: connect: ws server');
    logger.info('Connecting to', location);

    if (location.transport !== 'websocket') {
      throw new Error(`Unsupported transport: ${location.transport}`);
    }

    // For server-side connections to other servers, we create a client connection
    const socket = new WebSocket(location.address);
    // eslint-disable-next-line no-use-before-define
    const connection = makeConnection(netlayer, socket, true);

    socket.on('open', () => {
      logger.info('WebSocket client connection opened to', socket.url);
      sendHello(connection, connection.selfIdentity);
    });

    socket.on('message', data => {
      try {
        // WebSocket server can receive Buffer, ArrayBuffer, or string
        let bytes;
        if (Buffer.isBuffer(data)) {
          bytes = new Uint8Array(data);
        } else if (data instanceof ArrayBuffer) {
          bytes = new Uint8Array(data);
        } else if (typeof data === 'string') {
          // Convert string to Uint8Array (assuming UTF-8 encoding)
          const encoder = new TextEncoder();
          bytes = encoder.encode(data);
        } else {
          logger.error('Unknown data type received:', typeof data);
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
    });

    socket.on('error', err => {
      logger.error('WebSocket client error:', err);
      connection.end();
    });

    socket.on('close', (code, reason) => {
      logger.info('WebSocket client connection closed:', code, reason);
      client.handleConnectionClose(connection);
    });

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
    wss.close();
    for (const connection of connections.values()) {
      connection.end();
    }
    connections.clear();
    logger.info('WebSocket server shutdown');
  };

  /** @type {NetLayer} */
  const netlayer = harden({
    location: localLocation,
    connect: lookupOrConnect,
    shutdown,
  });

  // Handle incoming WebSocket connections
  wss.on('connection', (socket, request) => {
    const clientAddress = request.socket.remoteAddress;
    const clientPort = request.socket.remotePort;
    logger.info(
      'WebSocket client connected to server',
      `${clientAddress}:${clientPort}`,
    );

    const connection = makeConnection(netlayer, socket, false);

    socket.on('message', data => {
      try {
        // WebSocket server can receive Buffer, ArrayBuffer, or string
        let bytes;
        if (Buffer.isBuffer(data)) {
          bytes = new Uint8Array(data);
        } else if (data instanceof ArrayBuffer) {
          bytes = new Uint8Array(data);
        } else if (typeof data === 'string') {
          // Convert string to Uint8Array (assuming UTF-8 encoding)
          const encoder = new TextEncoder();
          bytes = encoder.encode(data);
        } else {
          logger.error('Unknown data type received:', typeof data);
          return;
        }

        if (!connection.isDestroyed) {
          client.handleMessageData(connection, bytes);
        } else {
          logger.info(
            'WebSocket server received message after connection was destroyed',
            bytes,
          );
        }
      } catch (err) {
        logger.error('WebSocket server received error:', err);
        socket.close();
      }
    });

    socket.on('error', err => {
      logger.error('WebSocket server socket error:', err);
    });

    socket.on('close', (code, reason) => {
      logger.info('WebSocket client disconnected from server:', code, reason);
      client.handleConnectionClose(connection);
    });
  });

  return netlayer;
};
