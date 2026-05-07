// @ts-check

/**
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { OcapnPublicKey } from '../cryptography.js'
 * @import { OcapnCodec } from '../codec-interface.js'
 * @import { SturdyRef } from './sturdyrefs.js'
 * @import { Client, Connection, InternalSession, LocationId, Logger, NetLayer, NetlayerHandlers, NetworkSession, NonceLocator, OcapnNetwork, PendingSession, SelfIdentity, Session, SessionManager, SocketOperations, SwissNum } from './types.js'
 */

import harden from '@endo/harden';
import { makePromiseKit } from '@endo/promise-kit';
import { writeOcapnHandshakeMessage } from '../codecs/operations.js';
import { makeCryptography } from '../cryptography.js';
import { makeGrantTracker } from './grant-tracker.js';
import { makeSturdyRefTracker, enlivenSturdyRef } from './sturdyrefs.js';
import { locationToLocationId, toHex } from './util.js';
import {
  handleHandshakeMessageData,
  makeSession,
  sendHandshake,
} from './handshake.js';
import { makeOcapn as makeOcapnCore } from './ocapn.js';

/**
 * @param {Logger} logger
 * @param {SessionManager} sessionManager
 * @param {Connection} connection
 * @param {InternalSession} session
 * @param {Uint8Array} data
 * @param {(connection: Connection, reason?: string) => void} sendAbortAndClose
 */
