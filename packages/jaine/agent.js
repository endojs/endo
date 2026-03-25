// @ts-nocheck - E() generics don't work well with JSDoc types for remote objects
/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { passableAsJustin, makeMarshal } from '@endo/marshal';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { createProvider } from '@endo/lal/providers/index.js';

import {
  makeAdoptTool,
  makeExecTool,
  makeReadChannelTool,
  makeLookupTool,
  makeListPetnamesTool,
  makeReplyTool,
  makeSendTool,
  makeDismissTool,
} from '@endo/fae/src/tool-makers.js';
import { discoverTools, executeTool } from '@endo/fae/src/tools.js';
import { extractToolCallsFromContent } from '@endo/fae/src/extract-tool-calls.js';

const m = makeMarshal(undefined, undefined, {
  errorTagging: 'off',
  serializeBodyFormat: 'smallcaps',
});
const decodeSmallcaps = jsonString =>
  m.unserialize({ body: jsonString, slots: [] });

const JaineFactoryInterface = M.interface('JaineFactory', {
  createAgent: M.callWhen(M.string()).optional(M.record()).returns(M.string()),
  help: M.call().optional(M.string()).returns(M.string()),
});

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

/** Minimal prompt for the common mention-reply case. */
const mentionSystemPrompt = `\
You are Jaine, a channel agent. Someone mentioned you in a thread.
Call channelReply with your response. Keep it concise and conversational.
If you need more context, use readChannel first.`;

/** Full prompt for general inbox messages. */
const defaultSystemPrompt = `\
You are Jaine, a stateless channel agent. Each message is independent.
When a message includes exec() code, run it. Replace placeholders.
reply() is for private inbox responses. exec() is for code execution.`;

// ---------------------------------------------------------------------------
// Mention detection — parse the structured metadata from notifications
// ---------------------------------------------------------------------------

/**
 * Parse channel-reply-info from a mention notification.
 * Returns null if the message is not a mention notification.
 *
 * @param {string} text
 * @returns {{ edge: string, join: string, replyTo: string } | null}
 */
const parseMentionInfo = text => {
  const match = text.match(
    /\[channel-reply-info:\s*edge=(\S+)\s+join=(\S+)\s+replyTo=(\S+)\]/,
  );
  if (!match) return null;
  return harden({ edge: match[1], join: match[2], replyTo: match[3] });
};
harden(parseMentionInfo);

// ---------------------------------------------------------------------------
// Worker loop — stateless per-message
// ---------------------------------------------------------------------------

/**
 * Spawn the agent loop. Each incoming message gets a fresh LLM call
 * with just the system prompt + that message + tools.
 *
 * @param {any} powers
 * @param {Promise<object> | object | undefined} context
 * @param {{ host: string, model: string, authToken: string }} providerConfig
 * @param {string} [systemPrompt]
 * @returns {Promise<void>}
 */
