// @ts-check

/**
 * @import { OcapnLocation, OcapnSignature } from '../codecs/components.js'
 * @import { OcapnPublicKey } from '../cryptography.js'
 * @import { Ocapn } from './ocapn.js'
 * @import { GrantTracker } from './grant-tracker.js'
 * @import { SturdyRef, SturdyRefTracker } from './sturdyrefs.js'
 * @import { Client, Connection, LocationId, Logger, NetLayer, PendingSession, SelfIdentity, Session, SessionManager } from './types.js'
 */

import { makePromiseKit } from '@endo/promise-kit';
import {
  readOcapnHandshakeMessage,
  writeOcapnHandshakeMessage,
} from '../codecs/operations.js';
import {
  makeOcapnKeyPair,
  makeOcapnPublicKey,
  makeSessionId,
  signLocation,
  verifyLocationSignature,
} from '../cryptography.js';
import { compareImmutableArrayBuffers } from '../syrup/compare.js';
import { makeOcapn } from './ocapn.js';
import { makeGrantTracker } from './grant-tracker.js';
import { makeSyrupReader } from '../syrup/decode.js';
import { decodeSyrup } from '../syrup/js-representation.js';
import { makeSturdyRefTracker, enlivenSturdyRef } from './sturdyrefs.js';
import { locationToLocationId, toHex } from './util.js';

/**
 * @param {OcapnLocation} myLocation
 * @returns {SelfIdentity}
 */
export const makeSelfIdentity = myLocation => {
  const keyPair = makeOcapnKeyPair();
  const myLocationSig = signLocation(myLocation, keyPair);
  return { keyPair, location: myLocation, locationSignature: myLocationSig };
};

/**
 * @import { SessionId, SwissNum } from './types.js'
 */

/**
 * @param {object} options
 * @param {SessionId} options.id
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
  let nextHandoffCount = 0n;
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
    getHandoffCount: () => {
      return nextHandoffCount;
    },
    takeNextHandoffCount: () => {
      const current = nextHandoffCount;
      nextHandoffCount += 1n;
      return current;
    },
  });
};

/**
 * @param {Connection} connection
 * @param {SelfIdentity} selfIdentity
 * @param {string} captpVersion
 */
export const sendHello = (connection, selfIdentity, captpVersion) => {
  const { keyPair, location, locationSignature } = selfIdentity;
  const opStartSession = {
    type: 'op:start-session',
    captpVersion,
    sessionPublicKey: keyPair.publicKey.descriptor,
    location,
    locationSignature,
  };
  const bytes = writeOcapnHandshakeMessage(opStartSession);
  connection.write(bytes);
};

/**
 * @param {Connection} connection
 * @param {string} [reason]
 */
const sendAbortAndClose = (connection, reason = 'unknown reason') => {
  const opAbort = {
    type: 'op:abort',
    reason,
  };
  const bytes = writeOcapnHandshakeMessage(opAbort);
  connection.write(bytes);
  connection.end();
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
  const outgoingId = outgoingPublicKey.id;
  const incommingId = incommingPublicKey.id;
  const result = compareImmutableArrayBuffers(outgoingId, incommingId);
  const [preferredConnection, connectionToClose] =
    result > 0
      ? [outgoingConnection, incommingConnection]
      : [incommingConnection, outgoingConnection];
  return { preferredConnection, connectionToClose };
};

/**
 * @param {string} debugLabel
 * @param {Logger} logger
 * @param {SessionManager} sessionManager
 * @param {Connection} connection
 * @param {(location: OcapnLocation) => Promise<Session>} provideSession
 * @param {GrantTracker} grantTracker
 * @param {Map<string, any>} giftTable
 * @param {SturdyRefTracker} sturdyRefTracker
 * @param {any} message
 * @param {string} captpVersion
 */
