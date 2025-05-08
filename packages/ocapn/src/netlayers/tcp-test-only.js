// @ts-check

import net from 'net';

import { makePromiseKit } from '@endo/promise-kit';
import {
  locationToLocationId,
  makeSelfIdentity,
  sendHello,
} from '../client/index.js';

const { isNaN } = Number;

/**
 * @param {Buffer} buffer
 * @returns {Uint8Array}
 */
const bufferToBytes = buffer => {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};

/**
 * @typedef {import('../codecs/components.js').OCapNLocation} OCapNLocation
 * @typedef {import('../client/types.js').NetLayer} NetLayer
 * @typedef {import('../client/index.js').Client} Client
 * @typedef {import('../client/types.js').Connection} Connection
 * @typedef {import('../client/types.js').Session} Session
 */

/**
 * @param {Client} client
 * @param {NetLayer} netlayer
 * @param {net.Socket} socket
 * @param {boolean} isOutgoing
 * @returns {Connection}
 */
const makeConnection = (client, netlayer, socket, isOutgoing) => {
  let isDestroyed = false;
  /** @type {Session | undefined} */
  let session;
  const { promise: whenSessionReady, resolve: setSession } = makePromiseKit();
  const selfIdentity = makeSelfIdentity(netlayer.location);
  /** @type {Connection} */
  const connection = {
    netlayer,
    isOutgoing,
    selfIdentity,
    get session() {
      return session;
    },
    set session(value) {
      if (session) {
        throw Error('Session already set');
      }
      session = value;
      setSession(value);
    },
    get isDestroyed() {
      return isDestroyed;
    },
    write(bytes) {
      socket.write(bytes);
    },
    end() {
      socket.end();
      connection.destroySession();
    },
    destroySession() {
      isDestroyed = true;
      // Clean up the session
      if (connection.session) {
        const peerLocation = connection.session.peer.location;
        const locationId = locationToLocationId(peerLocation);
        client.activeSessions.delete(locationId);
        delete connection.session;
      }
    },
    async whenSessionReady() {
      await whenSessionReady;
      if (isDestroyed) {
        throw Error('Connection is destroyed');
      }
      if (!session) {
        // This should never happen.
        throw Error('Session is not ready');
      }
      return session;
    },
  };
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

  /** @type {OCapNLocation} */
  const localLocation = {
    type: 'ocapn-node',
    transport: 'tcp-testing-only',
    address: `${address}:${port}`,
    hints: false,
  };

  /** @type {Map<string, Connection>} */
  const connections = new Map();

  /**
   * @param {OCapNLocation} location
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
    const connection = makeConnection(client, netlayer, socket, true);
    const locationId = locationToLocationId(location);
    client.outgoingConnections.set(locationId, connection);

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
   * @param {OCapNLocation} location
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
    const connection = makeConnection(client, netlayer, socket, false);

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
      connection.destroySession();
    });
  });

  return netlayer;
};
