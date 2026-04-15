// @ts-check

/**
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { OcapnPublicKey } from '../cryptography.js'
 * @import { SturdyRef } from './sturdyrefs.js'
 * @import { Client, Connection, InternalSession, LocationId, Logger, NetLayer, NetlayerHandlers, PendingSession, SelfIdentity, Session, SessionAuthDetails, SessionManager, SocketOperations, SwissNum } from './types.js'
 */

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';
import { writeOcapnHandshakeMessage } from '../codecs/operations.js';
import {
  makeOcapnKeyPair,
  signLocation,
  publicKeyDescriptorToPublicKey,
} from '../cryptography.js';
import { makeOcapnTable as makeDefaultOcapnTable } from '../captp/ocapn-tables.js';
import { makeGrantTracker } from './grant-tracker.js';
import { makeSturdyRefTracker, enlivenSturdyRef } from './sturdyrefs.js';
import { locationToLocationId, toHex } from './util.js';
import { handleHandshakeMessageData, sendHandshake } from './handshake.js';
import { makeOcapn } from './ocapn.js';
import { makeInMemoryBaggage, provideFromBaggage } from './baggage.js';

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
/**
 * @param {object} [options]
 * @param {(session: InternalSession, resolutionOptions?: { isResume?: boolean, resumeSessionCount?: bigint }) => void} [options.onSessionResolved]
 * @returns {SessionManager}
 */
