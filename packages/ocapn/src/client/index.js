// @ts-check

/**
 * @typedef {import('../cryptography.js').OCapNPublicKey} OCapNPublicKey
 * @typedef {import('../cryptography.js').OCapNKeyPair} OCapNKeyPair
 * @typedef {import('../codecs/components.js').OCapNPublicKeyData} OCapNPublicKeyData
 * @typedef {import('../codecs/components.js').OCapNLocation} OCapNLocation
 * @typedef {import('../codecs/components.js').OCapNSignature} OCapNSignature
 * @typedef {import('./types.js').Session} Session
 * @typedef {import('./types.js').Connection} Connection
 * @typedef {import('./types.js').Client} Client
 * @typedef {import('./types.js').NetLayer} NetLayer
 * @typedef {import('./types.js').SelfIdentity} SelfIdentity
 * @typedef {import('./types.js').Logger} Logger
 * @typedef {import('./ocapn.js').OCapN} OCapN
 */
import { makeSyrupWriter } from '../syrup/encode.js';
import {
  readOcapnHandshakeMessage,
  writeOcapnHandshakeMessage,
} from '../codecs/operations.js';
import {
  makeCrossedHellosIdForPublicKeyData,
  makeOCapNKeyPair,
  makeOCapNPublicKey,
  publicKeyToPublicKeyData,
} from '../cryptography.js';
import { OCapNMyLocation } from '../codecs/components.js';
import { compareByteArrays } from '../syrup/compare.js';
import { OCapNFar, makeOCapN } from './ocapn.js';
import { makeSyrupReader } from '../syrup/decode.js';
import { decodeSyrup } from '../syrup/js-representation.js';

/**
 * @param {OCapNLocation} location
 * @returns {string}
 */
export const locationToLocationId = location => {
  return `${location.transport}:${location.address}`;
};

/**
 * @param {OCapNLocation} location
 * @returns {Uint8Array}
 */
const getLocationBytesForSignature = location => {
  const syrupWriter = makeSyrupWriter();
  const myLocation = {
    type: 'my-location',
    location,
  };
  OCapNMyLocation.write(myLocation, syrupWriter);
  return syrupWriter.getBytes();
};

/**
 * @param {OCapNLocation} myLocation
 * @returns {SelfIdentity}
 */
export const makeSelfIdentity = myLocation => {
  const keyPair = makeOCapNKeyPair();
  const myLocationBytes = getLocationBytesForSignature(myLocation);
  const myLocationSig = keyPair.sign(myLocationBytes);
  return { keyPair, location: myLocation, locationSignature: myLocationSig };
};

/**
 * @param {object} options
 * @param {SelfIdentity} options.selfIdentity
 * @param {OCapNLocation} options.peerLocation
 * @param {OCapNPublicKey} options.peerPublicKey
 * @param {OCapNSignature} options.peerLocationSig
 * @param {() =>Map<string, any>} [options.makeDefaultSwissnumTable]
 * @param {OCapN} options.ocapn
 * @returns {Session}
 */
const makeSession = ({
  selfIdentity,
  peerLocation,
  peerPublicKey,
  peerLocationSig,
  makeDefaultSwissnumTable = () => new Map(),
  ocapn,
}) => {
  const { keyPair, location, locationSignature } = selfIdentity;
  const importTable = new Map();
  const exportTable = new Map();
  const answerTable = new Map();
  return {
    ocapn,
    tables: {
      swissnumTable: makeDefaultSwissnumTable(),
      importTable,
      exportTable,
      exportCount: 1n,
      answerTable,
    },
    peer: {
      publicKey: peerPublicKey,
      location: peerLocation,
      locationSignature: peerLocationSig,
    },
    self: {
      keyPair,
      location,
      locationSignature,
    },
  };
};

/**
 * @param {Connection} connection
 * @param {any} mySessionData
 */
export const sendHello = (connection, mySessionData) => {
  const { keyPair, location, locationSignature } = mySessionData;
  const opStartSession = {
    type: 'op:start-session',
    captpVersion: '1.0',
    sessionPublicKey: publicKeyToPublicKeyData(keyPair.publicKey),
    location,
    locationSignature,
  };
  const bytes = writeOcapnHandshakeMessage(opStartSession);
  connection.write(bytes);
};

/**
 * @param {string} label
 * @param {() => Map<string, any>} makeDefaultSwissnumTable
 * @returns {any}
 */
