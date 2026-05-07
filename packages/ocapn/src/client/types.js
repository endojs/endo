// @ts-check

/**
 * @import { OcapnLocation, OcapnSignature } from '../codecs/components.js'
 * @import { OcapnKeyPair, OcapnPublicKey } from '../cryptography.js'
 * @import { GrantTracker } from './grant-tracker.js'
 * @import { SturdyRef, SturdyRefTracker } from './sturdyrefs.js'
 * @import { Ocapn } from './ocapn.js'
 */

/**
 * @typedef {string & { _brand: 'LocationId' }} LocationId
 * A string used for referencing, such as keys in Maps. Not part of OCapN spec.
 * @typedef {ArrayBufferLike & { _brand: 'SessionId' }} SessionId
 * From OCapN spec. Id for a session between two peers.
 * @typedef {ArrayBufferLike & { _brand: 'SwissNum' }} SwissNum
 * From OCapN spec. Used for resolving SturdyRefs.
 * @typedef {ArrayBufferLike & { _brand: 'PublicKeyId' }} PublicKeyId
 * From OCapN spec. Identifier for a public key (double SHA-256 hash of key descriptor).
 */

/**
 * @typedef {object} NetLayer
 * @property {OcapnLocation} location
 * @property {LocationId} locationId
 * @property {(location: OcapnLocation) => Connection} connect
 * @property {() => void} shutdown
 */

/**
 * An OCapN Network is responsible for session establishment, authentication,
 * and encryption.  Each network defines its own handshake protocol and may
 * support multiple transports (WebSocket, TCP, etc.).
 *
 * This is the replacement for NetLayer as part of the network/transport
 * separation (see designs/ocapn-network-transport-separation.md).
 *
 * @typedef {object} OcapnNetwork
 * @property {string} networkId - Unique identifier for this network.
 * @property {import('../codec-interface.js').OcapnCodec} [codec] -
 *   Wire codec this network uses. If present, the client adopts it at
 *   registration time; this lets `makeOcapn()` be constructed without
 *   an explicit codec. Two registered networks must agree on the codec
 *   (and a codec passed to `makeOcapn({ codec })` must match).
 * @property {() => void} shutdown - Shut the network down, closing
 *   outgoing and inbound state.
 * @property {((location: OcapnLocation) => Connection | Promise<Connection>)} [connect] -
 *   Establish a raw connection to a peer. Required unless the network
 *   implements `provideSession`. May be synchronous or asynchronous;
 *   the client always awaits the result.
 * @property {((location: OcapnLocation) => Promise<NetworkSession>)} [provideSession] -
 *   Return a fully authenticated session; the client bypasses its own
 *   handshake machinery. Required unless the network implements `connect`.
 * @property {OcapnLocation} [location] - A representative location of
 *   this network, used for self-location checks. Networks that do not
 *   have a single fixed location may omit this.
 * @property {LocationId} [locationId] - Cached locationId for `location`.
 * @property {((connection: Connection, captpVersion: string, selfIdentity: SelfIdentity, codec: import('../codec-interface.js').OcapnCodec) => void)} [sendSessionHandshake] -
 *   Optional custom handshake for outgoing connections. If present, the
 *   network owns the handshake bytes for this connection instead of the
 *   default `op:start-session`. `selfIdentity` is supplied by the client
 *   for networks that share its identity layer; networks with their own
 *   identity (e.g. Noise) can ignore it.
 * @property {((connection: Connection, data: Uint8Array, selfIdentity: SelfIdentity, captpVersion: string) => boolean)} [handleSessionHandshake] -
 *   Optional custom handler for incoming handshake bytes. Returns true
 *   if the data was consumed as a network-level handshake message, or
 *   false to let the client fall back to the default handler.
 * @property {AsyncIterable<NetworkSession>} [inboundSessions] -
 *   Async iterable yielding fully-authenticated `NetworkSession`s that
 *   the network accepted without a corresponding `provideSession` call
 *   (e.g. a peer-initiated Noise handshake). The client consumes this
 *   on `registerNetwork` and wires each session into its session
 *   manager. Networks that have no concept of inbound sessions omit
 *   this field.
 */

