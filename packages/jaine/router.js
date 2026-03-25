// @ts-nocheck — E() generics don't work well with JSDoc types for remote objects
import { E } from '@endo/eventual-send';

/**
 * @typedef {object} MentionInfo
 * @property {string} edge - message edge name to adopt channel from
 * @property {string} join - invitedAs name for channel.join()
 * @property {string} replyTo - channel message number to reply to
 */

/**
 * @typedef {object} EngageDecision
 * @property {'engage'} action
 * @property {string} textContent - formatted message text
 * @property {MentionInfo} [mentionInfo] - present if this is a channel mention
 */

/**
 * @typedef {object} IgnoreDecision
 * @property {'ignore'} action
 * @property {string} [reason]
 */

/** @typedef {EngageDecision | IgnoreDecision} RouteDecision */

/**
 * Parse channel-reply-info from a mention notification.
 * Returns null if the message is not a mention notification.
 *
 * @param {string} text
 * @returns {MentionInfo | null}
 */
const parseMentionInfo = text => {
  const match = text.match(
    /\[channel-reply-info:\s*edge=(\S+)\s+join=(\S+)\s+replyTo=(\S+)\]/,
  );
  if (!match) return null;
  return harden({ edge: match[1], join: match[2], replyTo: match[3] });
};
harden(parseMentionInfo);

/**
 * Format an inbox message into text content.
 *
 * @param {object} message - raw inbox message
 * @returns {string}
 */
const formatMessageText = message => {
  const { type, strings, names } = /** @type {any} */ (message);
  const namesArray = Array.isArray(names) ? names : [];
  if (type === 'package' && Array.isArray(strings)) {
    const parts = [];
    for (let i = 0; i < strings.length; i += 1) {
      parts.push(strings[i]);
      if (i < namesArray.length) {
        parts.push(`@${namesArray[i]}`);
      }
    }
    return parts.join('').trim();
  }
  return `(${type || 'unknown'} message)`;
};
harden(formatMessageText);

/**
 * Strip channel-reply-info metadata from text so the LLM sees clean content.
 *
 * @param {string} text
 * @returns {string}
 */
const stripMentionMetadata = text =>
  text
    .replace(/\[channel-reply-info:[^\]]+\]\n?/, '')
    .replace(/Use channelReply to respond\.\s*/, '')
    .trim();
harden(stripMentionMetadata);

/**
 * Create a message router for the Jaine agent.
 *
 * The router decides whether the agent should engage with a given inbox
 * message. v1 is rule-based: direct @mentions always engage, everything
 * else also engages (general inbox). The module structure allows future
 * LLM-based routing for passive channel watching.
 *
 * @param {object} powers - agent guest powers
 * @returns {Promise<{ route: (message: object) => RouteDecision }>}
 */
export const makeRouter = async powers => {
  const selfLocator = await E(powers).locate('@self');

  /** @type {Set<bigint>} */
  const processedMessages = new Set();

  /**
   * Route a single inbox message.
   *
   * @param {object} message - raw inbox message
   * @returns {RouteDecision}
   */
  const route = message => {
    const { from: fromId, number } = /** @type {any} */ (message);

    // Skip own messages
    if (fromId === selfLocator) {
      return harden({ action: 'ignore', reason: 'own message' });
    }

    // Skip duplicates
    const msgNum = BigInt(number);
    if (processedMessages.has(msgNum)) {
      return harden({ action: 'ignore', reason: 'duplicate' });
    }
    processedMessages.add(msgNum);

    // Format text
    const rawText = formatMessageText(message);

    // Check for mention notification
    const mentionInfo = parseMentionInfo(rawText);
    if (mentionInfo) {
      const textContent = stripMentionMetadata(rawText);
      return harden({ action: 'engage', textContent, mentionInfo });
    }

    // General inbox message — always engage
    return harden({
      action: 'engage',
      textContent: `[Inbox message #${number}]\n\n${rawText}`,
    });
  };

  return harden({ route });
};
harden(makeRouter);
