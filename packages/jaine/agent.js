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
// System prompt — concise, prescriptive, no room for analysis paralysis
// ---------------------------------------------------------------------------

const defaultSystemPrompt = `\
You are Jaine, a stateless channel agent. Each message you receive is \
independent — you have no memory of prior messages.

## Rules
1. When a message includes exec() code, run it exactly as given. Replace \
YOUR_REPLY with a concise, conversational response. Replace YOUR_NAME \
with "jaine".
2. ONLY post your conversational reply to channels. Never post reasoning, \
steps, logs, recaps, or code.
3. reply() is for private inbox responses. exec() is for channel posts.
4. References labeled "(author)" are attributions — do not adopt them.
5. Use readChannel to see channel history with message IDs if you need context.

## Tools
- **exec** — Run JavaScript with powers, E, harden. For channel posts.
- **readChannel** — Read channel transcript with message IDs and authors.
- **reply** — Private inbox reply by message number.
- **adopt** — Store a message reference under a pet name.
- **lookup** — Retrieve a value by pet name.
- **list** — List stored pet names.
- **send** — Send unsolicited inbox message.
- **dismiss** — Dismiss a handled message.
`;

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
  const effectivePrompt = systemPrompt || defaultSystemPrompt;

  // Built-in tools — only the essentials
  /** @type {Map<string, object>} */
  const localTools = new Map();
  localTools.set('list', makeListPetnamesTool(powers));
  localTools.set('lookup', makeLookupTool(powers));
  localTools.set('adopt', makeAdoptTool(powers));
  localTools.set('exec', makeExecTool(powers));
  localTools.set('readChannel', makeReadChannelTool(powers));
  localTools.set('send', makeSendTool(powers));
  localTools.set('reply', makeReplyTool(powers));
  localTools.set('dismiss', makeDismissTool(powers));

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
   * Runs an agentic loop (tool calls may iterate) but starts
   * from scratch each time — no prior conversation history.
   *
   * @param {string} textContent - formatted message text
   * @param {bigint} messageNumber - inbox message number
   * @param {object[]} toolSchemas
   * @param {Map<string, object>} toolMap
   * @returns {Promise<void>}
   */
  const handleMessage = async (
    textContent,
    messageNumber,
    toolSchemas,
    toolMap,
  ) => {
    /** @type {object[]} */
    const conversation = [
      { role: 'system', content: effectivePrompt },
      { role: 'user', content: textContent },
    ];

    let toolWasCalled = false;
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

      const toolCalls = Array.isArray(rm.tool_calls) ? rm.tool_calls : [];
      if (toolCalls.length > 0) {
        toolWasCalled = true;
        const toolResults = await processToolCalls(toolCalls, toolMap);
        conversation.push(responseMessage);
        for (const tr of toolResults) {
          conversation.push(tr);
        }
        // Continue loop — LLM may want to call more tools
      } else {
        // Final text response — done
        if (rm.content) {
          console.log(`[jaine] final: ${rm.content}`);
        }
        break;
      }
    }

    // If no tool was called, the LLM just produced text.
    // Don't auto-reply — jaine is tool-driven.
    if (!toolWasCalled) {
      console.log('[jaine] No tools called, skipping auto-reply');
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

    // Skip own messages
    if (fromId === selfLocator) continue;

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

    // Discover tools
    const { schemas: toolSchemas, toolMap } = await discoverTools(
      powers,
      localTools,
    );

    try {
      await handleMessage(textContent, number, toolSchemas, toolMap);
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