const handleActiveSessionMessageData = (
  logger,
  sessionManager,
  connection,
  session,
  data,
  sendAbortAndClose,
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
 * @typedef {NetLayer | OcapnNetwork} AnyNetwork
 * @typedef {((handlers: NetlayerHandlers, logger: Logger) => AnyNetwork | Promise<AnyNetwork>)} NetworkFactory
 */

/**
 * @typedef {object} MakeOcapnAsyncResult
 * @property {Client} ocapn
 * @property {AnyNetwork} network
 */

/**
 * Construct an OCapN session manager against a chosen codec and a
 * single network. Both are pluggable (so you can experiment with
 * different codecs and networks, and compare them across dimensions
 * like performance), but fixed for the life of this instance: OCapN
 * makes no attempt to negotiate either on the wire, and session
 * identity is computed against canonical codec bytes.
 *
 * The `locator` is the caller-owned table of locally-held
 * capabilities. A plain `Map` works; anything with a
 * `get(secret) → value | Promise<value> | undefined` does too. When a
 * peer asks for a local capability via `bootstrap.fetch(secret)`, the
 * client calls `locator.get(secret)` and hands the result (or an
 * error, if `undefined`) back to the peer.
 *
 * `network` may be either a pre-built network object or a factory
 * `(handlers, logger) => network`. Legacy NetLayers need the handlers
 * at construction time and use the factory form; `OcapnNetwork`-style
 * networks (Noise) typically don't.
 *
 * @param {object} options
 * @param {OcapnCodec} options.codec
 * @param {AnyNetwork | NetworkFactory} options.network
 * @param {NonceLocator} [options.locator]
 * @param {string} [options.debugLabel]
 * @param {boolean} [options.verbose]
 * @param {Map<string, any>} [options.giftTable]
 * @param {string} [options.captpVersion] - For testing: override the CapTP version sent in handshakes
 * @param {boolean} [options.enableImportCollection] - If true, imports are tracked with WeakRefs and GC'd when unreachable. Default: true.
 * @param {boolean} [options.debugMode] - **EXPERIMENTAL**: If true, exposes `_debug` object on Ocapn instances with internal APIs for testing. Default: false.
 * @param {Logger} [options.logger] - If provided, overrides the default console-based logger. When omitted, defaults to a console-based logger labelled with `debugLabel`; `info` is suppressed unless `verbose` is true.
 * @returns {Promise<Client>}
 */
export const makeOcapn = async ({
  codec,
  network: networkArg,
  locator = new Map(),
  debugLabel = 'ocapn',
  verbose = false,
  giftTable = new Map(),
  captpVersion = '1.0',
  enableImportCollection = true,
  debugMode = false,
  logger: providedLogger,
}) => {
  if (!codec) {
    throw Error(
      'makeOcapn: `codec` is required (import one of `cborCodec` from `@endo/ocapn/cbor` or `syrupCodec` from `@endo/ocapn/syrup`)',
    );
  }
  if (!networkArg) {
    throw Error(
      'makeOcapn: `network` is required (pass an `OcapnNoiseNetwork` from `@endo/ocapn-noise`, or a legacy `NetLayer`)',
    );
  }
  const cryptography = makeCryptography(codec);

  /**
   * @param {OcapnLocation} myLocation
   * @returns {SelfIdentity}
   */
  const makeSelfIdentity = myLocation => {
    const keyPair = cryptography.makeOcapnKeyPair();
    // tcp-testing-only does not have a Noise transcript hash to bind
    // against; sign with an empty channel-binding value.  The np
    // netlayer mints its own per-session SelfIdentity that binds to
    // the Noise handshake hash instead.
    const myLocationSig = cryptography.signLocation(
      myLocation,
      keyPair,
      new ArrayBuffer(0),
    );
    return {
      keyPair,
      location: myLocation,
      locationSignature: myLocationSig,
    };
  };

  /**
   * @param {Connection} connection
   * @param {string} [reason]
   */
  const sendAbortAndClose = (connection, reason = 'unknown reason') => {
    const opAbort = { type: 'op:abort', reason };
    const bytes = writeOcapnHandshakeMessage(opAbort, codec);
    connection.write(bytes);
    connection.end();
  };

  /** @type {Logger} */
  const logger =
    providedLogger ||
    harden({
      log: (...args) => console.log(`${debugLabel} [${Date.now()}]:`, ...args),
      error: (...args) =>
        console.error(`${debugLabel} [${Date.now()}]:`, ...args),
      info: (...args) =>
        verbose && console.info(`${debugLabel} [${Date.now()}]:`, ...args),
    });

  const sessionManager = makeSessionManager();

  /**
   * The resolved network. Assigned exactly once, after any factory is
   * called with `netlayerHandlers` and the logger. All closures below
   * reference this `let` binding; no method on the returned `Client`
   * runs before assignment, so use-before-assign is not observable.
   * @type {AnyNetwork}
   */
  let network;

  /** @type {WeakMap<Connection, SelfIdentity>} */
  const connectionSelfIdentityMap = new WeakMap();

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
  /**
   * Create an InternalSession from a network-provided NetworkSession.
   *
   * This bridges the OcapnNetwork.provideSession() path to the
   * existing session infrastructure.  The network has already
   * authenticated the peer; we wrap its write/close into a
   * synthetic Connection and set up CapTP over it.
   *
   * @param {NetworkSession} networkSession
   * @param {NetLayer | OcapnNetwork} netlayer
   * @returns {InternalSession}
   */
  const makeInternalSessionFromNetwork = (networkSession, netlayer) => {
    let isDestroyed = false;
    const netlayerForConnection = /** @type {NetLayer} */ (netlayer);
    /** @type {Connection} */
    const connection = harden({
      netlayer: netlayerForConnection,
      isOutgoing: networkSession.isInitiator,
      get isDestroyed() {
        return isDestroyed;
      },
      write(bytes) {
        // Fire-and-forget: the network's writer returns a promise but
        // the Connection.write contract is synchronous. Errors are
        // handled by the reader pump below (end-of-stream → endSession).
        Promise.resolve(networkSession.writer.next(bytes)).catch(() => {});
      },
      end() {
        if (isDestroyed) return;
        isDestroyed = true;
        networkSession.close();
      },
    });

    const { selfIdentity } = networkSession;
    connectionSelfIdentityMap.set(connection, selfIdentity);

    const peerPublicKey = cryptography.makeOcapnPublicKey(
      networkSession.remotePublicKeyBytes,
    );
    const peerLocation = networkSession.remoteLocation;
    const peerLocationSig = networkSession.remoteLocationSignature;

    // eslint-disable-next-line no-use-before-define
    const ocapn = prepareOcapn(
      connection,
      networkSession.sessionId,
      peerLocation,
    );

    const internalSession = makeSession({
      id: networkSession.sessionId,
      selfIdentity,
      peerLocation,
      peerPublicKey,
      peerLocationSig,
      ocapn,
      connection,
    });

    // Pump the network's plaintext reader into the CapTP dispatcher.
    // Each `reader.next()` yields one whole OCapN frame that the
    // network has already framed/decrypted.
    const runPump = async () => {
      await null;
      try {
        for (;;) {
          // eslint-disable-next-line no-await-in-loop
          const result = await networkSession.reader.next(undefined);
          if (result.done) break;
          if (isDestroyed) break;
          try {
            ocapn.dispatchMessageData(result.value);
          } catch (err) {
            logger.error(`CapTP dispatch failed`, err);
            // Mirror handleActiveSessionMessageData: notify the peer
            // with op:abort before tearing the session down, instead
            // of letting them stare at a quiet half-closed socket.
            try {
              sendAbortAndClose(connection, 'internal error');
            } catch (_e) {
              // ignore secondary failures during teardown
            }
            break;
          }
        }
      } finally {
        if (!isDestroyed) {
          isDestroyed = true;
          sessionManager.endSession(internalSession);
        }
      }
    };
    runPump();

    return internalSession;
  };

  const establishSession = async location => {
    const destinationLocationId = locationToLocationId(location);
    if (destinationLocationId === network.locationId) {
      throw Error('Refusing to connect to self');
    }

    // Networks that manage their own full session lifecycle (connect,
    // authenticate, encrypt) short-circuit the handshake machinery.
    const asNetwork = /** @type {OcapnNetwork} */ (network);
    if (asNetwork.provideSession) {
      const networkSession = await asNetwork.provideSession(location);
      const session = makeInternalSessionFromNetwork(networkSession, network);
      sessionManager.resolveSession(
        destinationLocationId,
        session.connection,
        session,
      );
      return Promise.resolve(session);
    }

    const asNetlayer = /** @type {NetLayer} */ (network);
    if (!asNetlayer.connect) {
      throw Error(
        'ocapn: network must implement `connect` or `provideSession`',
      );
    }
    // `OcapnNetwork.connect` may be async; legacy `NetLayer.connect` is
    // sync. Only `await` when actually async, so the synchronous path
    // registers its pending session without an intervening microtask.
    const connectResult = asNetlayer.connect(location);
    const connection =
      connectResult instanceof Promise ? await connectResult : connectResult;
    const selfIdentity = getSelfIdentityForConnection(connection);
    // Networks that customize their handshake (e.g. a Noise-based
    // network) own the send path; otherwise fall back to
    // `op:start-session`.
    if (asNetwork.sendSessionHandshake) {
      asNetwork.sendSessionHandshake(
        connection,
        captpVersion,
        selfIdentity,
        codec,
      );
    } else {
      sendHandshake(connection, selfIdentity, captpVersion, codec);
    }
    const pendingSession = sessionManager.makePendingSession(
      destinationLocationId,
      connection,
    );
    return pendingSession.promise;
  };

  const grantTracker = makeGrantTracker();
  const sturdyRefTracker = makeSturdyRefTracker(locator);

  /**
   * Check whether a location refers to this instance (as opposed to
   * another peer).
   *
   * @param {OcapnLocation} location
   * @returns {boolean}
   */
  const isSelfLocation = location => {
    const locationId = locationToLocationId(location);
    return network.locationId === locationId;
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
    return makeOcapnCore(
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
      codec,
      cryptography,
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
        sendAbortAndClose,
      );
    } else {
      // Let the connection's network intercept handshake bytes first if it
      // implements its own session negotiation.
      const connectionNetwork =
        /** @type {OcapnNetwork & NetLayer | undefined} */ (
          connection.netlayer
        );
      if (connectionNetwork && connectionNetwork.handleSessionHandshake) {
        const selfIdentity = getSelfIdentityForConnection(connection);
        const handled = connectionNetwork.handleSessionHandshake(
          connection,
          data,
          selfIdentity,
          captpVersion,
        );
        if (handled) return;
      }
      // Fall back to the default op:start-session handshake.
      handleHandshakeMessageData(
        logger,
        sessionManager,
        connection,
        getSelfIdentityForConnection,
        sendAbortAndClose,
        data,
        captpVersion,
        prepareOcapn,
        codec,
        cryptography,
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
    // The underlying socket has closed, so the connection is no longer
    // usable regardless of how it got here (graceful op:abort, error,
    // remote RST, etc). Marking it destroyed here is idempotent and
    // ensures `connection.isDestroyed` is always true once the socket
    // is gone, even when a netlayer fires close without an intervening
    // userland call to connection.end().
    connection.end();
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
    const selfIdentity = makeSelfIdentity(netlayer.location);

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

  // Resolve the network: either use the object directly, or invoke the
  // factory now that `netlayerHandlers` is ready. Legacy NetLayers
  // (e.g. `tcp-testing-only`) rely on the factory form.
  network =
    typeof networkArg === 'function'
      ? await /** @type {NetworkFactory} */ (networkArg)(
          netlayerHandlers,
          logger,
        )
      : /** @type {AnyNetwork} */ (networkArg);

  // Belt-and-suspenders: if the network declares its codec, ensure
  // agreement. Catches "wrong codec paired with wrong network" at
  // construction instead of mid-handshake.
  const networkCodec = /** @type {OcapnNetwork} */ (network).codec;
  if (networkCodec && networkCodec !== codec) {
    throw Error(
      'makeOcapn: `network.codec` does not match `codec`; both peers must use the same wire codec',
    );
  }

  // Consume peer-initiated sessions (if any) as they land. Each yields
  // a fully-authenticated session that we wire into the session
  // manager; `provideSession` below returns them from its cache.
  const asOcapnNetwork = /** @type {OcapnNetwork} */ (network);
  if (asOcapnNetwork.inboundSessions) {
    const inboundSessions = asOcapnNetwork.inboundSessions;
    const runConsumer = async () => {
      await null;
      try {
        for await (const networkSession of inboundSessions) {
          const locationId = locationToLocationId(
            networkSession.remoteLocation,
          );
          // Race avoidance: a `provideSession` call concurrent with
          // an inbound handshake may already have promoted (or seen)
          // the noise network's active session for this peer. The
          // network may then ALSO publish the same session here.
          // Discard the duplicate idempotently rather than building
          // an InternalSession we'd immediately have to abort.
          // Aborting would tear down the underlying networkSession
          // that the active path now owns.
          if (!sessionManager.getActiveSession(locationId)) {
            const internalSession = makeInternalSessionFromNetwork(
              networkSession,
              network,
            );
            try {
              sessionManager.resolveSession(
                locationId,
                internalSession.connection,
                internalSession,
              );
            } catch (err) {
              logger.info(
                `inbound session for ${locationId} collided with existing; discarding new`,
                err,
              );
              // Tear down only the InternalSession bookkeeping;
              // calling `ocapn.abort` here would close the shared
              // underlying networkSession out from under the
              // already-resolved peer.
              sessionManager.endSession(internalSession);
            }
          }
        }
      } catch (err) {
        logger.error('inboundSessions consumer failed', err);
      }
    };
    runConsumer();
  }

  /** @type {Client} */
  const client = {
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
     * Mint a capability reference addressed to `(location, secret)`.
     * The peer resolves the secret against its own locator.
     *
     * @param {OcapnLocation} location
     * @param {string | Uint8Array} secret
     * @returns {SturdyRef}
     */
    makeSturdyRef(location, secret) {
      return sturdyRefTracker.makeSturdyRef(location, secret);
    },
    /**
     * Resolve a `SturdyRef` to a live capability. Local SturdyRefs flow
     * through the injected locator; remote SturdyRefs fetch from the
     * peer's bootstrap.
     *
     * @param {SturdyRef} sturdyRef
     * @returns {Promise<any>}
     */
    enlivenSturdyRef(sturdyRef) {
      return enlivenSturdyRef(
        sturdyRef,
        provideInternalSession,
        isSelfLocation,
        locator,
      );
    },
    shutdown() {
      logger.info(`shutdown called`);
      network.shutdown();
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
