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
 * @returns {Promise<void>}
 */
export const spawnWorkerLoop = async (
  powers,
  context,
  providerConfig,
  _systemPrompt,
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

  // Create the three layers
  const router = await makeRouter(powers);
  const executor = makeExecutor(powers, provider);
  const composer = makeComposer(provider, intent => executor.execute(intent));

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
        // ---- Channel mention flow: Router → Composer → Executor ----
        await handleMention(
          powers,
          composer,
          decision.textContent,
          decision.mentionInfo,
          number,
          msgNum,
        );
      } else {
        // ---- General inbox flow: direct to Executor ----
        await handleInbox(
          powers,
          executor,
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
 * Handle a channel mention: post placeholder, pre-fetch context, compose,
 * and edit the placeholder with the final response.
 *
 * @param {object} powers
 * @param {{ compose: Function }} composer
 * @param {string} textContent
 * @param {{ edge: string, join: string, replyTo: string }} mentionInfo
 * @param {bigint | number} messageNumber - inbox message number
 * @param {bigint} msgNum
 * @returns {Promise<void>}
 */
const handleMention = async (
  powers,
  composer,
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
    return;
  }

  // Post placeholder message and discover its number via listMessages
  /** @type {string | undefined} */
  let placeholderKey;
  try {
    await E(member).post(
      ['Thinking...'],
      [],
      [],
      mentionInfo.replyTo,
    );
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
      await E(member).post(
        [text],
        [],
        [],
        placeholderKey,
        [],
        'edit',
      );
    } catch {
      // Best-effort status update
    }
  };

  // Pre-fetch thread context
  let threadContext = '';
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

  // Compose the response
  await updatePlaceholder('Composing response...');
  const result = await composer.compose(
    threadContext,
    textContent,
    updatePlaceholder,
  );

  // Final edit with the response
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
harden(handleMention);

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
      await E(driverPowers).write('llm-provider', providerId);

      const agentLocator = await E(hostAgent).locate(agentName);
      const agentId = await E(hostAgent).identify(agentName);
      await E(driverPowers).write('agent', agentId);

      // Launch driver
      /** @type {Record<string, string>} */
      const env = {};
      if (agentPrompt) {
        env.JAINE_SYSTEM_PROMPT = agentPrompt;
      }
      const driverResultName = `${name}-driver`;
      await E(hostAgent).makeUnconfined('@main', driverSpecifier, {
        powersName: driverProfileName,
        resultName: driverResultName,
        env,
      });

      // Pin for restart survival
      if (pin) {
        const driverId = await E(hostAgent).identify(driverResultName);
        try {
          await E(hostAgent).write(['@pins', driverResultName], driverId);
        } catch {
          console.log(
            `[jaine-factory] Could not pin ${driverResultName}`,
          );
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
