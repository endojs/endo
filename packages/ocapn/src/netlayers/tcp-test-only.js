// @ts-check
/* global setTimeout */

import net from 'net';
import harden from '@endo/harden';

import { locationToLocationId } from '../client/util.js';
import { sendHandshake } from '../client/handshake.js';

/**
 * @import { Connection, NetLayer, NetlayerHandlers, SelfIdentity, SocketOperations } from '../client/types.js'
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
 * Creates socket operations with optional write latency.
 * @param {net.Socket} socket
 * @param {number} writeLatencyMs
 * @returns {SocketOperations}
 */
const makeSocketOperations = (socket, writeLatencyMs) => {
  return {
    write(bytes) {
      if (writeLatencyMs > 0) {
        setTimeout(() => {
          if (!socket.destroyed) {
            socket.write(bytes);
          }
        }, writeLatencyMs);
      } else {
        socket.write(bytes);
      }
    },
    end() {
      socket.end();
    },
  };
};

/**
 * @typedef {object} ConnectionSocketPair
 * @property {Connection} connection
 * @property {net.Socket} socket
 */

/**
 * Debug interface for test-only netlayer.
 * @typedef {object} TcpTestOnlyNetLayerDebug
 * @property {(location: OcapnLocation) => ConnectionSocketPair} establishConnection
 *
 * @typedef {NetLayer & import('../client/types.js').OcapnNetwork & { _debug: TcpTestOnlyNetLayerDebug }} TcpTestOnlyNetLayer
 */

/**
 * @param {object} options
 * @param {NetlayerHandlers} options.handlers
 * @param {import('../client/types.js').Logger} options.logger
 * @param {number} [options.specifiedPort]
 * @param {string} [options.specifiedHostname]
 * @param {string} [options.specifiedDesignator]
 * @param {number} [options.writeLatencyMs] - Optional artificial latency for writes (ms), useful for testing pipelining
 * @returns {Promise<TcpTestOnlyNetLayer>}
 */
