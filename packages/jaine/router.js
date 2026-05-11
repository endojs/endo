// @ts-nocheck — E() generics don't work well with JSDoc types for remote objects
import { E } from '@endo/eventual-send';
import { extractToolCallsFromContent } from '@endo/fae/src/extract-tool-calls.js';
import { createLogger } from './logger.js';

// eslint-disable-next-line no-shadow
const console = createLogger();

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
 * @typedef {object} ChannelRouteResult
 * @property {boolean} shouldEngage - whether to compose a response
 * @property {string} [reason] - brief reason for the decision
 * @property {{ level: string, acknowledgment?: string }} [participationChange]
 */

// ---------------------------------------------------------------------------
// Inbox message helpers (rule-based, unchanged)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// LLM routing for channel participation
// ---------------------------------------------------------------------------

const routingToolSchema = harden({
  type: 'function',
  function: {
    name: 'decide',
    description:
      'Make a routing decision about whether to respond to this ' +
      'channel message.',
    parameters: {
      type: 'object',
      properties: {
        shouldRespond: {
          type: 'boolean',
          description: 'Whether Jaine should respond to this message.',
        },
        reason: {
          type: 'string',
          description: 'Brief reason for the decision.',
        },
        newParticipationLevel: {
          type: 'string',
          enum: ['active', 'normal', 'quiet', 'observer'],
          description:
            'If the user requested a change in your participation ' +
            'level, the new level. Omit if no change was requested.',
        },
        participationAcknowledgment: {
          type: 'string',
          description:
            'Brief acknowledgment to post when participation level ' +
            'changes.',
        },
      },
      required: ['shouldRespond', 'reason'],
    },
  },
});

/**
 * Build the routing system prompt for a given participation level.
 *
 * @param {string} level
 * @param {string} notes
 * @returns {string}
 */
const buildRoutingPrompt = (level, notes) => {
  const notesLine = notes ? `\nChannel notes: ${notes}\n` : '';
  return `\
You are Layer 1 of Jaine, an AI channel agent. Your sole job is to quickly
decide whether Jaine should respond to a channel message.

Your current participation level in this channel is: ${level}
${notesLine}
Participation levels:
- active: Respond frequently. Join conversations where you can add value,
  answer questions, offer help proactively.
- normal: Respond when addressed by name, when a question is clearly
  within your capabilities, or when you can provide unique value.
- quiet: Only respond when directly asked a question or when your input
  is specifically requested. Stay in the background otherwise.
- observer: Never respond. Only explicit @mentions (which bypass this
  routing) trigger engagement.

Guidelines:
- Be a good channel citizen. Don't dominate conversations.
- If someone asks you to change how often you participate (e.g., "be more
  active", "tone it down", "just watch"), adjust your participation level.
- Consider whether your response would genuinely add value.
- When in doubt, don't respond.

Use the decide tool to make your routing decision.`;
};
harden(buildRoutingPrompt);

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create a message router for the Jaine agent.
 *
 * The router handles two kinds of routing:
 * 1. Inbox messages (rule-based): @mentions always engage, general inbox
 *    messages engage by default.
 * 2. Channel messages (LLM-powered): uses the provider to decide whether
 *    to engage based on the participation level and channel context.
 *
 * @param {object} powers - agent guest powers
 * @param {{ chat: (messages: object[], tools: object[]) => Promise<{ message: object }> }} [provider]
 * @returns {Promise<object>}
 */
