// @ts-check

/**
 * @import { OcapnLocation, OcapnPublicKeyData, OcapnSignature } from '../codecs/components.js'
 * @import { OcapnKeyPair, OcapnPublicKey } from '../cryptography.js'
 * @import { GrantTracker, Ocapn } from './ocapn.js'
 * @import { Client, Connection, LocationId, Logger, NetLayer, PendingSession, SelfIdentity, Session, SessionManager } from './types.js'
 */

import { makePromiseKit } from '@endo/promise-kit';
import { makeSyrupWriter } from '../syrup/encode.js';
import {
  readOcapnHandshakeMessage,
  writeOcapnHandshakeMessage,
} from '../codecs/operations.js';
import {
  makePublicKeyId,
  makeOcapnKeyPair,
  makeOcapnPublicKey,
  publicKeyToPublicKeyData,
  makeSessionId,
} from '../cryptography.js';
import { OcapnMyLocationCodec } from '../codecs/components.js';
import { compareByteArrays } from '../syrup/compare.js';
import { makeGrantTracker, makeOcapn } from './ocapn.js';
import { makeSyrupReader } from '../syrup/decode.js';
import { decodeSyrup } from '../syrup/js-representation.js';
import { locationToLocationId, toHex } from './util.js';

/**
 * @param {OcapnLocation} location
 * @returns {Uint8Array}
 */
const getLocationBytesForSignature = location => {
  const syrupWriter = makeSyrupWriter();
  const myLocation = {
    type: 'my-location',
    location,
  };
  OcapnMyLocationCodec.write(myLocation, syrupWriter);
  return syrupWriter.getBytes();
};

/**
 * @param {OcapnLocation} myLocation
 * @returns {SelfIdentity}
 */
export const makeSelfIdentity = myLocation => {
  const keyPair = makeOcapnKeyPair();
  const myLocationBytes = getLocationBytesForSignature(myLocation);
  const myLocationSig = keyPair.sign(myLocationBytes);
  return { keyPair, location: myLocation, locationSignature: myLocationSig };
};

/**
 * @param {object} options
 * @param {Uint8Array} options.id
 * @param {SelfIdentity} options.selfIdentity
 * @param {OcapnLocation} options.peerLocation
 * @param {OcapnPublicKey} options.peerPublicKey
 * @param {OcapnSignature} options.peerLocationSig
 * @param {Ocapn} options.ocapn
 * @param {Connection} options.connection
 * @returns {Session}
 */
const makeSession = ({
  id,
  selfIdentity,
  peerLocation,
  peerPublicKey,
  peerLocationSig,
  ocapn,
  connection,
}) => {
  const { keyPair, location, locationSignature } = selfIdentity;
  return harden({
    id,
    connection,
    ocapn,
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
  });
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
 * @param {Connection} outgoingConnection
 * @param {Connection} incommingConnection
 * @param {OcapnPublicKey} incommingPublicKey
 * @returns {{ preferredConnection: Connection, connectionToClose: Connection }}
 */
const compareSessionKeysForCrossedHellos = (
  outgoingConnection,
  incommingConnection,
  incommingPublicKey,
) => {
  const outgoingPublicKey = outgoingConnection.selfIdentity.keyPair.publicKey;
  const outgoingId = makePublicKeyId(outgoingPublicKey);
  const incommingId = makePublicKeyId(incommingPublicKey);
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
 * @param {Logger} logger
 * @param {SessionManager} sessionManager
 * @param {Connection} connection
 * @param {(location: OcapnLocation) => Promise<Session>} provideSession
 * @param {GrantTracker} grantTracker
 * @param {Map<string, any>} swissnumTable
 * @param {Map<string, any>} giftTable
 * @param {any} message
 */
const handleSessionHandshakeMessage = (
  logger,
  sessionManager,
  connection,
  provideSession,
  grantTracker,
  swissnumTable,
  giftTable,
  message,
) => {
  logger.info(`handling handshake message of type ${message.type}`);
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
      if (sessionManager.getActiveSession(locationId)) {
        // throw error
        throw Error('Active session already exists');
      }

      // Check if the location signature is valid
      const peerPublicKey = makeOcapnPublicKey(sessionPublicKey.q);
      const peerLocationBytes = getLocationBytesForSignature(peerLocation);
      const peerLocationSigValid = peerPublicKey.verify(
        peerLocationBytes,
        peerLocationSig,
      );
      // Handle invalid location signature
      if (!peerLocationSigValid) {
        logger.info('>> Server received NOT VALID location signature');
        const opAbort = {
          type: 'op:abort',
          reason: 'Invalid location signature',
        };
        const bytes = writeOcapnHandshakeMessage(opAbort);
        connection.write(bytes);
        return;
      }
      logger.info('>> Server received VALID location signature');

      // Check for crossed hellos
      const outgoingConnection =
        sessionManager.getOutgoingConnection(locationId);
      if (
        outgoingConnection !== undefined &&
        outgoingConnection !== connection
      ) {
        const incommingConnection = connection;
        const { connectionToClose } = compareSessionKeysForCrossedHellos(
          outgoingConnection,
          incommingConnection,
          peerPublicKey,
        );
        // Close the non-preferred connection
        const opAbort = {
          type: 'op:abort',
          reason: 'Crossed hellos mitigated',
        };
        const bytes = writeOcapnHandshakeMessage(opAbort);
        connectionToClose.write(bytes);
        connectionToClose.end();
        sessionManager.deleteConnection(connectionToClose);

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
        logger.info('Server sending op:start-session');
        sendHello(connection, connection.selfIdentity);
      }

      // Create session
      const { selfIdentity } = connection;
      const selfId = makePublicKeyId(selfIdentity.keyPair.publicKey);
      const peerId = makePublicKeyId(peerPublicKey);
      const sessionId = makeSessionId(selfId, peerId);
      const ocapn = makeOcapn(
        logger,
        connection,
        sessionId,
        peerLocation,
        provideSession,
        sessionManager.getActiveSession,
        sessionManager.getPeerPublicKeyForSessionId,
        grantTracker,
        swissnumTable,
        giftTable,
        'ocapn',
      );
      const session = makeSession({
        id: sessionId,
        selfIdentity,
        peerLocation,
        peerPublicKey,
        peerLocationSig,
        ocapn,
        connection,
      });
      logger.info(`session established`);
      sessionManager.resolveSession(locationId, connection, session);

      break;
    }

    case 'op:abort': {
      logger.info('Server received op:abort', message.reason);
      connection.end();
      sessionManager.deleteConnection(connection);
      break;
    }

    default: {
      throw Error(`Unknown message type: ${message.type}`);
    }
  }
};

