// @ts-check

/**
 * @typedef {object} SignalEnvelope
 * @property {string} source
 * @property {string} text
 * @property {string} [groupId]
 * @property {string} [groupName]
 * @property {number} [timestamp]
 */

/**
 * @typedef {object} SignalAddressedMessage
 * @property {SignalEnvelope} envelope
 * @property {string} normalizedText
 */

/**
 * @typedef {object} SignalConversationState
 * @property {string} peerPetName
 * @property {string} peerId
 */

/**
 * @typedef {object} SignalBridgeConfig
 * @property {string} signalAccount
 * @property {Record<string, string>} sourceToAgent
 */

/**
 * @typedef {{ allow: false, reason: string } | { allow: true, addressed: SignalAddressedMessage }} SignalIngressDecision
 */

/**
 * @typedef {object} SignalInventoryEntry
 * @property {string} name
 * @property {string | undefined} id
 * @property {string | undefined} formulaType
 */

/**
 * @typedef {object} SignalBridgeState
 * @property {Record<string, SignalConversationState>} conversations
 */

export {};
