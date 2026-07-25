// @ts-check
/* global setTimeout, clearTimeout */

import { randomBytes } from 'node:crypto';
import harden from '@endo/harden';
import { makeError, q, X } from '@endo/errors';
import { makeNetstringReader, makeNetstringWriter } from '@endo/netstring';
import { locationToLocationId } from '@endo/ocapn/client/util';

import { adaptIrohStream } from './stream-adapter.js';
import { HEARTBEAT_INTERVAL_MS, makeIrohHeartbeat } from './heartbeat.js';
import {
  buildIrohLocation,
  dialParamsFromLocation,
  isPublishableDirectAddress,
} from './location.js';

/**
 * @import { Connection, LocationId, Logger, NetLayer, NetlayerHandlers, SocketOperations } from '@endo/ocapn/client/types'
 * @import { OcapnLocation } from '@endo/ocapn/components'
 */

/**
 * An OCapN netlayer over iroh 1.0 (https://www.iroh.computer).
 *
 * "Dial keys, not IPs": a peer's designator is its iroh `EndpointId` — a
 * 32-byte Ed25519 public key — and iroh resolves it to live network
 * paths through its discovery services and relay mesh, hole-punching a
 * direct QUIC connection whenever possible and falling back to relays
 * otherwise. Every connection is end-to-end encrypted and mutually
 * authenticated by the endpoints' keys, so dialing a designator
 * authenticates the peer at the transport layer: no
 * challenge/response protocol is needed on top (contrast the websocket
 * netlayer's `init:peer-auth` exchange, which exists because plain
 * websockets authenticate nothing).
 *
 * Wire shape: one bidirectional QUIC stream per connection, negotiated
 * under the `ocapn/netstring/0` ALPN, carrying netstring-framed OCapN
 * messages. Session establishment is the standard OCapN
 * `op:start-session` handshake, run by the OCapN client over this
 * netlayer; crossed hellos are resolved by the client's session-key
 * comparison, as with the other connect-style netlayers.
 */

const ALPN_STRING = 'ocapn/netstring/0';
// The 1.0 binding takes ALPNs as plain `Array<number>` byte arrays (napi
// marshals `Vec<u8>` from a JS Array, not a TypedArray), both when
// advertised at bind time and when dialing.
const ALPN_ARRAY = harden(Array.from(new TextEncoder().encode(ALPN_STRING)));

/**
 * Hard cap on netstring frame length for inbound messages. Bounds the
 * allocation a hostile peer can force with a huge length prefix. OCapN
 * messages carrying bulk bytestrings can be sizable, so the cap is
 * generous rather than tight.
 */
const DEFAULT_MAX_FRAME_LENGTH = 16 * 1024 * 1024;

/**
 * How long a connection may sit between "wired" and "OCapN session
 * authenticated" before it is presumed dead and closed. Bounds the state
 * a peer that completes the QUIC/ALPN handshake but never sends a valid
 * `op:start-session` (or sends nothing) can pin.
 */
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 30_000;

/**
 * Cap on concurrent inbound connections that are wired but not yet
 * authenticated. Combined with the handshake timeout, this bounds the
 * un-authenticated inbound state a flood of junk connections can hold.
 */
const DEFAULT_MAX_INBOUND_IN_PROGRESS = 256;

/**
 * Encode a string as the `Array<number>` byte form the native binding's
 * `Vec<u8>` parameters expect (used for connection-close reasons).
 *
 * @param {string} text
 * @returns {number[]}
 */
const toByteArray = text => Array.from(new TextEncoder().encode(text));

/**
 * @typedef {object} IrohNetLayerDebug
 * @property {any} endpoint - The live iroh Endpoint (duck-typed).
 *
 * The netlayer's `connect` is asynchronous (a QUIC dial), which the
 * client supports (`OcapnNetwork.connect` may return a promise); the
 * legacy `NetLayer` typedef declares a synchronous `connect`, hence the
 * `Omit`.
 *
 * @typedef {Omit<NetLayer, 'connect'> & {
 *   networkId: string,
 *   connect: (location: OcapnLocation) => Promise<Connection>,
 *   verifyPeerLocation: (connection: Connection, peerLocation: OcapnLocation) => void,
 *   _debug: IrohNetLayerDebug,
 * }} IrohNetLayer
 */

