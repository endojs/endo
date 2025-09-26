// @ts-check

import net from 'net';

import { makeSelfIdentity, sendHello } from '../client/index.js';

/**
 * @import { Connection, NetLayer, Session, Client } from '../client/types.js'
 * @import { OcapnLocation } from '../codecs/components.js'
 */

const { isNaN } = Number;

/**
 * @param {Buffer} buffer
 * @returns {Uint8Array}
 */
const bufferToBytes = buffer => {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};

/**
 * @param {NetLayer} netlayer
 * @param {net.Socket} socket
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
      socket.write(bytes);
    },
    end() {
      isDestroyed = true;
      socket.end();
    },
  });
  return connection;
};

/**
 * @param {object} options
 * @param {Client} options.client
 * @param {number} [options.specifiedPort]
 * @param {string} [options.specifiedHostname]
 * @returns {Promise<NetLayer>}
 */
export const makeTcpNetLayer = async ({
  client,
  specifiedPort = 0,
  specifiedHostname = '127.0.0.1',
}) => {
  const { logger } = client;

  // Create and start TCP server
  const server = net.createServer();

  /**
   * @returns {Promise<void>}
   */
  const listen = () => {
    return new Promise((resolve, reject) => {
      server.listen(specifiedPort, specifiedHostname, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  await listen();
  const addressInfo = server.address();
  if (typeof addressInfo !== 'object' || addressInfo === null) {
    throw Error('Unnexpected Server Address Info');
  }
  const { address, port } = addressInfo;
  logger.log('Server listening on', `${address}:${port}`);

  /** @type {OcapnLocation} */
  const localLocation = {
    type: 'ocapn-node',
    transport: 'tcp-testing-only',
    address: `${address}:${port}`,
    hints: false,
  };

  /** @type {Map<string, Connection>} */
  const connections = new Map();

  /**
   * @param {OcapnLocation} location
   * @returns {Connection}
   */
  const connect = location => {
    logger.info('Connecting to', location);
    const [host, portStr] = location.address.split(':');
    const remotePort = parseInt(portStr, 10);
    if (isNaN(remotePort)) {
      throw new Error(`Invalid port in address: ${location.address}`);
    }
    const socket = net.createConnection({ host, port: remotePort });
    // eslint-disable-next-line no-use-before-define
    const connection = makeConnection(netlayer, socket, true);

    socket.on('data', data => {
      const bytes = bufferToBytes(data);
      client.handleMessageData(connection, bytes);
    });

    socket.on('error', err => {
      logger.error('Socket error:', err, err.message, err.stack);
      connection.end();
    });

    sendHello(connection, connection.selfIdentity);
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
    server.close();
    for (const connection of connections.values()) {
      connection.end();
    }
  };

  /** @type {NetLayer} */
  const netlayer = harden({
    location: localLocation,
    connect: lookupOrConnect,
    shutdown,
  });

  server.on('connection', socket => {
    logger.info(
      'Client connected to server',
      `${socket.remoteAddress}:${socket.remotePort}`,
    );
    const connection = makeConnection(netlayer, socket, false);

    socket.on('data', data => {
      try {
        const bytes = bufferToBytes(data);
        if (!connection.isDestroyed) {
          client.handleMessageData(connection, bytes);
        } else {
          logger.info(
            'Server received message after connection was destroyed',
            bytes,
          );
        }
      } catch (err) {
        logger.error('Server received error:', err);
        logger.info('Server received data:', data.toString('hex'));
        socket.end();
      }
    });

    socket.on('error', err => {
      logger.error('Server socket error:', err, err.message, err.stack);
    });

    socket.on('close', () => {
      logger.info('Client disconnected from server');
      client.handleConnectionClose(connection);
    });
  });

  return netlayer;
};
