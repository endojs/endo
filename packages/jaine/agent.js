// @ts-nocheck — E() generics don't work well with JSDoc types for remote objects
/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { createProvider } from '@endo/lal/providers/index.js';

import { makeRouter } from './router.js';
import { makeComposer } from './composer.js';
import { makeExecutor } from './executor.js';
import { createLogger } from './logger.js';

// eslint-disable-next-line no-shadow
const console = createLogger();

const JaineFactoryInterface = M.interface('JaineFactory', {
  createAgent: M.callWhen(M.string()).optional(M.record()).returns(M.string()),
  help: M.call().optional(M.string()).returns(M.string()),
});

/** System prompt for general inbox messages handled by the executor. */
const inboxSystemPrompt = `\
You are Jaine, a stateless channel agent. Each message is independent.
Use the available tools to accomplish whatever is requested.
reply() is for private inbox responses. exec() is for code execution.`;

// ---------------------------------------------------------------------------
// Thread context builder
// ---------------------------------------------------------------------------

/**
 * Build a formatted transcript of the thread branch leading to a message.
 * Walks the replyTo chain backward, then formats chronologically.
 *
 * @param {object} member - channel member handle
 * @param {string} replyToNum - message number to trace back from
 * @returns {Promise<string>}
 */
const buildThreadContext = async (member, replyToNum) => {
  const allMessages = /** @type {any[]} */ (await E(member).listMessages());

  /** @type {Map<string, any>} */
  const msgMap = new Map();
  for (const msg of allMessages) {
    msgMap.set(String(msg.number), msg);
  }

  // Build member name map
  /** @type {Map<string, string>} */
  const memberNames = new Map();
  try {
    const members = /** @type {any[]} */ (await E(member).getMembers());
    for (const m of members) {
      memberNames.set(m.memberId, m.proposedName || m.invitedAs);
    }
  } catch {
    // not available
  }

  // Walk the reply chain backward from the target message
  /** @type {any[]} */
  const threadMessages = [];
  let current = replyToNum;
  const visited = new Set();
  while (current && msgMap.has(current) && !visited.has(current)) {
    visited.add(current);
    const msg = msgMap.get(current);
    threadMessages.unshift(msg);
    current = msg.replyTo;
  }

  // Also include direct children of the target message (siblings of agent reply)
  for (const msg of allMessages) {
    if (
      String(msg.replyTo) === replyToNum &&
      !visited.has(String(msg.number))
    ) {
      threadMessages.push(msg);
      visited.add(String(msg.number));
    }
  }

  // Format as text
  const lines = threadMessages.map(msg => {
    const author = memberNames.get(msg.memberId) || msg.memberId;
    const text = Array.isArray(msg.strings) ? msg.strings.join('') : '';
    const replyTag = msg.replyTo ? ` (reply to #${msg.replyTo})` : '';
    const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;
    return `[#${msg.number}] ${author}${replyTag}: ${preview}`;
  });

  return lines.join('\n');
};
harden(buildThreadContext);

const DEFAULT_RECENT_HISTORY_COUNT = 50;

/**
 * Build a formatted transcript of the most recent channel messages.
 *
 * @param {object} member - channel member handle
 * @param {number} [count] - number of recent messages to include
 * @returns {Promise<string>}
 */
const buildRecentHistory = async (
  member,
  count = DEFAULT_RECENT_HISTORY_COUNT,
) => {
  const allMessages = /** @type {any[]} */ (await E(member).listMessages());

  /** @type {Map<string, string>} */
  const memberNames = new Map();
  try {
    const members = /** @type {any[]} */ (await E(member).getMembers());
    for (const m of members) {
      memberNames.set(m.memberId, m.proposedName || m.invitedAs);
    }
  } catch {
    // not available
  }

  const shown = allMessages.slice(-count);
  const lines = shown.map(msg => {
    const author = memberNames.get(msg.memberId) || msg.memberId;
    const text = Array.isArray(msg.strings) ? msg.strings.join('') : '';
    const replyTag = msg.replyTo ? ` (reply to #${msg.replyTo})` : '';
    const preview = text.length > 300 ? `${text.slice(0, 300)}...` : text;
    return `[#${msg.number}] ${author}${replyTag}: ${preview}`;
  });

  return lines.join('\n');
};
harden(buildRecentHistory);