/**
 * Create an OCapN netlayer backed by an iroh endpoint.
 *
 * The iroh binding is injectable for testing: pass a module-shaped
 * object with `Endpoint`, `EndpointAddr`, and `EndpointId`. When
 * omitted, the native `@number0/iroh` binding is imported dynamically —
 * it is an optional dependency that may be absent on unsupported
 * platforms, in which case this factory rejects rather than breaking
 * module resolution for the whole package.
 *
 * The netlayer's location (designator plus relay/direct-address hints)
 * is computed once, when the endpoint binds. OCapN identifies sessions
 * by the full location URI, so the advertised location must be exactly
 * what dialers use; a location that mutated as iroh's view of its own
 * addresses changed would strand pending sessions. Peers can always
 * dial by designator alone and let iroh discovery do the rest.
 *
 * @param {object} options
 * @param {NetlayerHandlers} options.handlers
 * @param {Logger} options.logger
 * @param {{ Endpoint: any, EndpointAddr: any, EndpointId: any }} [options.iroh] -
 *   Injected iroh binding (duck-typed). Defaults to `@number0/iroh`.
 * @param {Uint8Array | number[]} [options.secretKey] - 32-byte Ed25519
 *   secret for the iroh endpoint. Fresh random bytes when omitted. The
 *   caller owns persistence: supply the same secret to keep a stable
 *   designator across restarts.
 * @param {boolean} [options.publishPrivateAddresses] - Publish
 *   loopback/private direct addresses as dialing hints, and accept such
 *   addresses as dialing hints on inbound locations. Off by default:
 *   private/loopback hints are useless to a remote dialer, and honoring
 *   them on a location a third party hands us would let that party steer
 *   our QUIC dials at internal hosts (an SSRF-style vector). Enable for
 *   same-host tests where discovery has no public path to advertise.
 * @param {number} [options.heartbeatIntervalMs] - Datagram keep-alive
 *   send period. See `./heartbeat.js`.
 * @param {number} [options.handshakeTimeoutMs] - How long a wired
 *   connection may go without completing the OCapN session handshake
 *   before it is closed. See `DEFAULT_HANDSHAKE_TIMEOUT_MS`.
 * @param {number} [options.maxInboundInProgress] - Cap on concurrent
 *   un-authenticated inbound connections. See
 *   `DEFAULT_MAX_INBOUND_IN_PROGRESS`.
 * @param {number} [options.maxFrameLength] - Inbound netstring frame cap.
 * @returns {Promise<IrohNetLayer>}
 */
