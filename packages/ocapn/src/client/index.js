// @ts-check

/**
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { OcapnPublicKey } from '../cryptography.js'
 * @import { SturdyRef } from './sturdyrefs.js'
 * @import { Client, Connection, LocationId, Logger, NetLayer, PendingSession, SelfIdentity, Session, SessionManager, SwissNum } from './types.js'
 */

import { makePromiseKit } from '@endo/promise-kit';
import { writeOcapnHandshakeMessage } from '../codecs/operations.js';
import { makeOcapnKeyPair, signLocation } from '../cryptography.js';
import { makeGrantTracker } from './grant-tracker.js';
import { makeSturdyRefTracker, enlivenSturdyRef } from './sturdyrefs.js';
import { locationToLocationId, toHex } from './util.js';
import { handleHandshakeMessageData } from './handshake.js';

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
 * @param {boolean} [options.enableImportCollection] - If true, imports are tracked with WeakRefs and GC'd when unreachable. Default: true.
 * @param {boolean} [options.debugMode] - If true, exposes `debug` object on Ocapn instances with internal APIs for testing. Default: false.
 * @returns {Client}
 */
export const makeClient = ({
  debugLabel = 'ocapn',
  verbose = false,
  swissnumTable = new Map(),
  giftTable = new Map(),
  captpVersion = '1.0',
  enableImportCollection = true,
  debugMode = false,
} = {}) => {
  /** @type {Map<string, NetLayer>} */
  const netlayers = new Map();

  /** @type {Logger} */
  const logger = harden({
    log: (...args) => console.log(`${debugLabel} [${Date.now()}]:`, ...args),
    error: (...args) =>
      console.error(`${debugLabel} [${Date.now()}}:`, ...args),
    info: (...args) =>
      verbose && console.info(`${debugLabel} [${Date.now()}]:`, ...args),
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
          sendAbortAndClose,
          grantTracker,
          giftTable,
          client.sturdyRefTracker,
          data,
          captpVersion,
          enableImportCollection,
          debugMode,
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
        const locationId = locationToLocationId(session.peer.location);
        logger.info(`handling connection close for ${locationId}`);
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