const makeSessionManager = (options = {}) => {
  const { onSessionResolved = _session => {} } = options;
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
    resolveSession: (locationId, connection, session, resolutionOptions = {}) => {
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
      onSessionResolved(session, resolutionOptions);
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
 * @param {import('./baggage.js').Baggage} [options.baggage]
 * @param {Map<string, any>} [options.swissnumTable]
 * @param {Map<string, any>} [options.giftTable]
 * @param {string} [options.captpVersion] - For testing: override the CapTP version sent in handshakes
 * @param {boolean} [options.tryResumeSession] - If true, emit op:resume-session instead of op:start-session for outgoing handshakes.
 * @param {(options: object) => import('../captp/ocapn-tables.js').OcapnTable} [options.makeOcapnTableFactory]
 * @param {(details: SessionAuthDetails) => void} [options.authenticateSession]
 * @param {boolean} [options.enableImportCollection] - If true, imports are tracked with WeakRefs and GC'd when unreachable. Default: true.
 * @param {boolean} [options.debugMode] - **EXPERIMENTAL**: If true, exposes `_debug` object on Ocapn instances with internal APIs for testing. Default: false.
 * @returns {Client}
 */
export const makeClient = (options = {}) => {
  const hasExplicitBaggage = Object.prototype.hasOwnProperty.call(
    options,
    'baggage',
  );
  const {
    debugLabel = 'ocapn',
    verbose = false,
    baggage = makeInMemoryBaggage(),
    swissnumTable,
    giftTable,
    captpVersion = '1.0',
    tryResumeSession = false,
    makeOcapnTableFactory = makeDefaultOcapnTable,
    authenticateSession = () => {},
    enableImportCollection = true,
    debugMode = false,
  } = options;
  if (tryResumeSession && !hasExplicitBaggage) {
    throw Error(
      'tryResumeSession requires an explicitly provided baggage instance',
    );
  }
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

  const resolvedSwissnumTable =
    swissnumTable ||
    provideFromBaggage(baggage, 'ocapn:swissnumTable', () => new Map());
  const resolvedGiftTable =
    giftTable || provideFromBaggage(baggage, 'ocapn:giftTable', () => new Map());

  const resumeSessionsByLocationId = provideFromBaggage(
    baggage,
    'ocapn:resumeSessionsByLocationId',
    () => new Map(),
  );
  const resumeSessionsById = provideFromBaggage(
    baggage,
    'ocapn:resumeSessionsById',
    () => new Map(),
  );
  const lookupResumeSession = sessionId => {
    const sessionIdHex = toHex(sessionId);
    const sessionRecord = resumeSessionsById.get(sessionIdHex);
    if (!sessionRecord) {
      return undefined;
    }
    const {
      peerLocation,
      peerLocationSig,
      peerPublicKeyDescriptor,
      resumeSessionCount,
    } = sessionRecord;
    return {
      peerLocation,
      peerLocationSig,
      peerPublicKey: publicKeyDescriptorToPublicKey(peerPublicKeyDescriptor),
      resumeSessionCount:
        typeof resumeSessionCount === 'bigint' ? resumeSessionCount : 0n,
    };
  };

  const sessionManager = makeSessionManager({
    onSessionResolved: (session, resolutionOptions = {}) => {
      const locationId = locationToLocationId(session.peer.location);
      const sessionIdHex = toHex(session.id);
      const { isResume = false, resumeSessionCount } = resolutionOptions;
      const nextResumeSessionCount =
        isResume && typeof resumeSessionCount === 'bigint'
          ? resumeSessionCount + 1n
          : 0n;
      resumeSessionsByLocationId.set(locationId, sessionIdHex);
      resumeSessionsById.set(sessionIdHex, {
        sessionId: session.id,
        peerLocation: session.peer.location,
        peerLocationSig: session.peer.locationSignature,
        peerPublicKeyDescriptor: session.peer.publicKey.descriptor,
        resumeSessionCount: nextResumeSessionCount,
      });
    },
  });

  /** @type {WeakMap<Connection, SelfIdentity>} */
  const connectionSelfIdentityMap = new WeakMap();
  /** @type {WeakMap<NetLayer, SelfIdentity>} */
  const netlayerToSelfIdentity = new WeakMap();

  /**
   * Get the self identity for a connection.
   * @param {Connection} connection
   * @returns {SelfIdentity}
   */
  const getSelfIdentityForConnection = connection => {
    const selfIdentity = connectionSelfIdentityMap.get(connection);
    if (!selfIdentity) {
      throw Error('Connection not found in self identity map');
    }
    return selfIdentity;
  };

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
    const selfIdentity = getSelfIdentityForConnection(connection);
    // Send handshake for outgoing connections.
    const resumeSessionIdHex =
      tryResumeSession && resumeSessionsByLocationId.get(destinationLocationId);
    const resumeSessionRecord =
      resumeSessionIdHex && resumeSessionsById.get(resumeSessionIdHex);
    if (resumeSessionRecord) {
      const resumeSessionCount =
        typeof resumeSessionRecord.resumeSessionCount === 'bigint'
          ? resumeSessionRecord.resumeSessionCount
          : 0n;
      sendHandshake(connection, selfIdentity, captpVersion, {
        opType: 'op:resume-session',
        resumeSessionId: resumeSessionRecord.sessionId,
        resumeSessionCount,
      });
    } else {
      sendHandshake(connection, selfIdentity, captpVersion);
    }
    const pendingSession = sessionManager.makePendingSession(
      destinationLocationId,
      connection,
    );
    return pendingSession.promise;
  };

  const grantTracker = makeGrantTracker();
  const sturdyRefTracker = makeSturdyRefTracker(resolvedSwissnumTable);
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
    return makeOcapn({
      logger,
      connection,
      sessionId,
      peerLocation,
      provideSession: provideInternalSession,
      getActiveSession: sessionManager.getActiveSession,
      getPeerPublicKeyForSessionId: sessionManager.getPeerPublicKeyForSessionId,
      endSession: () => {
        const activeSession = sessionManager.getActiveSession(
          locationToLocationId(peerLocation),
        );
        if (activeSession) {
          sessionManager.endSession(activeSession);
        }
      },
      grantTracker,
      giftTable: resolvedGiftTable,
      sturdyRefTracker,
      makeOcapnTable: makeOcapnTableFactory,
      ourIdLabel: debugLabel,
      enableImportCollection,
      debugMode,
    });
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
        getSelfIdentityForConnection,
        sendAbortAndClose,
        data,
        captpVersion,
        prepareOcapn,
        authenticateSession,
        lookupResumeSession,
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

  /**
   * Creates a connection for the given netlayer and socket.
   * Does not send handshake - caller is responsible for initiating handshake when appropriate.
   * @param {NetLayer} netlayer
   * @param {boolean} isOutgoing
   * @param {SocketOperations} socket
   * @returns {Connection}
   */
  const makeConnection = (netlayer, isOutgoing, socket) => {
    let isDestroyed = false;
    let selfIdentity = netlayerToSelfIdentity.get(netlayer);
    if (!selfIdentity) {
      selfIdentity = makeSelfIdentity(netlayer.location);
      netlayerToSelfIdentity.set(netlayer, selfIdentity);
    }

    /** @type {Connection} */
    const connection = harden({
      netlayer,
      isOutgoing,
      get isDestroyed() {
        return isDestroyed;
      },
      write(bytes) {
        socket.write(bytes);
      },
      end() {
        if (isDestroyed) return;
        isDestroyed = true;
        socket.end();
      },
    });

    // Store self identity for this connection
    connectionSelfIdentityMap.set(connection, selfIdentity);

    return connection;
  };

  /** @type {NetlayerHandlers} */
  const netlayerHandlers = harden({
    makeConnection,
    handleMessageData,
    handleConnectionClose,
  });

  /** @type {Client} */
  const client = {
    /**
     * Registers a netlayer by calling the provided factory with handlers and logger.
     * @template {NetLayer} T
     * @param {(handlers: NetlayerHandlers, logger: Logger) => T | Promise<T>} makeNetlayer
     * @returns {Promise<T>}
     */
    async registerNetlayer(makeNetlayer) {
      const netlayer = await makeNetlayer(netlayerHandlers, logger);
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
        resolvedSwissnumTable,
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