export const makeIrohNetLayer = async ({
  handlers,
  logger,
  iroh = undefined,
  secretKey = undefined,
  publishPrivateAddresses = false,
  heartbeatIntervalMs = HEARTBEAT_INTERVAL_MS,
  handshakeTimeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS,
  maxInboundInProgress = DEFAULT_MAX_INBOUND_IN_PROGRESS,
  maxFrameLength = DEFAULT_MAX_FRAME_LENGTH,
}) => {
  await null;
  // Imported dynamically when not injected: `@number0/iroh` is an
  // optional native binding that may be absent on unsupported platforms.
  // The specifier is held in a variable so the type checker does not
  // resolve the package's (malformed) type declarations.
  const irohSpecifier = '@number0/iroh';
  const irohModule =
    /** @type {{ Endpoint: any, EndpointAddr: any, EndpointId: any }} */ (
      iroh ?? (await import(irohSpecifier))
    );
  const { Endpoint, EndpointAddr, EndpointId } = irohModule;

  const secret =
    secretKey === undefined
      ? Array.from(randomBytes(32))
      : Array.from(secretKey);
  if (secret.length !== 32) {
    throw makeError(
      X`ocapn-iroh: secretKey must be 32 bytes, got ${q(secret.length)}`,
    );
  }

  // Bind the endpoint. `Endpoint.bind` applies iroh's n0 preset (relays +
  // discovery), then our options, so the netlayer keeps the "dial keys,
  // not IPs" default. Advertising the OCapN ALPN here is what lets
  // inbound dials negotiate our protocol; the accept loop below pulls
  // those connections.
  const endpoint = await Endpoint.bind({
    secretKey: secret,
    alpns: [Array.from(ALPN_ARRAY)],
  });
  const designator = endpoint.id().toString();

  /**
   * Read the endpoint's current relay/direct-address view for the
   * published hints. Best-effort: at bind time iroh may not yet know its
   * home relay, and peers can always dial by designator alone through
   * discovery.
   *
   * @returns {{ relayUrl?: string, addresses?: string[] }}
   */
  const readAddressHints = () => {
    try {
      const addr = endpoint.addr();
      return {
        relayUrl: addr.relayUrl() ?? undefined,
        addresses: addr.directAddresses(),
      };
    } catch (error) {
      logger.error(
        `ocapn-iroh: failed to read endpoint address: ${
          /** @type {Error} */ (error).message
        }`,
      );
      return {};
    }
  };

  const { relayUrl, addresses } = readAddressHints();
  const localLocation = buildIrohLocation(
    { nodeId: designator, relayUrl, addresses },
    { includePrivate: publishPrivateAddresses },
  );

  let isShutdown = false;
  /** @type {Set<Connection>} */
  const activeConnections = new Set();
  /** @type {Map<LocationId, Promise<Connection>>} */
  const outgoingConnections = new Map();

  /**
   * Per-connection handshake state: the QUIC-authenticated remote
   * EndpointId, the handshake-deadline canceller, a lazily-started
   * heartbeat, and the un-authenticated-inbound accounting.
   *
   * @typedef {object} ConnState
   * @property {string | undefined} remoteId - Authenticated peer
   *   EndpointId, or undefined if the binding did not expose one.
   * @property {boolean} isOutgoing
   * @property {boolean} authenticated
   * @property {() => void} cancelHandshakeTimeout
   * @property {() => void} startHeartbeat
   * @property {() => void} releaseInProgress - Idempotent; decrements the
   *   inbound in-progress counter at most once.
   */
  /** @type {Map<Connection, ConnState>} */
  const connectionState = new Map();
  // Count of inbound connections that are wired but not yet authenticated.
  let inboundInProgress = 0;

  /** @type {IrohNetLayer} */
  let netlayer;

  /**
   * Wire one dialed or accepted iroh bidi stream up to the OCapN client:
   * netstring framing in both directions, a datagram keep-alive, and a
   * pump that dispatches each whole inbound frame to
   * `handlers.handleMessageData`.
   *
   * @param {any} quicConn - iroh Connection (duck-typed).
   * @param {any} bi - iroh BiStream.
   * @param {boolean} isOutgoing
   * @param {() => void} [onClose] - Extra cleanup once the connection is
   *   fully closed.
   * @returns {Connection}
   */
  const wireConnection = (quicConn, bi, isOutgoing, onClose = () => {}) => {
    const { reader, writer } = adaptIrohStream(bi, quicConn);
    const frameReader = makeNetstringReader(reader, {
      name: 'ocapn-iroh',
      maxMessageLength: maxFrameLength,
    });
    const frameWriter = makeNetstringWriter(writer);

    // `SocketOperations.write` is synchronous while the iroh send path is
    // async; serialize writes on a promise chain so frames land on the
    // wire in call order. After the first failure the connection is torn
    // down and later writes are dropped (the peer is gone; OCapN teardown
    // proceeds through `handleConnectionClose`).
    let writeChain = Promise.resolve();
    let writeBroken = false;
    const closeQuicConnection = reason => {
      try {
        quicConn.close(0n, toByteArray(reason));
      } catch {
        // Best-effort; the connection may already be gone.
      }
    };
    /** @type {SocketOperations} */
    const socketOps = {
      write(bytes) {
        if (writeBroken) {
          return;
        }
        writeChain = writeChain
          .then(async () => {
            if (writeBroken) {
              return;
            }
            await frameWriter.next(bytes);
          })
          .catch(error => {
            if (!writeBroken) {
              writeBroken = true;
              logger.error('ocapn-iroh: write failed', error);
              closeQuicConnection('write failed');
            }
          });
      },
      end() {
        // Flush pending writes (a final op:abort typically precedes
        // `end`), finish the send stream, then close the QUIC
        // connection so it does not linger until iroh's idle timeout.
        const finalize = async () => {
          writeBroken = true;
          try {
            await frameWriter.return(undefined);
          } catch {
            // Peer may have already torn the stream down.
          }
          closeQuicConnection('ocapn connection end');
        };
        writeChain = writeChain.then(finalize, finalize);
      },
    };

    const connection = handlers.makeConnection(
      // The handlers accept the legacy synchronous-`connect` NetLayer
      // shape; the client itself tolerates the async `connect`.
      /** @type {NetLayer} */ (
        // eslint-disable-next-line no-use-before-define
        /** @type {unknown} */ (netlayer)
      ),
      isOutgoing,
      socketOps,
    );
    activeConnections.add(connection);

    // The QUIC-authenticated remote EndpointId. `verifyPeerLocation`
    // binds the peer's *claimed* OCapN designator to this. Read
    // defensively: the mock and the real binding both expose
    // `remoteId()`, but if a binding does not, `remoteId` stays undefined
    // and `verifyPeerLocation` fails closed rather than trusting the
    // claim.
    let remoteId;
    try {
      const rid = quicConn.remoteId?.();
      remoteId = rid == null ? undefined : rid.toString();
    } catch {
      remoteId = undefined;
    }

    // The heartbeat is created but NOT started until the session is
    // authenticated (see `verifyPeerLocation`). Starting it at wire time
    // would send keep-alive datagrams that keep resetting QUIC's idle
    // timer, so a peer that authenticates-then-goes-silent — or never
    // authenticates at all — would never be reaped by the idle timeout
    // the heartbeat's own watchdog defers to.
    let heartbeat;
    const startHeartbeat = () => {
      if (heartbeat) {
        return;
      }
      heartbeat = makeIrohHeartbeat(quicConn, {
        intervalMs: heartbeatIntervalMs,
        onTimeout: () => {
          logger.error(
            `ocapn-iroh: connection missed keep-alive; presuming peer dead`,
          );
          closeQuicConnection('keep-alive timeout');
        },
        log: message => logger.info(`ocapn-iroh: ${message}`),
      });
    };

    // Reap a connection that completes QUIC/ALPN but never finishes the
    // OCapN session handshake. Cancelled once `verifyPeerLocation` marks
    // the session authenticated.
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let handshakeTimer = setTimeout(() => {
      handshakeTimer = undefined;
      const state = connectionState.get(connection);
      if (state && !state.authenticated) {
        logger.info('ocapn-iroh: handshake deadline exceeded; closing');
        closeQuicConnection('handshake timeout');
      }
    }, handshakeTimeoutMs);
    if (typeof handshakeTimer.unref === 'function') {
      handshakeTimer.unref();
    }
    const cancelHandshakeTimeout = () => {
      if (handshakeTimer !== undefined) {
        clearTimeout(handshakeTimer);
        handshakeTimer = undefined;
      }
    };

    if (!isOutgoing) {
      inboundInProgress += 1;
    }
    let inProgressReleased = isOutgoing;
    const releaseInProgress = () => {
      if (!inProgressReleased) {
        inProgressReleased = true;
        inboundInProgress -= 1;
      }
    };

    connectionState.set(connection, {
      remoteId,
      isOutgoing,
      authenticated: false,
      cancelHandshakeTimeout,
      startHeartbeat,
      releaseInProgress,
    });

    // Pump whole netstring frames into the OCapN client. Reader EOF (or
    // a QUIC error surfacing as a read failure) is the close signal for
    // the connection, whichever side initiated it.
    const pump = async () => {
      await null;
      try {
        for await (const frame of frameReader) {
          if (connection.isDestroyed) {
            break;
          }
          // The netstring reader may yield a view into an internal
          // buffer; downstream OCapN decoding requires a
          // zero-`byteOffset` view, so `slice()` to a fresh owned copy.
          handlers.handleMessageData(connection, frame.slice());
        }
      } catch (error) {
        if (!connection.isDestroyed) {
          logger.error('ocapn-iroh: connection read failed', error);
        }
      } finally {
        cancelHandshakeTimeout();
        releaseInProgress();
        if (heartbeat) {
          heartbeat.stop();
        }
        connectionState.delete(connection);
        activeConnections.delete(connection);
        // Mark the connection destroyed before notifying the client, so
        // waiters observe `isDestroyed` even when the close raced data
        // delivery.
        connection.end();
        handlers.handleConnectionClose(connection);
        onClose();
      }
    };
    pump();

    return connection;
  };

  /**
   * Bind the peer's claimed OCapN designator to the QUIC-authenticated
   * remote EndpointId. Called by the OCapN client during the
   * `op:start-session` handshake (after the location signature validates)
   * for both inbound and outbound connections. Throws to reject a peer
   * presenting a designator that is not the identity iroh's mutually
   * authenticated QUIC handshake proved they hold — which is what stops
   * an inbound peer from impersonating a third party's location and
   * poisoning the client's session cache. On success it also promotes the
   * connection out of the un-authenticated state: the handshake deadline
   * is cancelled and the keep-alive heartbeat starts.
   *
   * @param {Connection} connection
   * @param {OcapnLocation} peerLocation
   */
  const verifyPeerLocation = (connection, peerLocation) => {
    const state = connectionState.get(connection);
    if (!state) {
      throw makeError(X`ocapn-iroh: unknown connection in verifyPeerLocation`);
    }
    if (state.remoteId === undefined) {
      throw makeError(
        X`ocapn-iroh: no QUIC-authenticated identity for connection; refusing to bind designator`,
      );
    }
    if (peerLocation.designator !== state.remoteId) {
      throw makeError(
        X`ocapn-iroh: peer designator ${q(peerLocation.designator)} does not match QUIC-authenticated EndpointId ${q(state.remoteId)}`,
      );
    }
    if (!state.authenticated) {
      state.authenticated = true;
      state.cancelHandshakeTimeout();
      state.releaseInProgress();
      state.startHeartbeat();
    }
  };

  /**
   * @param {OcapnLocation} location
   * @param {() => void} onClose
   * @returns {Promise<Connection>}
   */
  const dial = async (location, onClose) => {
    const {
      nodeId,
      relayUrl: peerRelay,
      addresses: peerAddrs,
    } = dialParamsFromLocation(location);
    // A location is attacker-influenced data (it can arrive in a gift, a
    // sturdyref, or a third-party handoff). Unless this netlayer is
    // explicitly in same-host mode, drop private/loopback direct-address
    // hints before dialing so a hostile location cannot steer our QUIC
    // dials at internal hosts. The EndpointId still authenticates the
    // peer, and discovery can always resolve it without hints.
    const dialAddrs = publishPrivateAddresses
      ? peerAddrs
      : peerAddrs?.filter(isPublishableDirectAddress);
    // 1.0 dials an `EndpointAddr` instance (built from an `EndpointId`
    // plus optional relay/direct-address hints). Passing no hints lets
    // discovery resolve the EndpointId. Dialing the EndpointId is what
    // authenticates the peer: QUIC TLS proves the remote holds the
    // designator's key.
    const endpointAddr = new EndpointAddr(
      EndpointId.fromString(nodeId),
      peerRelay,
      dialAddrs,
    );
    /** @type {any} */
    let quicConn;
    let handedOff = false;
    try {
      quicConn = await endpoint.connect(endpointAddr, Array.from(ALPN_ARRAY));
      // By convention the dialer opens the bi stream and writes the
      // first frame (the OCapN `op:start-session`); the accepter's
      // `acceptBi()` resolves when that stream arrives.
      const bi = await quicConn.openBi();
      const connection = wireConnection(quicConn, bi, true, onClose);
      handedOff = true;
      return connection;
    } catch (error) {
      // If we opened a QUIC connection but failed before handing it to
      // `wireConnection` (which then owns teardown), close it so it does
      // not linger until the peer's idle timeout.
      if (quicConn && !handedOff) {
        try {
          quicConn.close(0n, toByteArray('outbound setup failed'));
        } catch {
          // Best-effort.
        }
      }
      throw error;
    }
  };

  /**
   * Establish (or reuse) an outgoing connection to the peer at
   * `location`. The OCapN client sends its `op:start-session` over the
   * returned connection.
   *
   * @param {OcapnLocation} location
   * @returns {Promise<Connection>}
   */
  const connect = async location => {
    if (isShutdown) {
      throw makeError(X`ocapn-iroh: netlayer is shut down`);
    }
    const locationId = locationToLocationId(location);
    const existing = outgoingConnections.get(locationId);
    if (existing) {
      const existingConnection = await existing.catch(() => undefined);
      if (existingConnection && !existingConnection.isDestroyed) {
        return existingConnection;
      }
      if (outgoingConnections.get(locationId) === existing) {
        outgoingConnections.delete(locationId);
      }
    }
    logger.info('ocapn-iroh: connecting to', location.designator);
    /** @type {Promise<Connection>} */
    const connectionPromise = dial(location, () => {
      // Only evict ourselves: the map may already hold a later dial's
      // promise for this location.
      if (outgoingConnections.get(locationId) === connectionPromise) {
        outgoingConnections.delete(locationId);
      }
    });
    outgoingConnections.set(locationId, connectionPromise);
    try {
      return await connectionPromise;
    } catch (error) {
      if (outgoingConnections.get(locationId) === connectionPromise) {
        outgoingConnections.delete(locationId);
      }
      throw error;
    }
  };

  // --- Inbound accept loop ---
  // 1.0 drives the server-side handshake by hand through
  // `Incoming -> Accepting -> Connection`; `acceptNext()` yields one
  // inbound connection attempt at a time, or null once the endpoint
  // closes.
  /** @param {any} incoming */
  const handleIncoming = async incoming => {
    const accepting = await incoming.accept();
    const quicConn = await accepting.connect();
    let handedOff = false;
    try {
      // Shed load before wiring: if too many inbound connections are
      // already wired-but-unauthenticated, refuse this one rather than
      // let a flood pin unbounded per-connection state. (The QUIC
      // connection was accepted to learn it exists; close it now without
      // minting any OCapN session state for it.)
      if (inboundInProgress >= maxInboundInProgress) {
        logger.info(
          'ocapn-iroh: inbound in-progress cap reached; refusing connection',
        );
        quicConn.close(0n, toByteArray('busy'));
        return;
      }
      const bi = await quicConn.acceptBi();
      wireConnection(quicConn, bi, false);
      handedOff = true;
    } catch (error) {
      // If we accepted a connection but failed before handing it to
      // `wireConnection` (which then owns teardown), close it so the
      // QUIC connection does not linger until the peer's idle timeout.
      if (!handedOff) {
        try {
          quicConn.close(0n, toByteArray('inbound setup failed'));
        } catch {
          // Best-effort; the connection may already be gone.
        }
      }
      throw error;
    }
  };

  const acceptLoop = async () => {
    await null;
    // A transient rejection from `acceptNext` should not permanently kill
    // the loop (that would leave a live netlayer silently accepting
    // nothing); only a `null` result — the endpoint closing — or a run of
    // consecutive failures ends it.
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ACCEPT_ERRORS = 16;
    for (;;) {
      /** @type {any} */
      let incoming;
      try {
        // Accept connections one at a time; the work for each is
        // dispatched concurrently below, so the serial await here is
        // intentional.
        // eslint-disable-next-line no-await-in-loop
        incoming = await endpoint.acceptNext();
      } catch (error) {
        if (isShutdown) {
          return;
        }
        consecutiveErrors += 1;
        logger.error(
          `ocapn-iroh: acceptNext failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ACCEPT_ERRORS}): ${/** @type {Error} */ (error).message}`,
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ACCEPT_ERRORS) {
          throw error;
        }
        // eslint-disable-next-line no-continue
        continue;
      }
      consecutiveErrors = 0;
      if (!incoming) {
        // `acceptNext` resolves to null once the endpoint is closed.
        return;
      }
      // Handle each inbound connection independently: a single failed
      // inbound connection must not tear down the whole netlayer.
      handleIncoming(incoming).catch((/** @type {Error} */ error) => {
        logger.error(`ocapn-iroh: inbound connection error: ${error.message}`);
      });
    }
  };
  acceptLoop().catch(error => {
    logger.error('ocapn-iroh: accept loop failed', error);
  });

  const shutdown = () => {
    if (isShutdown) {
      return;
    }
    isShutdown = true;
    // Cancel any armed handshake deadlines so a shutdown does not leave
    // timers pending against connections we are about to end.
    for (const state of connectionState.values()) {
      state.cancelHandshakeTimeout();
    }
    for (const connection of activeConnections) {
      try {
        connection.end();
      } catch {
        // Teardown must not throw.
      }
    }
    activeConnections.clear();
    outgoingConnections.clear();
    // Closing the endpoint also ends the accept loop: `acceptNext`
    // resolves to null once the endpoint is closed.
    Promise.resolve(endpoint.close()).catch(() => {});
  };

  netlayer = harden({
    networkId: 'iroh',
    location: localLocation,
    locationId: locationToLocationId(localLocation),
    connect,
    verifyPeerLocation,
    shutdown,
    // eslint-disable-next-line no-underscore-dangle
    _debug: {
      endpoint,
    },
  });

  return netlayer;
};
harden(makeIrohNetLayer);