const makeBootstrapObject = (label, makeDefaultSwissnumTable) => {
  const swissnumTable = makeDefaultSwissnumTable();
  const swissnumDecoder = new TextDecoder('ascii', { fatal: true });
  return OCapNFar(`${label}:bootstrap`, {
    /**
     * @param {Uint8Array} swissnum
     * @returns {Promise<any>}
     */
    fetch: swissnum => {
      const swissnumString = swissnumDecoder.decode(swissnum);
      const object = swissnumTable.get(swissnumString);
      if (!object) {
        throw Error(
          `${label}: Bootstrap fetch: Unknown swissnum for sturdyref: ${swissnumString}`,
        );
      }
      return object;
    },
  });
};

/**
 * @param {Connection} outgoingConnection
 * @param {Connection} incommingConnection
 * @param {OCapNPublicKeyData} incommingPublicKey
 * @returns {{ preferredConnection: Connection, connectionToClose: Connection }}
 */
const compareSessionKeysForCrossedHellos = (
  outgoingConnection,
  incommingConnection,
  incommingPublicKey,
) => {
  const outgoingPublicKey = publicKeyToPublicKeyData(
    outgoingConnection.selfIdentity.keyPair.publicKey,
  );
  const outgoingId = makeCrossedHellosIdForPublicKeyData(outgoingPublicKey);
  const incommingId = makeCrossedHellosIdForPublicKeyData(incommingPublicKey);
  const result = compareByteArrays(
    outgoingId,
    incommingId,
    0,
    outgoingId.length,
    0,
    incommingId.length,
  );
  const [preferredConnection, connectionToClose] =
    result > 0
      ? [outgoingConnection, incommingConnection]
      : [incommingConnection, outgoingConnection];
  return { preferredConnection, connectionToClose };
};

/**
 * @param {Client} client
 * @param {Connection} connection
 * @param {any} message
 */
const handleSessionHandshakeMessage = (client, connection, message) => {
  if (connection.session) {
    throw Error('Session already exists');
  }
  const { activeSessions, outgoingConnections } = client;

  client.logger.info(
    `${client.debugLabel}: handling handshake message of type ${message.type}`,
  );
  switch (message.type) {
    case 'op:start-session': {
      const {
        captpVersion,
        sessionPublicKey,
        location: peerLocation,
        locationSignature: peerLocationSig,
      } = message;
      // Handle invalid version
      if (captpVersion !== '1.0') {
        // send op abort
        const opAbort = {
          type: 'op:abort',
          reason: 'invalid-version',
        };
        const bytes = writeOcapnHandshakeMessage(opAbort);
        connection.write(bytes);
        return;
      }
      const locationId = locationToLocationId(peerLocation);
      if (activeSessions.has(locationId)) {
        // throw error
        throw Error('Active session already exists');
      }

      // Check if the location signature is valid
      const peerPublicKey = makeOCapNPublicKey(sessionPublicKey.q);
      const peerLocationBytes = getLocationBytesForSignature(peerLocation);
      const peerLocationSigValid = peerPublicKey.verify(
        peerLocationBytes,
        peerLocationSig,
      );
      // Handle invalid location signature
      if (!peerLocationSigValid) {
        client.logger.info('>> Server received NOT VALID location signature');
        const opAbort = {
          type: 'op:abort',
          reason: 'Invalid location signature',
        };
        const bytes = writeOcapnHandshakeMessage(opAbort);
        connection.write(bytes);
        return;
      }
      client.logger.info('>> Server received VALID location signature');

      // Check for crossed hellos
      const outgoingConnection = outgoingConnections.get(locationId);
      if (
        outgoingConnection !== undefined &&
        outgoingConnection !== connection
      ) {
        const incommingConnection = connection;
        const { connectionToClose } = compareSessionKeysForCrossedHellos(
          outgoingConnection,
          incommingConnection,
          sessionPublicKey,
        );
        // Close the non-preferred connection
        const opAbort = {
          type: 'op:abort',
          reason: 'Crossed hellos mitigated',
        };
        const bytes = writeOcapnHandshakeMessage(opAbort);
        connectionToClose.write(bytes);
        connectionToClose.end();

        // If the incomming connection is the one that was just closed, we're done.
        if (incommingConnection === connectionToClose) {
          return;
        }
      }

      // Send our hello if we haven't already
      if (connection.isOutgoing) {
        // We've already sent our hello, so our session data is already set
      } else {
        // We've received a hello, so we need to send our own
        // Send our op:start-session
        client.logger.info('Server sending op:start-session');
        sendHello(connection, connection.selfIdentity);
      }

      // Create session
      const { makeDefaultSwissnumTable } = client;
      const { selfIdentity } = connection;
      const bootstrapObj = makeBootstrapObject(
        client.debugLabel,
        makeDefaultSwissnumTable,
      );
      const ocapn = makeOCapN(
        client.logger,
        connection,
        bootstrapObj,
        client.debugLabel,
      );
      const session = makeSession({
        selfIdentity,
        peerLocation,
        peerPublicKey,
        peerLocationSig,
        makeDefaultSwissnumTable,
        ocapn,
      });
      client.logger.info(`session established`);
      connection.session = session;
      activeSessions.set(locationId, session);

      break;
    }

    case 'op:abort': {
      client.logger.info('Server received op:abort', message.reason);
      connection.end();
      break;
    }

    default: {
      throw Error(`Unknown message type: ${message.type}`);
    }
  }
};

