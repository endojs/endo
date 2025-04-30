// @ts-check

import net from 'net';

import { readOCapNMessage } from '../codecs/operations.js';
import { makeSyrupReader } from '../syrup/decode.js';
import { locationToLocationId } from '../client.js';

const textDecoder = new TextDecoder();

/**
 * @typedef {import('../codecs/components.js').OCapNLocation} OCapNLocation
 * @typedef {import('./types.js').NetLayer} NetLayer
 * @typedef {import('../client.js').Client} Client
 * @typedef {import('./types.js').Connection} Connection
 */

/**
 * @param {Client} client
 * @param {NetLayer} netlayer
 * @param {net.Socket} socket
 * @returns {Connection}
 */
const makeConnection = (client, netlayer, socket) => {
  let isDestroyed = false;
  /** @type {Connection} */
  const connection = {
    netlayer,
    session: undefined,
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

  /** @type {NetLayer} */
  const netlayer = {
    location: localLocation,
  };

  server.on('connection', socket => {
    console.log('Client connected to server');
    const connection = makeConnection(client, netlayer, socket);

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
        console.log('Server received data:', textDecoder.decode(data));
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
