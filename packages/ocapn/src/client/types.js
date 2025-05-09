// @ts-check

/**
 * @typedef {import('../codecs/components.js').OCapNLocation} OCapNLocation
 * @typedef {import('../cryptography.js').OCapNPublicKey} OCapNPublicKey
 * @typedef {import('../cryptography.js').OCapNSignature} OCapNSignature
 * @typedef {import('../cryptography.js').OCapNKeyPair} OCapNKeyPair
 * @typedef {import('./ocapn.js').OCapN} OCapN
 
/**
 * @typedef {string} LocationId
 */

/**
 * @typedef {object} NetLayer
 * @property {OCapNLocation} location
 * @property {(location: OCapNLocation) => Connection} connect
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
 * @property {object} tables
 * @property {Map<string, any>} tables.swissnumTable
 * @property {Map<bigint, any>} tables.importTable
 * @property {Map<bigint, any>} tables.exportTable
 * @property {bigint} tables.exportCount
 * @property {Map<bigint, Promise<any>>} tables.answerTable
 * @property {object} peer
 * @property {OCapNPublicKey} peer.publicKey
 * @property {OCapNLocation} peer.location
 * @property {OCapNSignature} peer.locationSignature
 * @property {object} self
 * @property {OCapNKeyPair} self.keyPair
 * @property {OCapNLocation} self.location
 * @property {OCapNSignature} self.locationSignature
 * @property {OCapN} ocapn
 * @property {Connection} connection
 */

/**
 * @typedef {object} SelfIdentity
 * @property {OCapNLocation} location
 * @property {OCapNKeyPair} keyPair
 * @property {OCapNSignature} locationSignature
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
 */

/**
 * @typedef {object} Client
 * @property {Logger} logger
 * @property {string} debugLabel
 * @property {() => Map<string, any>} makeDefaultSwissnumTable
 * @property {(netlayer: NetLayer) => void} registerNetlayer
 * @property {(connection: Connection, data: Uint8Array) => void} handleMessageData
 * @property {(connection: Connection, reason?: Error) => void} handleConnectionClose
 * @property {(location: OCapNLocation) => Promise<Session>} provideSession
 * @property {() => void} shutdown
 */
