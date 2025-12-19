// @ts-check
/* global setTimeout */

import net from 'net';

import { makeSelfIdentity, sendHello } from '../client/index.js';
import { locationToLocationId } from '../client/util.js';

/**
 * @import { Connection, NetLayer, Client } from '../client/types.js'
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
 * @param {object} [options]
 * @param {() => void} [options.onDestroy] - Optional cleanup callback when connection is destroyed
 * @param {number} [options.writeLatencyMs] - Optional artificial latency for writes (ms)
 * @returns {Connection}
 */
const makeConnection = (netlayer, socket, isOutgoing, options = {}) => {
  const { onDestroy, writeLatencyMs = 0 } = options;
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
      if (writeLatencyMs > 0) {
        setTimeout(() => {
          if (!isDestroyed) {
            socket.write(bytes);
          }
        }, writeLatencyMs);
      } else {
        socket.write(bytes);
      }
    },
    end() {
      if (isDestroyed) return;
      isDestroyed = true;
      socket.end();
      if (onDestroy) {
        onDestroy();
      }
    },
  });
  return connection;
};

/**
 * @typedef {object} ConnectionSocketPair
 * @property {Connection} connection
 * @property {net.Socket} socket
 */

/**
 * @typedef {object} TcpTestOnlyNetLayerTesting
 * @property {(location: OcapnLocation, onDestroy?: () => void) => ConnectionSocketPair} establishConnection
 *
 * @typedef {NetLayer & { testing: TcpTestOnlyNetLayerTesting }} TcpTestOnlyNetLayer
 */

/**
 * @param {object} options
 * @param {Client} options.client
 * @param {number} [options.specifiedPort]
 * @param {string} [options.specifiedHostname]
 * @param {string} [options.specifiedDesignator]
 * @param {number} [options.writeLatencyMs] - Optional artificial latency for writes (ms), useful for testing pipelining
 * @returns {Promise<TcpTestOnlyNetLayer>}
 */
export const makeTcpNetLayer = async ({
  client,
  specifiedPort = 0,
  specifiedHostname = '127.0.0.1',
  // Unclear if a fallback value is reasonable.
  specifiedDesignator = '0000',
  writeLatencyMs = 0,
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
    type: 'ocapn-peer',
    transport: 'tcp-testing-only',
    designator: specifiedDesignator,
    hints: {
      host: address,
      port: port.toString(),
    },
  };

  /** @type {Map<string, Connection>} */
  const connections = new Map();

  /**
   * @param {OcapnLocation} location
   * @returns {ConnectionSocketPair}
   */
  const internalEstablishConnection = location => {
    if (typeof location.hints !== 'object') {
      throw new Error('Hints required for remote connections');
    }
    const { host, port: portStr } = location.hints;
    const remotePort = parseInt(portStr, 10);
    if (isNaN(remotePort)) {
      throw new Error(`Invalid port in hints: ${portStr}`);
    }
    const socket = net.createConnection({ host, port: remotePort });

    // eslint-disable-next-line no-use-before-define
    const connection = makeConnection(netlayer, socket, true, {
      onDestroy: () => {
        connections.delete(location.designator);
      },
      writeLatencyMs,
    });

    socket.on('data', data => {
      const bytes = bufferToBytes(data);
      client.handleMessageData(connection, bytes);
    });

    socket.on('error', err => {
      logger.error('Socket error:', err, err.message, err.stack);
      connection.end();
    });

    socket.on('close', () => {
      logger.info('Connection closed');
      client.handleConnectionClose(connection);
    });

    return { connection, socket };
  };

  /**
   * @param {OcapnLocation} location
   * @returns {Connection}
   */
  const connect = location => {
    logger.info('Connecting to', location);
    const { connection } = internalEstablishConnection(location);
    sendHello(connection, connection.selfIdentity, client.captpVersion);
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
    const existingConnection = connections.get(location.designator);
    // Only reuse connection if it's not destroyed
    if (existingConnection && !existingConnection.isDestroyed) {
      client.logger.info(`lookupOrConnect returning existing connection`);
      return existingConnection;
    }
    // Remove destroyed connection from map
    if (existingConnection) {
      client.logger.info(`lookupOrConnect removing destroyed connection`);
      connections.delete(location.designator);
    }
    client.logger.info(`lookupOrConnect creating new connection`);
    const newConnection = connect(location);
    connections.set(location.designator, newConnection);
    return newConnection;
  };

  const shutdown = () => {
    server.close();
    for (const connection of connections.values()) {
      connection.end();
    }
  };

  /** @type {TcpTestOnlyNetLayer} */
  const netlayer = harden({
    location: localLocation,
    locationId: locationToLocationId(localLocation),
    connect: lookupOrConnect,
    shutdown,
    // Test-only methods
    testing: {
      establishConnection: internalEstablishConnection,
    },
  });

  server.on('connection', socket => {
    logger.info(
      'Client connected to server',
      `${socket.remoteAddress}:${socket.remotePort}`,
    );
    const connection = makeConnection(netlayer, socket, false, {
      writeLatencyMs,
    });

    socket.on('data', data => {
      try {
        const bytes = bufferToBytes(data);
        if (!connection.isDestroyed) {
          client.handleMessageData(connection, bytes);
        } else {
          logger.info(
            'TcpTestOnlyNetLayer received message after connection was destroyed',
            bytes,
          );
        }
      } catch (err) {
        logger.error(
          'TcpTestOnlyNetLayer encountered error while handling incomming data:',
          err,
        );
        logger.info('   incoming data:', data.toString('hex'));
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
