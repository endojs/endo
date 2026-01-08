// @ts-check

/**
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { OcapnPublicKey } from '../cryptography.js'
 * @import { SturdyRef } from './sturdyrefs.js'
 * @import { Client, Connection, InternalSession, LocationId, Logger, NetLayer, NetlayerHandlers, PendingSession, SelfIdentity, Session, SessionManager, SwissNum } from './types.js'
 */

import { makePromiseKit } from '@endo/promise-kit';
import { writeOcapnHandshakeMessage } from '../codecs/operations.js';
import { makeOcapnKeyPair, signLocation } from '../cryptography.js';
import { makeGrantTracker } from './grant-tracker.js';
import { makeSturdyRefTracker, enlivenSturdyRef } from './sturdyrefs.js';
import { locationToLocationId, toHex } from './util.js';
import { handleHandshakeMessageData } from './handshake.js';
import { makeOcapn } from './ocapn.js';

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
 * @param {InternalSession} session
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
  /** @type {Map<LocationId, InternalSession>} */
  const activeSessions = new Map();
  /** @type {Map<LocationId, PendingSession>} */
  const pendingSessions = new Map();
  /** @type {Map<Connection, InternalSession>} */
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
 * @param {boolean} [options.debugMode] - **EXPERIMENTAL**: If true, exposes `_debug` object on Ocapn instances with internal APIs for testing. Default: false.
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
   * @returns {Promise<InternalSession>}
   * Establishes a new session by initiating a connection.
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
  const sturdyRefTracker = makeSturdyRefTracker(swissnumTable);
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

  /**
   * Internal function to provide full session (used internally and for debug).
   * @param {OcapnLocation} location
   * @returns {Promise<InternalSession>}
   */
  const provideInternalSession = location => {
    logger.info(`provideInternalSession called with`, { location });
    const locationId = locationToLocationId(location);
    // Get existing session.
    const activeSession = sessionManager.getActiveSession(locationId);
    if (activeSession) {
      logger.info(`provideInternalSession returning existing session`);
      return Promise.resolve(activeSession);
    }
    // Get existing pending session.
    const pendingSession = sessionManager.getPendingSessionPromise(locationId);
    if (pendingSession) {
      logger.info(`provideInternalSession returning existing pending session`);
      return pendingSession;
    }
    // Connect and establish a new session.
    logger.info(
      `provideInternalSession connecting and establishing new session`,
    );
    const newSessionPromise = establishSession(location);
    return newSessionPromise;
  };

  const prepareOcapn = (connection, sessionId, peerLocation) => {
    return makeOcapn(
      logger,
      connection,
      sessionId,
      peerLocation,
      provideInternalSession,
      sessionManager.getActiveSession,
      sessionManager.getPeerPublicKeyForSessionId,
      () => {
        const activeSession = sessionManager.getActiveSession(
          locationToLocationId(peerLocation),
        );
        if (activeSession) {
          sessionManager.endSession(activeSession);
        }
      },
      grantTracker,
      giftTable,
      sturdyRefTracker,
      debugLabel,
      enableImportCollection,
      debugMode,
    );
  };

  /**
   * Internal handler for incoming message data from a connection.
   * @param {Connection} connection
   * @param {Uint8Array} data
   */
  const handleMessageData = (connection, data) => {
    logger.info(`handleMessageData called`);
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
        logger,
        sessionManager,
        connection,
        sendAbortAndClose,
        data,
        captpVersion,
        prepareOcapn,
      );
    }
  };

  /**
   * Internal handler for connection close events.
   * @param {Connection} connection
   * @param {Error} [reason]
   */
  const handleConnectionClose = (connection, reason) => {
    logger.info(`handleConnectionClose called`, { reason });
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
  };

  /** @type {NetlayerHandlers} */
  const netlayerHandlers = harden({
    handleMessageData,
    handleConnectionClose,
  });

  /** @type {Client} */
  const client = {
    /**
     * Registers a netlayer by calling the provided factory with handlers, logger, and captpVersion.
     * @template {NetLayer} T
     * @param {(handlers: NetlayerHandlers, logger: Logger, captpVersion: string) => T | Promise<T>} makeNetlayer
     * @returns {Promise<T>}
     */
    async registerNetlayer(makeNetlayer) {
      const netlayer = await makeNetlayer(
        netlayerHandlers,
        logger,
        captpVersion,
      );
      const { transport } = netlayer.location;
      if (netlayers.has(transport)) {
        throw Error(`Netlayer already registered for transport: ${transport}`);
      }
      netlayers.set(transport, netlayer);
      return netlayer;
    },
    /**
     * @param {OcapnLocation} location
     * @returns {Promise<Session>}
     */
    async provideSession(location) {
      const internalSession = await provideInternalSession(location);
      /** @type {Session} */
      const session = harden({
        getBootstrap: () => internalSession.ocapn.getRemoteBootstrap(),
        abort: reason => internalSession.ocapn.abort(reason),
      });
      return session;
    },
    /**
     * Create a SturdyRef object
     * @param {OcapnLocation} location
     * @param {SwissNum} swissNum
     * @returns {SturdyRef}
     */
    makeSturdyRef(location, swissNum) {
      return sturdyRefTracker.makeSturdyRef(location, swissNum);
    },
    /**
     * Enliven a SturdyRef by fetching the actual object
     * @param {SturdyRef} sturdyRef
     * @returns {Promise<any>}
     */
    enlivenSturdyRef(sturdyRef) {
      return enlivenSturdyRef(
        sturdyRef,
        provideInternalSession,
        isSelfLocation,
        swissnumTable,
      );
    },
    /**
     * Register an object with a swissnum string so it can be resolved via SturdyRef.
     * @param {string} swissStr
     * @param {any} object
     */
    registerSturdyRef(swissStr, object) {
      sturdyRefTracker.register(swissStr, object);
    },
    shutdown() {
      logger.info(`shutdown called`);
      for (const netlayer of netlayers.values()) {
        netlayer.shutdown();
      }
    },
  };

  if (debugMode) {
    // eslint-disable-next-line no-underscore-dangle
    client._debug = {
      logger,
      debugLabel,
      captpVersion,
      grantTracker,
      sessionManager,
      sturdyRefTracker,
      provideInternalSession,
    };
  }

  return harden(client);
};