/**
 * @param {Logger} logger
 * @param {SessionManager} sessionManager
 * @param {Connection} connection
 * @param {(location: OcapnLocation) => Promise<Session>} provideSession
 * @param {GrantTracker} grantTracker
 * @param {Map<string, any>} swissnumTable
 * @param {Map<string, any>} giftTable
 * @param {Uint8Array} data
 */
const handleHandshakeMessageData = (
  logger,
  sessionManager,
  connection,
  provideSession,
  grantTracker,
  swissnumTable,
  giftTable,
  data,
) => {
  try {
    const syrupReader = makeSyrupReader(data);
    while (syrupReader.index < data.length) {
      const start = syrupReader.index;
      let message;
      try {
        message = readOcapnHandshakeMessage(syrupReader);
      } catch (err) {
        const problematicBytes = data.slice(start);
        const syrupMessage = decodeSyrup(problematicBytes);
        logger.error(
          `Message decode error:`,
          err,
          'while reading',
          syrupMessage,
        );
        connection.end();
        throw err;
      }
      if (!connection.isDestroyed) {
        handleSessionHandshakeMessage(
          logger,
          sessionManager,
          connection,
          provideSession,
          grantTracker,
          swissnumTable,
          giftTable,
          message,
        );
      } else {
        logger.info(
          'Server received message after connection was destroyed',
          message,
        );
      }
    }
  } catch (err) {
    logger.error(`Server error:`, err);
    connection.end();
    throw err;
  }
};

/**
 * @returns {SessionManager}
 */
