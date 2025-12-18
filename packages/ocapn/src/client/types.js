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
 * @typedef {object} PendingSession
 * @property {Connection | undefined} outgoingConnection
 * @property {Promise<Session>} promise
 * @property {(session: Session) => void} resolve
 * @property {(reason?: Error) => void} reject
 */

/**
 * @typedef {object} Session
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
 * @typedef {object} Connection
 * @property {NetLayer} netlayer
 * @property {boolean} isOutgoing
 * @property {SelfIdentity} selfIdentity
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
 * @property {(location: LocationId) => Session | undefined} getActiveSession
 * @property {(location: LocationId) => Connection | undefined} getOutgoingConnection
 * @property {(location: LocationId) => Promise<Session> | undefined} getPendingSessionPromise
 * @property {(connection: Connection) => Session | undefined} getSessionForConnection
 * @property {(location: LocationId, connection: Connection) => PendingSession} makePendingSession
 * @property {(location: LocationId, connection: Connection, session: Session) => void} resolveSession
 * @property {(connection: Connection) => void} deleteConnection
 * When a connection is no longer relevant to establishing a session.
 * Does not close the connection. Does not close or delete the session.
 * @property {(session: Session) => void} endSession
 * When a session has ended (eg connection closed).
 * Does not close the connection. Does not delete the session.
 * Does not communicate with the peer.
 * @property {(connection: Connection) => boolean} rejectPendingSessionForConnection
 * Finds and rejects any pending session associated with the given connection.
 * Returns true if a pending session was found and rejected, false otherwise.
 * @property {(sessionId: SessionId) => OcapnPublicKey | undefined} getPeerPublicKeyForSessionId
 */

/**
 * @typedef {object} Client
 * @property {Logger} logger
 * @property {string} debugLabel
 * @property {GrantTracker} grantTracker
 * @property {SessionManager} sessionManager
 * @property {SturdyRefTracker} sturdyRefTracker
 * @property {string} captpVersion
 * @property {(netlayer: NetLayer) => void} registerNetlayer
 * @property {(connection: Connection, data: Uint8Array) => void} handleMessageData
 * @property {(connection: Connection, reason?: Error) => void} handleConnectionClose
 * @property {(location: OcapnLocation) => Promise<Session>} provideSession
 * @property {(location: OcapnLocation, swissNum: SwissNum) => SturdyRef} makeSturdyRef
 * @property {(sturdyRef: SturdyRef) => Promise<any>} enlivenSturdyRef
 * @property {() => void} shutdown
 */
