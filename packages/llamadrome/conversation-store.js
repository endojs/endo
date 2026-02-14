// @ts-check

/** @import { FarEndoGuest } from '@endo/daemon/src/types.js' */

import { E } from '@endo/eventual-send';

const CONVERSATION_STATE_NAME = 'conversation-state';

/**
 * @typedef {object} ConversationState
 * @property {Array<{role: string, content: unknown}>} messages
 * @property {bigint} [lastSeenNumber]
 * @property {Array<PendingToolCall>} [pendingToolCalls]
 */

/**
 * @typedef {object} PendingToolCall
 * @property {string} toolUseId
 * @property {string} toolName
 * @property {Record<string, unknown>} input
 * @property {bigint} messageNumber
 */

/**
 * Save conversation state to the guest's directory.
 *
 * @param {FarEndoGuest} powers
 * @param {ConversationState} state
 * @returns {Promise<void>}
 */
export const saveConversation = async (powers, state) => {
  // Convert bigint lastSeenNumber to string for passability
  const passableState = harden({
    messages: [...state.messages],
    ...(state.lastSeenNumber !== undefined && {
      lastSeenNumber: String(state.lastSeenNumber),
    }),
    ...(state.pendingToolCalls !== undefined && {
      pendingToolCalls: state.pendingToolCalls.map(tc =>
        harden({
          toolUseId: tc.toolUseId,
          toolName: tc.toolName,
          input: tc.input,
          messageNumber: String(tc.messageNumber),
        }),
      ),
    }),
  });
  await E(powers).storeValue(passableState, CONVERSATION_STATE_NAME);
};
harden(saveConversation);

/**
 * Load conversation state from the guest's directory.
 * Returns null if no saved state exists.
 *
 * @param {FarEndoGuest} powers
 * @returns {Promise<ConversationState | null>}
 */
export const loadConversation = async powers => {
  const exists = await E(powers).has(CONVERSATION_STATE_NAME);
  if (!exists) {
    return null;
  }
  const stored = /** @type {Record<string, unknown>} */ (
    await E(powers).lookup(CONVERSATION_STATE_NAME)
  );
  if (!stored || !Array.isArray(stored.messages)) {
    return null;
  }
  return harden({
    messages: /** @type {Array<{role: string, content: unknown}>} */ (
      stored.messages
    ),
    ...(stored.lastSeenNumber !== undefined && {
      lastSeenNumber: BigInt(/** @type {string} */ (stored.lastSeenNumber)),
    }),
    ...(stored.pendingToolCalls !== undefined && {
      pendingToolCalls:
        /** @type {Array<{toolUseId: string, toolName: string, input: Record<string, unknown>, messageNumber: string}>} */ (
          stored.pendingToolCalls
        ).map(tc =>
          harden({
            toolUseId: tc.toolUseId,
            toolName: tc.toolName,
            input: tc.input,
            messageNumber: BigInt(tc.messageNumber),
          }),
        ),
    }),
  });
};
harden(loadConversation);
