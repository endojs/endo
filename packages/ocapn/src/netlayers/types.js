// @ts-check

/**
 * @typedef {import('../codecs/components.js').OCapNLocation} OCapNLocation
 * @typedef {import('../cryptography.js').OCapNPublicKey} OCapNPublicKey
 * @typedef {import('../cryptography.js').OCapNSignature} OCapNSignature
 * @typedef {import('../cryptography.js').OCapNKeyPair} OCapNKeyPair
 */

/**
 * @typedef {object} NetLayer
 * @property {OCapNLocation} location
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
 */

/**
 * @typedef {object} Connection
 * @property {NetLayer} netlayer
 * @property {Session | undefined} session
 * @property {(bytes: Uint8Array) => void} write
 * @property {() => void} end
 * @property {() => void} destroySession
 * @property {boolean} isDestroyed
 */

/**
 * @typedef {object} Client
 * @property {() => Map<string, any>} makeDefaultSwissnumTable
 * @property {Map<string, Session>} activeSessions
 * Used to store a session once it's been fully initiated and set up.
 * Anytime the user needs to open a connection to a new peer, the user will be able
 * to check this table to see if a connection already exists, permitting
 * reuse of already established sessions.
 * @property {Map<string, Session>} outgoingSessions
 * Used to help the user mitigate the crossed hellos problem
 * Anytime the user needs to open a connection to a new peer, the user will be able
 * to check this table to see if a connection already exists, permitting
 * reuse of already established sessions.
 * @property {(connection: Connection, message: any) => void} handleMessage
 */