const makeSessionManager = () => {
  /** @type {Map<LocationId, Session>} */
  const activeSessions = new Map();
  /** @type {Map<LocationId, PendingSession>} */
  const pendingSessions = new Map();
  /** @type {Map<Connection, Session>} */
  const connectionToSession = new Map();
  /** @type {Map<string, OcapnPublicKey>} */
  const sessionIdToPeerPublicKey = new Map();

  /** @type {SessionManager} */
  return harden({
    getActiveSession: locationId => activeSessions.get(locationId),
    getOutgoingConnection: locationId => {
      const pendingSession = pendingSessions.get(locationId);
      if (pendingSession === undefined) {
        return undefined;
      }
      return pendingSession.outgoingConnection;
    },
    getSessionForConnection: connection => {
      return connectionToSession.get(connection);
    },
    deleteConnection: connection => {
      connectionToSession.delete(connection);
    },
    getPendingSessionPromise: locationId => {
      const pendingSession = pendingSessions.get(locationId);
      if (pendingSession === undefined) {
        return undefined;
      }
      return pendingSession.promise;
    },
    resolveSession: (locationId, connection, session) => {
      if (activeSessions.has(locationId)) {
        throw Error(
          `Unable to resolve session for ${locationId}. Active session already exists.`,
        );
      }
      activeSessions.set(locationId, session);
      connectionToSession.set(connection, session);
      sessionIdToPeerPublicKey.set(toHex(session.id), session.peer.publicKey);
      const pendingSession = pendingSessions.get(locationId);
      if (pendingSession !== undefined) {
        pendingSession.resolve(session);
        pendingSessions.delete(locationId);
      }
    },
    endSession: session => {
      const locationId = locationToLocationId(session.peer.location);
      const pendingSession = pendingSessions.get(locationId);
      if (pendingSession !== undefined) {
        pendingSession.reject(Error('Session ended.'));
        pendingSessions.delete(locationId);
      }
      activeSessions.delete(locationId);
      connectionToSession.delete(session.connection);
    },
    makePendingSession: (locationId, outgoingConnection) => {
      if (activeSessions.has(locationId)) {
        throw Error(
          `Active session for location already exists: ${locationId}`,
        );
      }
      if (pendingSessions.has(locationId)) {
        throw Error(
          `Pending session for location already exists: ${locationId}`,
        );
      }
      const { promise, resolve, reject } = makePromiseKit();
      /** @type {PendingSession} */
      const pendingSession = harden({
        outgoingConnection,
        promise,
        resolve,
        reject,
      });
      pendingSessions.set(locationId, pendingSession);
      return pendingSession;
    },
    getPeerPublicKeyForSessionId: sessionId => {
      return sessionIdToPeerPublicKey.get(toHex(sessionId));
    },
  });
};

/**
 * @param {object} [options]
 * @param {string} [options.debugLabel]
 * @param {boolean} [options.verbose]
 * @param {Map<string, any>} [options.swissnumTable]
 * @param {Map<string, any>} [options.giftTable]
 * @returns {Client}
 */
export const makeClient = ({
  debugLabel = 'ocapn',
  verbose = false,
  swissnumTable = new Map(),
  giftTable = new Map(),
} = {}) => {
  /** @type {Map<string, NetLayer>} */
  const netlayers = new Map();

  /** @type {Logger} */
  const logger = harden({
    log: (...args) => console.log(`${debugLabel}:`, ...args),
    error: (...args) => console.error(`${debugLabel}:`, ...args),
    info: (...args) => verbose && console.info(`${debugLabel}:`, ...args),
  });

  const sessionManager = makeSessionManager();

  /**
   * @param {OcapnLocation} location
   * @returns {Promise<Session>}
   * Establishes a new session but initiating a connection.
   */
  const establishSession = location => {
    const netlayer = netlayers.get(location.transport);
    if (!netlayer) {
      throw Error(
        `Netlayer not registered for transport: ${location.transport}`,
      );
    }
    const connection = netlayer.connect(location);
    const locationId = locationToLocationId(location);
    const pendingSession = sessionManager.makePendingSession(
      locationId,
      connection,
    );
    return pendingSession.promise;
  };

  const grantTracker = makeGrantTracker();

  /** @type {Client} */
  const client = {
    debugLabel,
    logger,
    grantTracker,
    sessionManager,
    swissnumTable,
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
      const session = sessionManager.getSessionForConnection(connection);
      if (session) {
        session.ocapn.dispatchMessageData(data);
      } else {
        handleHandshakeMessageData(
          logger,
          sessionManager,
          connection,
          client.provideSession,
          grantTracker,
          swissnumTable,
          giftTable,
          data,
        );
      }
    },
    /**
     * @param {Connection} connection
     * @param {Error} reason
     */
    handleConnectionClose(connection, reason) {
      client.logger.info(`handleConnectionClose called`, { reason });
      const session = sessionManager.getSessionForConnection(connection);
      if (session) {
        session.ocapn.abort(reason);
        sessionManager.endSession(session);
      }
      sessionManager.deleteConnection(connection);
    },
    /**
     * @param {OcapnLocation} location
     * @returns {Promise<Session>}
     */
    provideSession(location) {
      client.logger.info(`provideSession called with`, { location });
      const locationId = locationToLocationId(location);
      // Get existing session.
      const activeSession = sessionManager.getActiveSession(locationId);
      if (activeSession) {
        return Promise.resolve(activeSession);
      }
      // Get existing pending session.
      const pendingSession =
        sessionManager.getPendingSessionPromise(locationId);
      if (pendingSession) {
        return pendingSession;
      }
      // Connect and establish a new session.
      const newSessionPromise = establishSession(location);
      return newSessionPromise;
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
