// @ts-check

import net from 'net';

import { makePromiseKit } from '@endo/promise-kit';
import { readOCapNMessage } from '../codecs/operations.js';
import { makeSyrupReader } from '../syrup/decode.js';
import {
  locationToLocationId,
  makeSelfIdentity,
  sendHello,
} from '../client.js';

const { isNaN } = Number;
const sloppyTextDecoder = new TextDecoder();

/**
 * @typedef {import('../codecs/components.js').OCapNLocation} OCapNLocation
 * @typedef {import('./types.js').NetLayer} NetLayer
 * @typedef {import('../client.js').Client} Client
 * @typedef {import('./types.js').Connection} Connection
 * @typedef {import('./types.js').Session} Session
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
 * @returns {NetLayer}
 */
export const makeTcpNetLayer = ({ client }) => {
  // Create and start TCP server
  const server = net.createServer();

  /** @type {OCapNLocation} */
  const localLocation = {
    type: 'ocapn-node',
    transport: 'tcp-testing-only',
    address: '127.0.0.1:22046',
    hints: false,
  };

  /** @type {Map<string, Connection>} */
  const connections = new Map();

  /**
   * @param {OCapNLocation} location
   * @returns {Connection}
   */
  const connect = location => {
    console.log('Connecting to', location);
    const [host, portStr] = location.address.split(':');
    const port = parseInt(portStr, 10);
    if (isNaN(port)) {
      throw new Error(`Invalid port in address: ${location.address}`);
    }
    const socket = net.createConnection({ host, port });
    // eslint-disable-next-line no-use-before-define
    const connection = makeConnection(client, netlayer, socket, true);
    const locationId = locationToLocationId(location);
    client.outgoingConnections.set(locationId, connection);
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

  /** @type {NetLayer} */
  const netlayer = {
    location: localLocation,
    connect: lookupOrConnect,
  };

  server.on('connection', socket => {
    console.log(
      'Client connected to server',
      `${socket.remoteAddress}:${socket.remotePort}`,
    );
    const connection = makeConnection(client, netlayer, socket, false);

    socket.on('data', data => {
      try {
        const syrupReader = makeSyrupReader(data);
        while (syrupReader.index < data.length) {
          const message = readOCapNMessage(syrupReader);
          console.log('Server received message:', message);
          console.log(data.toString('hex'));
          if (!connection.isDestroyed) {
            client.handleMessage(connection, message);
          } else {
            console.log(
              'Server received message after connection was destroyed',
              message,
            );
          }
        }
      } catch (err) {
        console.error('Server received error:', err);
        console.log('Server received data:', sloppyTextDecoder.decode(data));
        socket.end();
      }
    });

    socket.on('error', err => {
      console.error('Server socket error:', err, err.message, err.stack);
    });

    socket.on('close', () => {
      console.log('Client disconnected from server');
      connection.destroySession();
    });
  });

  // Start listening before creating the client
  server.listen(22046, '127.0.0.1', err => {
    if (err) {
      console.error('Server error:', err);
    } else {
      console.log('Server listening on port 22046');
    }
  });

  return netlayer;
};