// ---------------------------------------------------------------------------
// Worker loop — three-layer orchestrator
// ---------------------------------------------------------------------------

/**
 * Spawn the agent loop. Uses three layers:
 * - Router: decides whether to engage
 * - Composer: generates response text (for channel mentions)
 * - Executor: performs capability operations
 *
 * @param {any} powers - agent guest powers
 * @param {Promise<object> | object | undefined} context
 * @param {{ host: string, model: string, authToken: string }} providerConfig
 * @param {string} [_systemPrompt] - unused, kept for driver.js compatibility
 * @param {{ host: string, model: string, authToken: string } | null} [fastProviderConfig] - optional fast model for routing decisions
 * @returns {Promise<void>}
 */
export const spawnWorkerLoop = async (
  powers,
  context,
  providerConfig,
  _systemPrompt,
  fastProviderConfig,
) => {
  const getCancelled = async () => {
    if (!context) return null;
    const resolvedContext = await context;
    if (!resolvedContext) return null;
    if (typeof resolvedContext.whenCancelled === 'function') {
      return E(resolvedContext).whenCancelled();
    }
    if (resolvedContext.cancelled) {
      return resolvedContext.cancelled;
    }
    return null;
  };

  const provider = createProvider({
    LAL_HOST: providerConfig.host,
    LAL_MODEL: providerConfig.model,
    LAL_AUTH_TOKEN: providerConfig.authToken,
  });

  // Optional fast provider for lightweight decisions (routing, triage)
  const fastProvider = fastProviderConfig
    ? createProvider({
        LAL_HOST: fastProviderConfig.host,
        LAL_MODEL: fastProviderConfig.model,
        LAL_AUTH_TOKEN: fastProviderConfig.authToken,
      })
    : null;

  if (fastProvider) {
    console.log(
      `[jaine] Fast provider: ${fastProviderConfig.host} / ${fastProviderConfig.model}`,
    );
  }

  // Create the three layers — router uses fast provider if available
  const router = await makeRouter(powers, fastProvider || provider);
  // Default executor for inbox messages (full powers)
  const inboxExecutor = makeExecutor(powers, provider);
  const inboxComposer = makeComposer(provider, intent =>
    inboxExecutor.execute(intent),
  );

  /**
   * Create a channel-scoped composer+executor pair for a specific member.
   * The exec tool is scoped to the member handle, maintaining proper
   * pedigree chains and preventing cross-channel access.
   *
   * @param {object} member - Jaine's channel member handle
   * @param {string} channelName - petname of the channel
   * @returns {{ composer: { compose: Function }, executor: { execute: Function } }}
   */
  const makeChannelLayers = (member, channelName) => {
    const channelExecutor = makeExecutor(powers, provider, {
      member,
      channelName,
    });
    const channelComposer = makeComposer(provider, intent =>
      channelExecutor.execute(intent),
    );
    return { composer: channelComposer, executor: channelExecutor };
  };

  /** @type {Map<string, { composer: { compose: Function }, executor: { execute: Function } }>} */
  const channelLayers = new Map();

  // --- Channel watching ---

  /** @type {Map<string, boolean>} */
  const watchedChannels = new Map();
  /** Channel message numbers already handled by the mention flow. */
  /** @type {Set<string>} */
  const mentionHandledMessages = new Set();
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  /**
   * Watch a channel for new messages and route them through Layer 1.
   * Runs as a background loop — fire-and-forget via void.
   *
   * @param {string} channelName - petname for the channel
   * @param {string} channelId - canonical formula identifier
   * @param {object} member - channel member handle
   * @param {string | null} selfMemberId - own member ID to skip own msgs
   */
  const watchChannel = async (channelName, channelId, member, selfMemberId) => {
    console.log(`[jaine][watch] Watching ${channelName}`);

    // Initialize lastSeen to current latest to avoid replaying history
    let lastSeen = 0n;
    try {
      const msgs = /** @type {any[]} */ (await E(member).listMessages());
      if (msgs.length > 0) {
        lastSeen = BigInt(msgs[msgs.length - 1].number);
      }
    } catch {
      // start from 0
    }

    /** @type {Map<string, string>} */
    let memberNames = new Map();

    const refreshMemberNames = async () => {
      /** @type {Map<string, string>} */
      const names = new Map();
      try {
        const members = /** @type {any[]} */ (await E(member).getMembers());
        for (const mbr of members) {
          names.set(mbr.memberId, mbr.proposedName || mbr.invitedAs);
        }
      } catch {
        // keep existing
      }
      if (names.size > 0) memberNames = names;
    };

    const POLL_INTERVAL_MS = 5000;

    while (true) {
      await delay(POLL_INTERVAL_MS);

      try {
        await refreshMemberNames();
        const messages = /** @type {any[]} */ (await E(member).listMessages());

        const newMessages = messages.filter(
          msg => BigInt(msg.number) > lastSeen,
        );
        if (newMessages.length === 0) continue;
        lastSeen = BigInt(newMessages[newMessages.length - 1].number);

        for (const msg of newMessages) {
          if (
            selfMemberId != null &&
            String(msg.memberId) === String(selfMemberId)
          ) {
            continue;
          }
          // Skip messages already handled by the inbox mention flow
          if (mentionHandledMessages.has(String(msg.number))) continue;

          const authorName = memberNames.get(msg.memberId) || msg.memberId;

          // Build recent context for routing (last 10 messages)
          const msgIdx = messages.indexOf(msg);
          const contextMsgs = messages.slice(Math.max(0, msgIdx - 10), msgIdx);
          const recentContext = contextMsgs
            .map(cm => {
              const name = memberNames.get(cm.memberId) || cm.memberId;
              const text = Array.isArray(cm.strings) ? cm.strings.join('') : '';
              const preview =
                text.length > 200 ? `${text.slice(0, 200)}...` : text;
              return `${name}: ${preview}`;
            })
            .join('\n');

          const decision = await router.routeChannelMessage(
            msg,
            channelId,
            recentContext,
            authorName,
          );

          console.log(
            `[jaine][watch] ${channelName} #${msg.number} by ${authorName}: ` +
              `${decision.shouldEngage ? 'engage' : 'pass'} — ${decision.reason}`,
          );

          // Handle participation change
          if (decision.participationChange) {
            router.setParticipation(
              channelId,
              decision.participationChange.level,
            );
            if (decision.participationChange.acknowledgment) {
              try {
                await E(member).post(
                  [decision.participationChange.acknowledgment],
                  [],
                  [],
                  String(msg.number),
                );
              } catch {
                // best effort
              }
            }
          }

          // Compose and post response using channel-scoped layers
          if (decision.shouldEngage) {
            try {
              if (!channelLayers.has(channelId)) {
                channelLayers.set(
                  channelId,
                  makeChannelLayers(member, channelName),
                );
              }
              const layers =
                /** @type {{ composer: { compose: Function } }} */ (
                  channelLayers.get(channelId)
                );
              await handleChannelResponse(layers.composer, member, msg);
            } catch (err) {
              console.error(
                `[jaine][watch] Response error in ${channelName}:`,
                err instanceof Error ? err.message : String(err),
              );
            }
          }
        }
      } catch (err) {
        console.error(
          `[jaine][watch] Poll error in ${channelName}:`,
          err instanceof Error ? err.message : String(err),
        );
        await delay(10000);
      }
    }
  };

  /**
   * Resolve our own member ID for a channel member handle.
   * Tries getMemberId() first, falls back to searching the members list.
   *
   * @param {object} member - channel member handle
   * @param {string} joinName - the invitedAs name we joined with
   * @returns {Promise<string | null>}
   */
  const resolveSelfMemberId = async (member, joinName) => {
    // Primary: ask the member handle directly
    try {
      const id = await E(member).getMemberId();
      if (id != null) return String(id);
    } catch {
      // not available on this handle
    }
    // Fallback: search the members list
    try {
      const members = /** @type {any[]} */ (await E(member).getMembers());
      for (const mbr of members) {
        if (mbr.invitedAs === joinName || mbr.proposedName === joinName) {
          return String(mbr.memberId);
        }
      }
    } catch {
      // not available
    }
    return null;
  };

  // --- Reconnect to previously joined channels ---

  try {
    const allNames = /** @type {string[]} */ (await E(powers).list());
    const channelNames = allNames.filter(name => /^ch-\d+$/.test(name));

    for (const chName of channelNames) {
      try {
        const ch = await E(powers).lookup(chName);
        const member = await E(ch).join('jaine');
        const channelId = await E(powers).identify(chName);

        if (!watchedChannels.has(channelId)) {
          watchedChannels.set(channelId, true);
          const selfMemberId = await resolveSelfMemberId(member, 'jaine');
          console.log(
            `[jaine] Channel ${chName}: selfMemberId=${selfMemberId}`,
          );
          void watchChannel(chName, channelId, member, selfMemberId);
        }
      } catch (chErr) {
        console.error(
          `[jaine] Failed to reconnect to ${chName}:`,
          chErr instanceof Error ? chErr.message : String(chErr),
        );
      }
    }

    if (watchedChannels.size > 0) {
      console.log(`[jaine] Reconnected to ${watchedChannels.size} channel(s)`);
    }
  } catch (scanErr) {
    console.error(
      '[jaine] Failed to scan for channels:',
      scanErr instanceof Error ? scanErr.message : String(scanErr),
    );
  }

  // --- Main loop ---

  const cancelled = await getCancelled();
  const cancelledSignal = cancelled
    ? cancelled.then(
        () => ({ cancelled: true }),
        () => ({ cancelled: true }),
      )
    : null;

  await E(powers).send('@host', ['Jaine agent ready.'], [], []);

  const messageIterator = makeRefIterator(E(powers).followMessages());
  while (true) {
    const nextMessage = messageIterator.next();
    const raced = cancelledSignal
      ? await Promise.race([
          cancelledSignal,
          nextMessage.then(result => ({ cancelled: false, result })),
        ])
      : { cancelled: false, result: await nextMessage };
    if (raced.cancelled) {
      try {
        await messageIterator.return?.();
      } catch {
        // ignore
      }
      break;
    }
    const { value: message, done } = raced.result;
    if (done) break;

    const { number } = /** @type {any} */ (message);
    const msgNum = BigInt(number);

    // Layer 1: Route the message
    const decision = router.route(message);
    if (decision.action === 'ignore') {
      if (decision.reason !== 'own message') {
        console.log(`[jaine] Ignoring #${number}: ${decision.reason}`);
      }
      continue;
    }

    console.log(
      `[jaine] Engaging with #${number}${decision.mentionInfo ? ' (mention)' : ''}`,
    );

    try {
      if (decision.mentionInfo) {
        // Mark the channel message so the watcher doesn't re-process it
        mentionHandledMessages.add(decision.mentionInfo.replyTo);
        // ---- Channel mention flow: Router → Composer → Executor ----
        // handleMention joins the channel and returns the member handle.
        // We use a two-pass approach: first join to get the member, then
        // create channel-scoped layers for the composer/executor.
        const mentionResult = await handleMention(
          powers,
          null, // composer supplied after we get the member handle
          decision.textContent,
          decision.mentionInfo,
          number,
          msgNum,
        );

        // Start watching this channel if not already, and compose
        // the response using channel-scoped layers
        if (mentionResult) {
          try {
            const channelId = await E(powers).identify(
              mentionResult.channelName,
            );
            if (!channelLayers.has(channelId)) {
              channelLayers.set(
                channelId,
                makeChannelLayers(
                  mentionResult.member,
                  mentionResult.channelName,
                ),
              );
            }

            // Now compose the response with channel-scoped executor
            const layers = /** @type {{ composer: { compose: Function } }} */ (
              channelLayers.get(channelId)
            );
            await mentionResult.compose(layers.composer);

            if (!watchedChannels.has(channelId)) {
              watchedChannels.set(channelId, true);
              const selfMemberId = await resolveSelfMemberId(
                mentionResult.member,
                decision.mentionInfo.join,
              );
              console.log(
                `[jaine] Channel ${mentionResult.channelName}: selfMemberId=${selfMemberId}`,
              );
              void watchChannel(
                mentionResult.channelName,
                channelId,
                mentionResult.member,
                selfMemberId,
              );
            }
          } catch (watchErr) {
            console.error(
              '[jaine] Failed to start channel watcher:',
              watchErr instanceof Error ? watchErr.message : String(watchErr),
            );
          }
        }
      } else {
        // ---- General inbox flow: direct to Executor (full powers) ----
        await handleInbox(
          powers,
          inboxExecutor,
          provider,
          decision.textContent,
          number,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('[jaine] Error handling message:', errorMessage);
      try {
        await E(powers).reply(number, [errorMessage], [], []);
      } catch {
        // best effort
      }
    }

    // Auto-dismiss so the message isn't replayed on restart
    try {
      await E(powers).dismiss(number);
    } catch {
      // best effort — dismiss may fail if already dismissed
    }
  }
};
harden(spawnWorkerLoop);

// ---------------------------------------------------------------------------
// Channel mention handler
// ---------------------------------------------------------------------------

/**
 * @typedef {object} MentionResult
 * @property {object} member - channel member handle
 * @property {string} channelName - petname for the channel
 * @property {(scopedComposer: { compose: Function }) => Promise<void>} compose
 *   - call with a channel-scoped composer to complete the response
 */

/**
 * Handle a channel mention: join channel, post placeholder, pre-fetch
 * context. Returns a result with a `compose` callback that the caller
 * invokes with a channel-scoped composer (ensuring the exec tool is
 * scoped to Jaine's member handle, not raw powers).
 *
 * @param {object} powers
 * @param {null} _composer - unused, kept for call-site compat
 * @param {string} textContent
 * @param {{ edge: string, join: string, replyTo: string }} mentionInfo
 * @param {bigint | number} messageNumber - inbox message number
 * @param {bigint} msgNum
 * @returns {Promise<MentionResult | null>}
 */
const handleMention = async (
  powers,
  _composer,
  textContent,
  mentionInfo,
  messageNumber,
  msgNum,
) => {
  // Pre-adopt the channel reference before anything else
  const chRefName = `ch-${messageNumber}`;
  try {
    await E(powers).adopt(msgNum, mentionInfo.edge, chRefName);
    console.log(`[jaine] Pre-adopted channel as ${chRefName}`);
  } catch (adoptErr) {
    console.error(
      `[jaine] Pre-adopt failed:`,
      adoptErr instanceof Error ? adoptErr.message : String(adoptErr),
    );
  }

  // Join the channel and get a member handle
  /** @type {object} */
  let member;
  try {
    const ch = await E(powers).lookup(chRefName);
    member = await E(ch).join(mentionInfo.join);
  } catch (joinErr) {
    console.error(
      `[jaine] Channel join failed:`,
      joinErr instanceof Error ? joinErr.message : String(joinErr),
    );
    // Fall back to inbox reply
    await E(powers).reply(
      messageNumber,
      ['Sorry, I could not access the channel.'],
      [],
      [],
    );
    return null;
  }

  // Post placeholder message and discover its number via listMessages
  /** @type {string | undefined} */
  let placeholderKey;
  try {
    await E(member).post(['Thinking...'], [], [], mentionInfo.replyTo);
    // Find the placeholder's message number from the end of the message list
    const msgs = /** @type {any[]} */ (await E(member).listMessages());
    if (msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      placeholderKey = String(last.number);
    }
    console.log(`[jaine] Posted placeholder #${placeholderKey}`);
  } catch (postErr) {
    console.error(
      `[jaine] Placeholder post failed:`,
      postErr instanceof Error ? postErr.message : String(postErr),
    );
    // Continue without placeholder — response will still be posted
  }

  /**
   * Update the placeholder message via edit.
   *
   * @param {string} text
   */
  const updatePlaceholder = async text => {
    if (placeholderKey === undefined) return;
    try {
      await E(member).post([text], [], [], placeholderKey, [], 'edit');
    } catch {
      // Best-effort status update
    }
  };

  // Pre-fetch thread context and recent channel history
  let threadContext = '';
  let recentHistory = '';
  try {
    await updatePlaceholder('Reading thread...');
    threadContext = await buildThreadContext(member, mentionInfo.replyTo);
    console.log(
      `[jaine] Thread context: ${threadContext.length} chars, ${threadContext.split('\n').length} messages`,
    );
  } catch (ctxErr) {
    console.error(
      `[jaine] Thread context fetch failed:`,
      ctxErr instanceof Error ? ctxErr.message : String(ctxErr),
    );
  }
  try {
    recentHistory = await buildRecentHistory(member);
    console.log(
      `[jaine] Recent history: ${recentHistory.length} chars, ${recentHistory.split('\n').length} messages`,
    );
  } catch (histErr) {
    console.error(
      `[jaine] Recent history fetch failed:`,
      histErr instanceof Error ? histErr.message : String(histErr),
    );
  }

  /**
   * Complete the response using a channel-scoped composer.
   * Called by the main loop after channel layers are created.
   *
   * @param {{ compose: Function }} scopedComposer
   */
  const compose = async scopedComposer => {
    await updatePlaceholder('Composing response...');
    const result = await scopedComposer.compose(
      threadContext,
      textContent,
      updatePlaceholder,
      recentHistory,
    );

    if (result.responseText) {
      await updatePlaceholder(result.responseText);
      console.log(
        `[jaine] Response posted (${result.responseText.length} chars)`,
      );
    } else {
      await updatePlaceholder('(No response generated)');
      console.log('[jaine] Composer returned empty response');
    }
  };

  return harden({ member, channelName: chRefName, compose });
};
harden(handleMention);

// ---------------------------------------------------------------------------
// Channel response handler (for watched channels)
// ---------------------------------------------------------------------------

/**
 * Compose and post a response to a channel message from the watcher.
 *
 * @param {{ compose: Function }} composer
 * @param {object} member - channel member handle
 * @param {object} triggerMsg - the channel message to respond to
 * @returns {Promise<void>}
 */
const handleChannelResponse = async (composer, member, triggerMsg) => {
  const replyToNum = String(triggerMsg.number);

  // Post placeholder as reply to the trigger message
  /** @type {string | undefined} */
  let placeholderKey;
  try {
    await E(member).post(['Thinking...'], [], [], replyToNum);
    const msgs = /** @type {any[]} */ (await E(member).listMessages());
    if (msgs.length > 0) {
      placeholderKey = String(msgs[msgs.length - 1].number);
    }
  } catch {
    // continue without placeholder
  }

  /** @param {string} text */
  const updatePlaceholder = async text => {
    if (placeholderKey === undefined) return;
    try {
      await E(member).post([text], [], [], placeholderKey, [], 'edit');
    } catch {
      // best effort
    }
  };

  // Build context
  let threadContext = '';
  try {
    threadContext = await buildThreadContext(member, replyToNum);
  } catch {
    // continue without
  }

  let recentHistory = '';
  try {
    recentHistory = await buildRecentHistory(member);
  } catch {
    // continue without
  }

  const msgText = Array.isArray(triggerMsg.strings)
    ? triggerMsg.strings.join('')
    : '';

  const result = await composer.compose(
    threadContext,
    msgText,
    updatePlaceholder,
    recentHistory,
  );

  if (result.responseText) {
    await updatePlaceholder(result.responseText);
    console.log(
      `[jaine][watch] Response posted (${result.responseText.length} chars)`,
    );
  } else if (placeholderKey !== undefined) {
    try {
      await E(member).post([''], [], [], placeholderKey, [], 'edit');
    } catch {
      // best effort
    }
  }
};
harden(handleChannelResponse);

// ---------------------------------------------------------------------------
// General inbox handler
// ---------------------------------------------------------------------------

/**
 * Handle a general inbox message using the executor directly.
 *
 * @param {object} powers
 * @param {{ execute: (intent: string) => Promise<object> }} executor
 * @param {{ chat: Function }} provider
 * @param {string} textContent
 * @param {bigint | number} messageNumber
 * @returns {Promise<void>}
 */
const handleInbox = async (
  powers,
  executor,
  provider,
  textContent,
  messageNumber,
) => {
  console.log(`[jaine] Handling inbox message #${messageNumber}`);

  // For general inbox messages, use the executor with its full tool set
  const outcome = await executor.execute(textContent);

  if (outcome.type === 'result' && outcome.value) {
    try {
      await E(powers).reply(messageNumber, [outcome.value], [], []);
      console.log(`[jaine] Replied to inbox #${messageNumber}`);
    } catch (replyErr) {
      console.error(
        `[jaine] Failed to reply:`,
        replyErr instanceof Error ? replyErr.message : String(replyErr),
      );
    }
  } else if (outcome.type === 'error') {
    try {
      await E(powers).reply(messageNumber, [outcome.message], [], []);
    } catch {
      // best effort
    }
  }
};
harden(handleInbox);

// ============================================================================
// Jaine Factory — Entry Point
// ============================================================================

/**
 * @param {any} guestPowers
 * @param {Promise<object> | object | undefined} _context
 * @returns {object}
 */
export const make = (guestPowers, _context) => {
  /** @type {any} */
  const powers = guestPowers;

  return makeExo('JaineFactory', JaineFactoryInterface, {
    /**
     * Create a new jaine agent instance.
     *
     * @param {string} name
     * @param {{ systemPrompt?: string, pin?: boolean }} [options]
     * @returns {Promise<string>}
     */
    async createAgent(name, options = {}) {
      const { systemPrompt: agentPrompt, pin = false } = options;
      const hostAgent = await E(powers).lookup('host-agent');
      const guestName = name;
      const agentName = `profile-for-${name}`;
      const driverHandleName = `${name}-driver-handle`;
      const driverProfileName = `profile-for-${driverHandleName}`;
      const driverSpecifier = new URL('driver.js', import.meta.url).href;

      // Create agent guest
      const hasAgent = await E(hostAgent).has(guestName);
      if (!hasAgent) {
        await E(hostAgent).provideGuest(guestName, { agentName });
      }

      // Create driver guest
      const hasDriver = await E(hostAgent).has(driverHandleName);
      if (!hasDriver) {
        await E(hostAgent).provideGuest(driverHandleName, {
          agentName: driverProfileName,
        });
      }

      // Write provider + agent refs into driver namespace
      const driverPowers = await E(hostAgent).lookup(driverProfileName);
      const providerId = await E(powers).identify('llm-provider');
      await E(driverPowers).storeIdentifier('llm-provider', providerId);

      // Propagate fast provider if configured
      try {
        const fastProviderId = await E(powers).identify('llm-provider-fast');
        if (fastProviderId) {
          await E(driverPowers).storeIdentifier(
            'llm-provider-fast',
            fastProviderId,
          );
        }
      } catch {
        // No fast provider configured — that's fine.
      }

      const agentLocator = await E(hostAgent).locate(agentName);
      const agentId = await E(hostAgent).identify(agentName);
      await E(driverPowers).storeIdentifier('agent', agentId);

      // Launch driver
      /** @type {Record<string, string>} */
      const env = {};
      if (agentPrompt) {
        env.JAINE_SYSTEM_PROMPT = agentPrompt;
      }
      const driverResultName = `${name}-driver`;
      const hasDriverAlready = await E(hostAgent).has(driverResultName);
      if (!hasDriverAlready) {
        await E(hostAgent).makeUnconfined('@main', driverSpecifier, {
          powersName: driverProfileName,
          resultName: driverResultName,
          env,
        });
      } else {
        console.log(
          `[jaine-factory] Driver "${driverResultName}" already running, skipping launch`,
        );
      }

      // Pin for restart survival
      if (pin) {
        const driverId = await E(hostAgent).identify(driverResultName);
        try {
          await E(hostAgent).storeIdentifier(
            ['@pins', driverResultName],
            driverId,
          );
        } catch {
          console.log(`[jaine-factory] Could not pin ${driverResultName}`);
        }
      }

      console.log(
        `[jaine-factory] Agent "${name}" created (profile: ${agentName})`,
      );
      return agentName;
    },

    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'JaineFactory: create stateless channel-mention agents. Use createAgent(name, { pin: true }).';
      }
      if (methodName === 'createAgent') {
        return 'createAgent(name, { systemPrompt?, pin? }) — create a new jaine agent instance.';
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
harden(make);