const handleSessionHandshakeMessage = (
  debugLabel,
  logger,
  sessionManager,
  connection,
  provideSession,
  grantTracker,
  giftTable,
  sturdyRefTracker,
  message,
  captpVersion,
) => {
  logger.info(`handling handshake message of type ${message.type}`);
  switch (message.type) {
    case 'op:start-session': {
      const {
        captpVersion: messageCaptpVersion,
        sessionPublicKey,
        location: peerLocation,
        locationSignature: peerLocationSig,
      } = message;
      // Handle invalid version
      if (messageCaptpVersion !== captpVersion) {
        // send op abort
        logger.info(`Abort during start-session message with invalid version`);
        sendAbortAndClose(connection, 'invalid-version');
        sessionManager.deleteConnection(connection);
        return;
      }
      const locationId = locationToLocationId(peerLocation);
      if (sessionManager.getActiveSession(locationId)) {
        // throw error
        throw Error('Active session already exists');
      }

      // Check if the location signature is valid
      const peerPublicKey = makeOcapnPublicKey(sessionPublicKey.q);
      const peerLocationSigValid = verifyLocationSignature(
        peerLocation,
        peerLocationSig,
        peerPublicKey,
      );
      // Handle invalid location signature
      if (!peerLocationSigValid) {
        logger.info('>> Server received NOT VALID location signature');
        sendAbortAndClose(connection, 'Invalid location signature');
        sessionManager.deleteConnection(connection);
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
        sendAbortAndClose(connectionToClose, 'Crossed hellos mitigated');
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
        sendHello(connection, connection.selfIdentity, captpVersion);
      }

      // Create session
      const { selfIdentity } = connection;
      const sessionId = makeSessionId(
        selfIdentity.keyPair.publicKey.id,
        peerPublicKey.id,
      );
      const ocapn = makeOcapn(
        logger,
        connection,
        sessionId,
        peerLocation,
        provideSession,
        sessionManager.getActiveSession,
        sessionManager.getPeerPublicKeyForSessionId,
        grantTracker,
        giftTable,
        sturdyRefTracker,
        debugLabel,
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
 * @param {string} debugLabel
 * @param {Logger} logger
 * @param {SessionManager} sessionManager
 * @param {Connection} connection
 * @param {(location: OcapnLocation) => Promise<Session>} provideSession
 * @param {GrantTracker} grantTracker
 * @param {Map<string, any>} giftTable
 * @param {SturdyRefTracker} sturdyRefTracker
 * @param {Uint8Array} data
 * @param {string} captpVersion
 */
const handleHandshakeMessageData = (
  debugLabel,
  logger,
  sessionManager,
  connection,
  provideSession,
  grantTracker,
  giftTable,
  sturdyRefTracker,
  data,
  captpVersion,
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
        throw err;
      }
      if (!connection.isDestroyed) {
        handleSessionHandshakeMessage(
          debugLabel,
          logger,
          sessionManager,
          connection,
          provideSession,
          grantTracker,
          giftTable,
          sturdyRefTracker,
          message,
          captpVersion,
        );
      } else {
        logger.info(
          'Server received message after connection was destroyed',
          message,
        );
      }
    }
  } catch (err) {
    logger.error(`Unexpected error whiler processing handshake message:`, err);
    sendAbortAndClose(connection, 'internal error');
    sessionManager.deleteConnection(connection);
  }
};

/**
 * @param {Logger} logger
 * @param {SessionManager} sessionManager
 * @param {Connection} connection
 * @param {Session} session
 * @param {Uint8Array} data
 */
const handleActiveSessionMessageData = (
  logger,
  sessionManager,
  connection,
  session,
  data,
) => {
  try {
    session.ocapn.dispatchMessageData(data);
  } catch (err) {
    logger.error(
      `Unexpected error while processing active session message:`,
      err,
    );
    sendAbortAndClose(connection, 'internal error');
    sessionManager.endSession(session);
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
    rejectPendingSessionForConnection: connection => {
      // Find and reject any pending session that matches this outgoing connection
      for (const [locationId, pendingSession] of pendingSessions.entries()) {
        if (pendingSession.outgoingConnection === connection) {
          pendingSession.reject(Error('Connection closed during handshake.'));
          pendingSessions.delete(locationId);
          return true;
        }
      }
      return false;
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
 * @param {string} [options.captpVersion] - For testing: override the CapTP version sent in handshakes
 * @returns {Client}
 */
export const makeClient = ({
  debugLabel = 'ocapn',
  verbose = false,
  swissnumTable = new Map(),
  giftTable = new Map(),
  captpVersion = '1.0',
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
    const destinationLocationId = locationToLocationId(location);
    if (destinationLocationId === netlayer.locationId) {
      throw Error('Refusing to connect to self');
    }
    const connection = netlayer.connect(location);
    const pendingSession = sessionManager.makePendingSession(
      destinationLocationId,
      connection,
    );
    return pendingSession.promise;
  };

  const grantTracker = makeGrantTracker();

  /**
   * Check if a location matches one of our own netlayers (self-location)
   * @param {OcapnLocation} location
   * @returns {boolean}
   */
  const isSelfLocation = location => {
    const locationId = locationToLocationId(location);
    for (const netlayer of netlayers.values()) {
      if (netlayer.locationId === locationId) {
        return true;
      }
    }
    return false;
  };

  /** @type {Client} */
  const client = harden({
    captpVersion,
    debugLabel,
    logger,
    grantTracker,
    sessionManager,
    sturdyRefTracker: makeSturdyRefTracker(swissnumTable),
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
        handleActiveSessionMessageData(
          logger,
          sessionManager,
          connection,
          session,
          data,
        );
      } else {
        handleHandshakeMessageData(
          debugLabel,
          logger,
          sessionManager,
          connection,
          client.provideSession,
          grantTracker,
          giftTable,
          client.sturdyRefTracker,
          data,
          captpVersion,
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
      } else {
        // If no session exists, check if there's a pending session for this connection
        sessionManager.rejectPendingSessionForConnection(connection);
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
        client.logger.info(`provideSession returning existing session`);
        return Promise.resolve(activeSession);
      }
      // Get existing pending session.
      const pendingSession =
        sessionManager.getPendingSessionPromise(locationId);
      if (pendingSession) {
        client.logger.info(`provideSession returning existing pending session`);
        return pendingSession;
      }
      // Connect and establish a new session.
      client.logger.info(
        `provideSession connecting and establishing new session`,
      );
      const newSessionPromise = establishSession(location);
      return newSessionPromise;
    },
    /**
     * Create a SturdyRef object
     * @param {OcapnLocation} location
     * @param {SwissNum} swissNum
     * @returns {SturdyRef}
     */
    makeSturdyRef(location, swissNum) {
      return client.sturdyRefTracker.makeSturdyRef(location, swissNum);
    },
    /**
     * Enliven a SturdyRef by fetching the actual object
     * @param {SturdyRef} sturdyRef
     * @returns {Promise<any>}
     */
    enlivenSturdyRef(sturdyRef) {
      return enlivenSturdyRef(
        sturdyRef,
        location => client.provideSession(location),
        isSelfLocation,
        swissnumTable,
      );
    },
    shutdown() {
      client.logger.info(`shutdown called`);
      for (const netlayer of netlayers.values()) {
        netlayer.shutdown();
      }
    },
  });

  return client;
};
