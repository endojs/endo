// @ts-check

import net from 'net';

import { readOCapNMessage } from '../codecs/operations.js';
import { makeSyrupReader } from '../syrup/decode.js';

const textDecoder = new TextDecoder();

/**
 * @typedef {import('../cryptography.js').OCapNPublicKey} OCapNPublicKey
 * @typedef {import('../cryptography.js').OCapNKeyPair} OCapNKeyPair
 * @typedef {import('../codecs/components.js').OCapNPublicKeyData} OCapNPublicKeyData
 * @typedef {import('../codecs/components.js').OCapNLocation} OCapNLocation
 * @typedef {import('../codecs/components.js').OCapNSignature} OCapNSignature
 * @typedef {import('./types.js').NetLayer} NetLayer
 * @typedef {import('./types.js').Connection} Connection
 */

/**
 * @param {NetLayer} netlayer
 * @param {net.Socket} socket
 * @returns {Connection}
 */
const makeConnection = (netlayer, socket) => {
  return {
    netlayer,
    session: undefined,
    write: bytes => {
      socket.write(bytes);
    },
    end: () => {
      socket.end();
    },
  };
};

/**
 * @param {object} options
 * @param {function(Connection, any): void} options.handleMessage
 * @returns {NetLayer}
 */
export const makeTcpNetLayer = ({ handleMessage }) => {
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
    const connection = makeConnection(netlayer, socket);

    socket.on('data', data => {
      try {
        const syrupReader = makeSyrupReader(data);
        while (syrupReader.index < data.length) {
          const message = readOCapNMessage(syrupReader);
          console.log('Server received message:', message);
          console.log(data.toString('hex'));
          handleMessage(connection, message);
        }
      } catch (err) {
        console.error('Server received error:', err);
        console.log('Server received data:', textDecoder.decode(data));
        socket.end();
      }
    });

    socket.on('error', err => {
      console.error('Server socket error:', err);
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