/**
 * The handoff interface between a network and OCapN core.
 * After the network establishes and authenticates a session (via
 * op:start-session, Noise Protocol, or other handshake), it delivers
 * a NetworkSession to OCapN core, which runs CapTP over it.
 *
 * @typedef {object} NetworkSession
 * @property {SessionId} sessionId - Unique session identifier.
 * @property {SelfIdentity} selfIdentity - Our identity for this session,
 *   supplied by the network (which authenticated to the peer using this
 *   keypair during handshake).
 * @property {ArrayBufferLike} remotePublicKeyBytes - Peer's raw public
 *   key bytes (needed to construct OcapnPublicKey for session).
 * @property {OcapnLocation} remoteLocation - Peer's location.
 * @property {import('../codecs/components.js').OcapnSignature} remoteLocationSignature -
 *   Peer's location signature as verified during session establishment.
 * @property {import('@endo/stream').Reader<Uint8Array>} reader - Stream
 *   yielding plaintext OCapN frames as they arrive from the peer. The
 *   network is responsible for framing, decryption, and anything else
 *   between the wire and whole OCapN messages. The client pumps this
 *   reader and dispatches each frame to CapTP.
 * @property {import('@endo/stream').Writer<Uint8Array>} writer - Stream
 *   accepting plaintext OCapN frames destined for the peer. One
 *   `writer.next(bytes)` carries one OCapN message; the network frames,
 *   encrypts, and delivers.
 * @property {() => void} close - Terminate session.
 * @property {boolean} isInitiator - Whether we initiated this session.
 */

/**
 * @typedef {object} IncomingConnectionHandler
 * @property {(connection: Connection) => void} onConnection -
 *   Called when a new incoming connection is established.
 */

/**
 * @typedef {object} PendingSession
 * @property {Connection | undefined} outgoingConnection
 * @property {Promise<InternalSession>} promise
 * @property {(session: InternalSession) => void} resolve
 * @property {(reason?: Error) => void} reject
 */

/**
 * Minimal public session interface.
 * For full session access (testing/debugging), use debug.provideInternalSession().
 * @typedef {object} Session
 * @property {() => object} getBootstrap - Get the remote bootstrap object
 * @property {(reason?: Error) => void} abort - Abort the session
 */

/**
 * Full internal session with all properties for internal use and testing.
 * @typedef {object} InternalSession
 * @property {SessionId} id
 * @property {object} peer
 * @property {OcapnPublicKey} peer.publicKey
 * @property {OcapnLocation} peer.location
 * @property {OcapnSignature} peer.locationSignature
 * @property {object} self
 * @property {OcapnKeyPair} self.keyPair
 * @property {OcapnLocation} self.location
 * @property {OcapnSignature} self.locationSignature
 * @property {Ocapn} ocapn
 * @property {Connection} connection
 * @property {() => bigint} getHandoffCount
 * Returns the current handoff count for this session as Receiver.
 * Does not increment the internal counter.
 * @property {() => bigint} takeNextHandoffCount
 * Returns the next unique handoff count for this session as Receiver.
 * Increments the internal counter for subsequent calls.
 */

/**
 * @typedef {object} SelfIdentity
 * @property {OcapnLocation} location
 * @property {OcapnKeyPair} keyPair
 * @property {OcapnSignature} locationSignature
 */

/**
 * Minimal public connection interface exposed to netlayer consumers.
 * @typedef {object} Connection
 * @property {'Connection'} [__brand] - Type brand to prevent structural compatibility
 * @property {NetLayer} netlayer
 * @property {boolean} isOutgoing
 * @property {(bytes: Uint8Array) => void} write
 * @property {() => void} end
 * @property {boolean} isDestroyed
 */

/**
 * @typedef {object} Logger
 * @property {(...args: any[]) => void} log
 * @property {(...args: any[]) => void} error
 * @property {(...args: any[]) => void} info
 */