export const makeTcpNetLayer = async ({
  handlers,
  logger,
  specifiedPort = 0,
  specifiedHostname = '127.0.0.1',
  // Unclear if a fallback value is reasonable.
  specifiedDesignator = '0000',
  writeLatencyMs = 0,
}) => {
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
    throw Error('Unexpected Server Address Info');
  }
  const { address, port } = addressInfo;
  logger.log('Server listening on', `${address}:${port}`);

  /** @type {OcapnLocation} */
  const localLocation = {
    type: 'ocapn-peer',
    network: 'tcp-testing-only',
    transport: 'tcp-testing-only', // Legacy; prefer `network`.
    designator: specifiedDesignator,
    hints: {
      host: address,
      port: port.toString(),
    },
  };

  /** @type {Map<string, Connection>} */
  const outgoingConnections = new Map();

  /** @type {Set<net.Socket>} */
  const activeSockets = new Set();

  /**
   * Sets up socket event handlers for both incoming and outgoing connections.
   * @param {net.Socket} socket
   * @param {Connection} connection
   * @param {() => void} [onClose] - Optional additional cleanup on close
   */
  const setupSocketHandlers = (socket, connection, onClose) => {
    activeSockets.add(socket);

    socket.on('data', data => {
      // The 'data' event yields `string | Buffer` in @types/node v25; the
      // socket has no encoding set so it is always Buffer here.
      const bytes = bufferToBytes(/** @type {Buffer} */ (data));
      if (!connection.isDestroyed) {
        handlers.handleMessageData(connection, bytes);
      } else {
        logger.info(
          'TcpTestOnlyNetLayer received message after connection was destroyed',
        );
      }
    });

    socket.on('error', err => {
      logger.error('Socket error:', err, err.message, err.stack);
      connection.end();
    });

    socket.on('close', () => {
      logger.info('Connection closed');
      activeSockets.delete(socket);
      if (onClose) {
        onClose();
      }
      // Mark the connection destroyed before notifying the client.
      // Otherwise a socket that closes without the userland data handler
      // first observing an op:abort (e.g. RST, dropped in-flight bytes,
      // or close racing data delivery) would leave `connection.isDestroyed`
      // false, which causes test waiters and reconnect logic to hang.
      connection.end();
      handlers.handleConnectionClose(connection);
    });
  };

  /**
   * @param {OcapnLocation} location
   * @returns {ConnectionSocketPair}
   */
  const internalEstablishConnection = location => {
    if (typeof location.hints !== 'object') {
      throw new Error('Hints required for remote connections');
    }
    const { host, port: portStr } = location.hints;
    if (host === undefined || portStr === undefined) {
      throw new Error(
        'Host and port hints are required for remote connections',
      );
    }
    const remotePort = parseInt(portStr, 10);
    if (isNaN(remotePort)) {
      throw new Error(`Invalid port in hints: ${portStr}`);
    }
    const socket = net.createConnection({ host, port: remotePort });

    const socketOps = makeSocketOperations(socket, writeLatencyMs);
    // eslint-disable-next-line no-use-before-define
    const connection = handlers.makeConnection(netlayer, true, socketOps);

    setupSocketHandlers(socket, connection, () => {
      // Only evict ourselves from the outgoing map. The map may contain a
      // *different* connection for this designator (e.g. one created by a
      // later `lookupOrConnect`) when this one was created via the debug
      // `establishConnection` helper that bypasses registration. An
      // unconditional delete would silently break later sessions.
      if (outgoingConnections.get(location.designator) === connection) {
        outgoingConnections.delete(location.designator);
      }
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
    return connection;
  };

  /**
   * @param {OcapnLocation} location
   * @returns {Connection}
   */
  const lookupOrConnect = location => {
    const remoteNetworkId = location.network ?? location.transport;
    const localNetworkId = localLocation.network ?? localLocation.transport;
    if (remoteNetworkId !== localNetworkId) {
      throw Error(`Unsupported network: ${remoteNetworkId}`);
    }
    const existingConnection = outgoingConnections.get(location.designator);
    // Only reuse connection if it's not destroyed
    if (existingConnection && !existingConnection.isDestroyed) {
      logger.info(`lookupOrConnect returning existing connection`);
      return existingConnection;
    }
    // Remove destroyed connection from map
    if (existingConnection) {
      logger.info(`lookupOrConnect removing destroyed connection`);
      outgoingConnections.delete(location.designator);
    }
    logger.info(`lookupOrConnect creating new connection`);
    const newConnection = connect(location);
    outgoingConnections.set(location.designator, newConnection);
    return newConnection;
  };

  const shutdown = () => {
    server.close();
    // Destroy all active sockets (both incoming and outgoing)
    for (const socket of activeSockets) {
      socket.destroy();
    }
    activeSockets.clear();
    outgoingConnections.clear();
  };

  /** @type {TcpTestOnlyNetLayer} */
  const netlayer = harden({
    // OcapnNetwork interface
    networkId: 'tcp-testing-only',
    // NetLayer interface (legacy, retained during migration)
    location: localLocation,
    locationId: locationToLocationId(localLocation),
    connect: lookupOrConnect,
    shutdown,
    /**
     * The tcp-testing-only network uses the standard op:start-session
     * handshake.  This method delegates to the core sendHandshake,
     * making the handshake a network concern rather than OCapN core.
     *
     * @param {Connection} connection
     * @param {string} captpVersion
     * @param {SelfIdentity} selfIdentity
     * @param {import('../codec-interface.js').OcapnCodec} codec
     */
    sendSessionHandshake: (connection, captpVersion, selfIdentity, codec) => {
      sendHandshake(connection, selfIdentity, captpVersion, codec);
    },
    // eslint-disable-next-line no-underscore-dangle
    _debug: {
      establishConnection: internalEstablishConnection,
    },
  });

  server.on('connection', socket => {
    logger.info(
      'Client connected to server',
      `${socket.remoteAddress}:${socket.remotePort}`,
    );

    const socketOps = makeSocketOperations(socket, writeLatencyMs);
    const connection = handlers.makeConnection(netlayer, false, socketOps);

    setupSocketHandlers(socket, connection);
  });

  return netlayer;
};