/**
 * @param {Client} client
 * @param {Connection} connection
 * @param {Uint8Array} data
 */
const handleMessageData = (client, connection, data) => {
  try {
    if (connection.session) {
      const { ocapn } = connection.session;
      ocapn.dispatchMessageData(data);
      // return handleActiveSessionMessage(connection, data);
    } else {
      const syrupReader = makeSyrupReader(data);
      while (syrupReader.index < data.length) {
        const start = syrupReader.index;
        let message;
        try {
          message = readOcapnHandshakeMessage(syrupReader);
        } catch (err) {
          const problematicBytes = data.slice(start);
          const syrupMessage = decodeSyrup(problematicBytes);
          client.logger.error(
            `${client.debugLabel}: Message decode error:`,
            err,
            'while reading',
            syrupMessage,
          );
          connection.end();
          throw err;
        }
        if (!connection.isDestroyed) {
          handleSessionHandshakeMessage(client, connection, message);
        } else {
          client.logger.info(
            'Server received message after connection was destroyed',
            message,
          );
        }
      }
    }
  } catch (err) {
    client.logger.error(`${client.debugLabel}: Server error:`, err);
    connection.end();
    throw err;
  }
};

/**
 * @param {object} [options]
 * @param {() => Map<string, any>} [options.makeDefaultSwissnumTable]
 * @param {string} [options.debugLabel]
 * @param {boolean} [options.verbose]
 * @returns {Client}
 */
export const makeClient = ({
  makeDefaultSwissnumTable = () => new Map(),
  debugLabel = 'ocapn',
  verbose = false,
} = {}) => {
  /** @type {Map<string, Session>} */
  const activeSessions = new Map();
  /** @type {Map<string, Connection>} */
  const outgoingConnections = new Map();
  /** @type {Map<string, NetLayer>} */
  const netlayers = new Map();

  /** @type {Logger} */
  const logger = harden({
    log: (...args) => console.log(`${debugLabel}:`, ...args),
    error: (...args) => console.error(`${debugLabel}:`, ...args),
    info: (...args) => verbose && console.info(`${debugLabel}:`, ...args),
  });

  /** @type {Client} */
  const client = {
    debugLabel,
    logger,
    activeSessions,
    outgoingConnections,
    makeDefaultSwissnumTable,
    /**
     * @param {NetLayer} netlayer
     */
    registerNetlayer(netlayer) {
      const { transport } = netlayer.location;
      if (netlayers.has(transport)) {
        throw Error(`Netlayer already registered for transport: ${transport}`);
      }
      netlayers.set(transport, netlayer);
    },
    /**
     * @param {Connection} connection
     * @param {Uint8Array} data
     */
    handleMessageData(connection, data) {
      client.logger.info(`handleMessageData called`);
      handleMessageData(client, connection, data);
    },
    /**
     * @param {OCapNLocation} location
     * @returns {Connection}
     */
    connect(location) {
      client.logger.info(`connect called with`, { location });
      const netlayer = netlayers.get(location.transport);
      if (!netlayer) {
        throw Error(
          `Netlayer not registered for transport: ${location.transport}`,
        );
      }
      const connection = netlayer.connect(location);
      return connection;
    },
    shutdown() {
      client.logger.info(`shutdown called`);
      for (const netlayer of netlayers.values()) {
        netlayer.shutdown();
      }
    },
  };

  return client;
};