/**
 * @typedef {object} SessionManager
 * @property {(location: LocationId) => InternalSession | undefined} getActiveSession
 * @property {(location: LocationId) => Connection | undefined} getOutgoingConnection
 * @property {(location: LocationId) => Promise<InternalSession> | undefined} getPendingSessionPromise
 * @property {(connection: Connection) => InternalSession | undefined} getSessionForConnection
 * @property {(location: LocationId, connection: Connection) => PendingSession} makePendingSession
 * @property {(location: LocationId, connection: Connection, session: InternalSession) => void} resolveSession
 * @property {(connection: Connection) => void} deleteConnection
 * When a connection is no longer relevant to establishing a session.
 * Does not close the connection. Does not close or delete the session.
 * @property {(session: InternalSession) => void} endSession
 * When a session has ended (eg connection closed).
 * Does not close the connection. Does not delete the session.
 * Does not communicate with the peer.
 * @property {(connection: Connection) => boolean} rejectPendingSessionForConnection
 * Finds and rejects any pending session associated with the given connection.
 * Returns true if a pending session was found and rejected, false otherwise.
 * @property {(sessionId: SessionId) => OcapnPublicKey | undefined} getPeerPublicKeyForSessionId
 */

/**
 * Socket operations provided by netlayer for a connection.
 * @typedef {object} SocketOperations
 * @property {(bytes: Uint8Array) => void} write - Write bytes to the socket
 * @property {() => void} end - Close the socket
 */

/**
 * Handlers returned by registerNetlayer for the netlayer to call.
 * @typedef {object} NetlayerHandlers
 * @property {(netlayer: NetLayer, isOutgoing: boolean, socket: SocketOperations) => Connection} makeConnection
 * Creates a connection wrapper. Client internally handles identity creation.
 * Caller is responsible for initiating handshake if needed (client does this in establishSession).
 * @property {(connection: Connection, data: Uint8Array) => void} handleMessageData
 * @property {(connection: Connection, reason?: Error) => void} handleConnectionClose
 */

/**
 * Debug/testing interface exposing internal APIs.
 * Only available when client is created with `debugMode: true`.
 * @typedef {object} ClientDebug
 * @property {Logger} logger
 * @property {string} debugLabel
 * @property {string} captpVersion
 * @property {GrantTracker} grantTracker
 * @property {SessionManager} sessionManager
 * @property {SturdyRefTracker} sturdyRefTracker
 * @property {(location: OcapnLocation) => Promise<InternalSession>} provideInternalSession
 * Returns the full InternalSession object with all internal properties for debugging/testing.
 */

/**
 * The caller-owned table `makeOcapn` consults when a peer asks for a
 * local capability (via `bootstrap.fetch(secret)`) or when resolving a
 * self-local `SturdyRef`. Any object with a `get(secret)` that returns a
 * capability, `undefined`, or a promise of either works; a plain `Map`
 * is a valid `NonceLocator`.
 *
 * The name parallels the `NonceLocator` term of art in E and Spritely
 * Goblins for a registry that resolves nonces (here, swissnums or
 * other secrets) to local capabilities. It also avoids the existing
 * `formatLocator`/`parseLocator` URI helpers in `@endo/daemon`, which
 * use the word `Locator` for the addressable URI form.
 *
 * @typedef {object} NonceLocator
 * @property {(secret: string) => unknown | Promise<unknown>} get
 */

/**
 * The session-manager instance returned by `makeOcapn`.
 *
 * @typedef {object} Client
 * @property {(location: OcapnLocation) => Promise<Session>} provideSession
 *   Open (or reuse) a CapTP session to the peer at `location`.
 * @property {(location: OcapnLocation, secret: string | Uint8Array) => SturdyRef} makeSturdyRef
 *   Mint a SturdyRef: an addressable, passable `(location, secret)`
 *   pair. The secret may be a printable-ASCII string (the friendly
 *   form for locators keyed by name) or raw bytes for arbitrary-byte
 *   sturdyrefs (e.g. the 24-byte randoms Spritely Goblins mints).
 *   Peers resolve the secret against their own `NonceLocator`.
 * @property {(sturdyRef: SturdyRef) => Promise<any>} enlivenSturdyRef
 *   Resolve a SturdyRef to a live capability: local SturdyRefs go
 *   through the injected locator; remote SturdyRefs fetch from the
 *   peer's bootstrap.
 * @property {() => void} shutdown
 * @property {ClientDebug} [_debug]
 *   Only present when the client was constructed with `debugMode:
 *   true`. Exposes internal APIs for testing.
 */