export const makeRouter = async (powers, provider) => {
  const selfLocator = await E(powers).locate('@self');

  /** @type {Set<bigint>} */
  const processedMessages = new Set();

  /** @type {Map<string, { level: string, notes: string }>} */
  const channelParticipation = new Map();

  /**
   * Get the participation settings for a channel.
   *
   * @param {string} channelId
   * @returns {{ level: string, notes: string }}
   */
  const getParticipation = channelId => {
    return (
      channelParticipation.get(channelId) ||
      harden({ level: 'normal', notes: '' })
    );
  };

  /**
   * Set the participation level for a channel.
   *
   * @param {string} channelId
   * @param {string} level
   * @param {string} [notes]
   */
  const setParticipation = (channelId, level, notes) => {
    const existing = getParticipation(channelId);
    channelParticipation.set(
      channelId,
      harden({
        level,
        notes: notes !== undefined ? notes : existing.notes,
      }),
    );
    console.log(`[jaine][router] Participation for ${channelId}: ${level}`);
  };

  // ----- Inbox routing (rule-based, synchronous) -----

  /**
   * Route a single inbox message.
   *
   * @param {object} message - raw inbox message
   * @returns {RouteDecision}
   */
  const route = message => {
    const { from: fromId, number } = /** @type {any} */ (message);

    if (fromId === selfLocator) {
      return harden({ action: 'ignore', reason: 'own message' });
    }

    const msgNum = BigInt(number);
    if (processedMessages.has(msgNum)) {
      return harden({ action: 'ignore', reason: 'duplicate' });
    }
    processedMessages.add(msgNum);

    const rawText = formatMessageText(message);

    const mentionInfo = parseMentionInfo(rawText);
    if (mentionInfo) {
      const textContent = stripMentionMetadata(rawText);
      return harden({ action: 'engage', textContent, mentionInfo });
    }

    return harden({
      action: 'engage',
      textContent: `[Inbox message #${number}]\n\n${rawText}`,
    });
  };

  // ----- Channel routing (LLM-powered, async) -----

  /**
   * Route a channel message using the LLM.
   *
   * @param {object} message - channel message object
   * @param {string} channelId - canonical channel identifier
   * @param {string} recentContext - formatted recent channel messages
   * @param {string} authorName - display name of the message author
   * @returns {Promise<ChannelRouteResult>}
   */
  const routeChannelMessage = async (
    message,
    channelId,
    recentContext,
    authorName,
  ) => {
    const { level, notes } = getParticipation(channelId);

    if (level === 'observer') {
      return harden({ shouldEngage: false, reason: 'observer mode' });
    }

    if (!provider) {
      return harden({
        shouldEngage: false,
        reason: 'no LLM provider for routing',
      });
    }

    const msgText = Array.isArray(message.strings)
      ? message.strings.join('')
      : '';

    const systemPrompt = buildRoutingPrompt(level, notes);
    const userContent = recentContext
      ? `Recent channel messages:\n${recentContext}\n\nNew message from ${authorName}:\n${msgText}`
      : `New message from ${authorName}:\n${msgText}`;

    try {
      const response = await provider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        [routingToolSchema],
      );

      const rm = /** @type {any} */ (response.message);
      if (!rm) {
        return harden({ shouldEngage: false, reason: 'no LLM response' });
      }

      // Extract tool calls from content if not in structured field
      if ((!rm.tool_calls || rm.tool_calls.length === 0) && rm.content) {
        const extracted = extractToolCallsFromContent(rm.content);
        if (extracted.toolCalls) {
          rm.tool_calls = extracted.toolCalls;
        }
      }

      const toolCalls = Array.isArray(rm.tool_calls) ? rm.tool_calls : [];
      // eslint-disable-next-line @endo/restrict-comparison-operands
      if (toolCalls.length > 0) {
        const tc = /** @type {any} */ (toolCalls[0]);
        /** @type {Record<string, unknown>} */
        let args;
        try {
          const raw = tc.function?.arguments;
          args = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
        } catch {
          args = {};
        }

        /** @type {{ level: string, acknowledgment?: string } | undefined} */
        let participationChange;
        if (args.newParticipationLevel) {
          participationChange = harden({
            level: String(args.newParticipationLevel),
            acknowledgment: args.participationAcknowledgment
              ? String(args.participationAcknowledgment)
              : undefined,
          });
        }

        return harden({
          shouldEngage: Boolean(args.shouldRespond),
          reason: String(args.reason || ''),
          participationChange,
        });
      }

      return harden({ shouldEngage: false, reason: 'no routing decision' });
    } catch (err) {
      console.error(
        '[jaine][router] LLM routing error:',
        err instanceof Error ? err.message : String(err),
      );
      return harden({ shouldEngage: false, reason: 'routing error' });
    }
  };

  return harden({
    route,
    routeChannelMessage,
    getParticipation,
    setParticipation,
  });
};
harden(makeRouter);