export const spawnWorkerLoop = async (
  powers,
  context,
  providerConfig,
  systemPrompt,
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

  const chat = (messages, toolSchemas) => provider.chat(messages, toolSchemas);

  // Built-in tools — full set for general messages
  /** @type {Map<string, object>} */
  const allTools = new Map();
  allTools.set('list', makeListPetnamesTool(powers));
  allTools.set('lookup', makeLookupTool(powers));
  allTools.set('adopt', makeAdoptTool(powers));
  allTools.set('exec', makeExecTool(powers));
  allTools.set('readChannel', makeReadChannelTool(powers));
  allTools.set('send', makeSendTool(powers));
  allTools.set('reply', makeReplyTool(powers));
  allTools.set('dismiss', makeDismissTool(powers));

  // Timer tool — create/manage daemon-level timers
  const timerTool = harden({
    schema: () =>
      harden({
        type: 'function',
        function: {
          name: 'createTimer',
          description:
            'Create a recurring timer that sends tick messages to your inbox at a specified interval. Use for reminders and scheduled check-ins.',
          parameters: {
            type: 'object',
            properties: {
              petName: {
                type: 'string',
                description:
                  'Pet name to store the timer under (e.g. "my-reminder")',
              },
              intervalMinutes: {
                type: 'number',
                description: 'Interval in minutes between ticks',
              },
              label: {
                type: 'string',
                description:
                  'Human-readable label for the timer (e.g. "hourly-checkin")',
              },
            },
            required: ['petName', 'intervalMinutes'],
          },
        },
      }),
    execute: async args => {
      const petName = String(args.petName || '');
      const intervalMinutes = Number(args.intervalMinutes || 10);
      const label = String(args.label || petName);
      if (!petName) return 'Error: petName is required';
      const intervalMs = intervalMinutes * 60 * 1000;
      try {
        await E(powers).makeTimer(petName, intervalMs, label);
        return `Timer "${label}" created as "${petName}", firing every ${intervalMinutes} minutes.`;
      } catch (err) {
        return `Failed to create timer: ${err.message || err}`;
      }
    },
    help: () => 'Create a daemon-level recurring timer for scheduled messages.',
  });
  allTools.set('createTimer', timerTool);

  /**
   * Create a pre-bound channelReply tool for a specific mention.
   * The channel reference must already be adopted under chRefName.
   *
   * @param {string} chRefName - pet name of the pre-adopted channel ref
   * @param {string} joinName - invitedAs name for join()
   * @param {string} replyTo - channel message number to reply to
   * @returns {{ schema: () => object, execute: (args: Record<string, unknown>) => Promise<string> }}
   */
  const makeChannelReplyTool = (chRefName, joinName, replyTo) => {
    const schema = harden({
      type: 'function',
      function: {
        name: 'channelReply',
        description: 'Post your reply to the channel thread.',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Your reply text.',
            },
          },
          required: ['text'],
        },
      },
    });

    const execute = async args => {
      const text = String(args.text || '');
      if (!text) return 'Error: empty reply';

      const ch = await E(powers).lookup(chRefName);
      const me = await E(ch).join(joinName);
      await E(me).post([text], [], [], replyTo);
      return `Posted to channel (reply to #${replyTo})`;
    };

    return harden({ schema: () => schema, execute });
  };

  /**
   * Process tool calls from LLM response.
   *
   * @param {object[]} toolCalls
   * @param {Map<string, object>} toolMap
   * @returns {Promise<object[]>}
   */
  const processToolCalls = async (toolCalls, toolMap) => {
    /** @type {object[]} */
    const results = [];
    for (const toolCall of toolCalls) {
      const { name, arguments: argsRaw } = /** @type {any} */ (toolCall)
        .function;

      /** @type {Record<string, unknown>} */
      let args;
      try {
        const jsonString =
          typeof argsRaw === 'string' ? argsRaw : JSON.stringify(argsRaw);
        args = decodeSmallcaps(jsonString);
      } catch {
        try {
          const jsonString =
            typeof argsRaw === 'string' ? argsRaw : JSON.stringify(argsRaw);
          args = JSON.parse(jsonString);
        } catch {
          args = {};
        }
      }

      console.log(`[jaine][tool] ${name}(${passableAsJustin(harden(args), false)})`);

      let result;
      try {
        result = await executeTool(name, args, toolMap);
        console.log(`[jaine][tool] ${name} -> ${passableAsJustin(result, false)}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result = harden({ error: errorMessage });
        console.error(`[jaine][tool] ${name} error: ${errorMessage}`);
      }

      results.push({
        role: 'tool',
        content: passableAsJustin(result, false),
        tool_call_id: /** @type {any} */ (toolCall).id,
      });
    }
    return results;
  };

  /**
   * Handle a single message with a fresh LLM context.
   *
   * @param {string} textContent - formatted message text
   * @param {bigint} messageNumber - inbox message number
   * @param {object[]} toolSchemas
   * @param {Map<string, object>} toolMap
   * @param {string} prompt - system prompt to use
   * @returns {Promise<void>}
   */
  const handleMessage = async (
    textContent,
    messageNumber,
    toolSchemas,
    toolMap,
    prompt,
  ) => {
    /** @type {object[]} */
    const conversation = [
      { role: 'system', content: prompt },
      { role: 'user', content: textContent },
    ];

    let toolWasCalled = false;
    /** @type {string[]} */
    const thinkingParts = [];
    const maxIterations = 5;
    for (let i = 0; i < maxIterations; i += 1) {
      console.log(
        `[jaine] LLM call #${i + 1}, ${conversation.length} messages`,
      );
      const response = await chat(conversation, toolSchemas);
      const { message: responseMessage } = response;
      if (!responseMessage) break;

      const rm = /** @type {any} */ (responseMessage);

      // Extract tool calls from content if not in structured field
      if ((!rm.tool_calls || rm.tool_calls.length === 0) && rm.content) {
        const extracted = extractToolCallsFromContent(rm.content);
        if (extracted.toolCalls) {
          rm.tool_calls = extracted.toolCalls;
          rm.content = extracted.cleanedContent;
        }
      }

      // Collect text content for DM visibility
      if (rm.content) {
        thinkingParts.push(rm.content);
      }

      const toolCalls = Array.isArray(rm.tool_calls) ? rm.tool_calls : [];
      if (toolCalls.length > 0) {
        toolWasCalled = true;
        const toolResults = await processToolCalls(toolCalls, toolMap);
        conversation.push(responseMessage);
        for (const tr of toolResults) {
          conversation.push(tr);
        }
        // If a terminal tool (channelReply) was called, stop iterating
        // so the LLM doesn't call it again producing a duplicate reply.
        const calledNames = toolCalls.map(
          tc => /** @type {any} */ (tc).function?.name,
        );
        if (calledNames.includes('channelReply')) break;
        // Continue loop — LLM may want to call more tools
      } else {
        // Final text response — done
        if (rm.content) {
          console.log(`[jaine] final: ${rm.content}`);
        }
        break;
      }
    }

    // Send thinking/reasoning to the DM so the user has visibility.
    // Strip <think>...</think> tags and truncate to keep DMs readable.
    const maxThinkingLen = 500;
    let thinkingText = thinkingParts
      .join('\n\n')
      .replace(/<\/?think>/g, '')
      .trim();
    if (thinkingText.length > maxThinkingLen) {
      thinkingText = `${thinkingText.slice(0, maxThinkingLen)}…`;
    }
    if (thinkingText) {
      try {
        await E(powers).reply(messageNumber, [thinkingText], [], []);
        console.log(`[jaine] Replied to #${messageNumber} with thinking`);
      } catch (replyErr) {
        console.error(
          `[jaine] Failed to reply with thinking:`,
          replyErr instanceof Error ? replyErr.message : String(replyErr),
        );
      }
    } else if (!toolWasCalled) {
      console.log('[jaine] No tools called and no text, skipping reply');
    }
  };

  // --- Main loop ---

  const selfLocator = await E(powers).locate('@self');
  const cancelled = await getCancelled();
  const cancelledSignal = cancelled
    ? cancelled.then(
        () => ({ cancelled: true }),
        () => ({ cancelled: true }),
      )
    : null;

  await E(powers).send('@host', ['Jaine agent ready.'], [], []);

  /** @type {Set<bigint>} */
  const processedMessages = new Set();
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

    const {
      from: fromId,
      number,
      type,
      strings,
      names,
    } = /** @type {any} */ (message);

    // Skip own messages and already-processed messages
    if (fromId === selfLocator) continue;
    const msgNum = BigInt(number);
    if (processedMessages.has(msgNum)) {
      console.log(`[jaine] Skipping duplicate message #${number}`);
      continue;
    }
    processedMessages.add(msgNum);

    console.log(`[jaine] Message #${number} from ${fromId}`);

    // Format message text
    let textContent;
    const namesArray = Array.isArray(names) ? names : [];
    if (type === 'package' && Array.isArray(strings)) {
      const parts = [];
      for (let i = 0; i < strings.length; i += 1) {
        parts.push(strings[i]);
        if (i < namesArray.length) {
          parts.push(`@${namesArray[i]}`);
        }
      }
      textContent = parts.join('').trim();
    } else {
      textContent = `(${type || 'unknown'} message)`;
    }

    // Detect mention notifications and use streamlined flow
    const mentionInfo = parseMentionInfo(textContent);

    /** @type {object[]} */
    let toolSchemas;
    /** @type {Map<string, object>} */
    let toolMap;
    /** @type {string} */
    let prompt;

    if (mentionInfo) {
      // Mention notification — minimal tools for fast reply
      console.log(`[jaine] Mention detected: reply to #${mentionInfo.replyTo}`);

      // Pre-adopt the channel reference NOW, before the LLM runs
      // and before auto-dismiss removes the message.
      const chRefName = `ch-${number}`;
      try {
        await E(powers).adopt(msgNum, mentionInfo.edge, chRefName);
        console.log(`[jaine] Pre-adopted channel as ${chRefName}`);
      } catch (adoptErr) {
        console.error(
          `[jaine] Pre-adopt failed:`,
          adoptErr instanceof Error ? adoptErr.message : String(adoptErr),
        );
      }

      // Strip the metadata line from the text the LLM sees
      textContent = textContent
        .replace(/\[channel-reply-info:[^\]]+\]\n?/, '')
        .replace(/Use channelReply to respond\.\s*/, '')
        .trim();

      const replyTool = makeChannelReplyTool(
        chRefName,
        mentionInfo.join,
        mentionInfo.replyTo,
      );
      const readChannelTool = allTools.get('readChannel');

      toolMap = new Map();
      toolMap.set('channelReply', replyTool);
      if (readChannelTool) {
        toolMap.set('readChannel', readChannelTool);
      }

      toolSchemas = [replyTool.schema()];
      if (readChannelTool) {
        toolSchemas.push(readChannelTool.schema());
      }

      prompt = systemPrompt || mentionSystemPrompt;
    } else {
      // General message — full toolset
      textContent = `[Inbox message #${number}]\n\n${textContent}`;
      const discovered = await discoverTools(powers, allTools);
      toolSchemas = discovered.schemas;
      toolMap = discovered.toolMap;
      prompt = systemPrompt || defaultSystemPrompt;
    }

    try {
      await handleMessage(textContent, number, toolSchemas, toolMap, prompt);
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
