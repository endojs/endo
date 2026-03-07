// @ts-nocheck - E() generics don't work well with JSDoc types for remote objects
/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { passableAsJustin, makeMarshal } from '@endo/marshal';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
/** Same pattern as isSpecialName in packages/daemon/src/pet-name.js */
const specialNamePattern = /^[A-Z][A-Z0-9-]{0,127}$/;
import { createProvider } from '@endo/lal/providers/index.js';

import { discoverTools, executeTool } from './src/tools.js';
import {
  makeListPetnamesTool,
  makeLookupTool,
  makeStoreTool,
  makeRemoveTool,
  makeAdoptToolTool,
  makeSendTool,
  makeReplyTool,
  makeListMessagesTool,
  makeDismissTool,
} from './src/tool-makers.js';
import { extractToolCallsFromContent } from './src/extract-tool-calls.js';

const m = makeMarshal(undefined, undefined, {
  errorTagging: 'off',
  serializeBodyFormat: 'smallcaps',
});
const decodeSmallcaps = jsonString =>
  m.unserialize({ body: jsonString, slots: [] });

const FaeInterface = M.interface('Fae', {
  help: M.call().optional(M.string()).returns(M.string()),
});

const guestSystemPrompt = `\
You are Fae, an autonomous LLM agent running inside the Endo daemon as a guest \
caplet. You communicate with other agents and the HOST via messages.

Your tools are dynamic capabilities. Built-in tools for directory management and \
mail are always available, and new tools can appear at any time — for example, \
when you adopt a tool capability from an incoming mail message using \`adoptTool\`.

## Communication

You receive messages from other agents and the HOST. Use these tools to interact:

- **reply** — Reply to a message by number. The reply is automatically routed \
to the original sender. **Always prefer reply over send** when responding to \
an incoming message.
- **send** — Send a new (unsolicited) message to a named agent (e.g., "HOST")
- **listMessages** — List your inbox messages
- **dismiss** — Acknowledge and dismiss a message
- **adoptTool** — Adopt a capability from a message into your tools/ directory

## Petname Directory

You have a persistent directory of named references (petnames):

- **list** — See all stored petnames
- **lookup** — Retrieve a value by petname
- **store** — Persist a JSON value under a petname
- **remove** — Delete a petname

## Receiving New Tools

Tools are capability objects. You can receive new tools from other agents via \
mail. When a message contains a tool capability, use \`adoptTool\` to install it \
into your tools/ directory. Once adopted, the tool is immediately available — \
try it right away.

## Response Guidelines

- Use tools to accomplish requests. Do not fabricate results.
- For multi-step tasks, break them down and execute step by step.
- If a tool call fails, read the error and try a different approach.
- When done, use **reply** (not send) to respond to the sender with a concise summary.
- Always dismiss messages after handling them.
`;

/**
 * Spawn a worker loop that follows a guest's inbox and processes messages
 * using the given LLM configuration.
 *
 * @param {any} powers - Guest powers (manager's own or a sub-guest's)
 * @param {Promise<object> | object | undefined} context - Context for cancellation
 * @param {{ LAL_HOST?: string, LAL_MODEL?: string, LAL_AUTH_TOKEN?: string }} workerEnv - LLM provider config
 * @returns {Promise<void>}
 */
export const spawnWorkerLoop = async (powers, context, workerEnv) => {
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

  const provider = createProvider(workerEnv);

  /**
   * @param {object[]} messages
   * @param {object[]} toolSchemas
   * @returns {Promise<{message: object}>}
   */
  const chat = (messages, toolSchemas) => provider.chat(messages, toolSchemas);

  /** @type {object[]} */
  const transcript = [{ role: 'system', content: guestSystemPrompt }];

  // Built-in tools: petname ops + mail (no filesystem tools for guest)
  /** @type {Map<string, object>} */
  const localTools = new Map();
  localTools.set('list', makeListPetnamesTool(powers));
  localTools.set('lookup', makeLookupTool(powers));
  localTools.set('store', makeStoreTool(powers));
  localTools.set('remove', makeRemoveTool(powers));
  localTools.set('adoptTool', makeAdoptToolTool(powers));
  localTools.set('send', makeSendTool(powers));
  localTools.set('reply', makeReplyTool(powers));
  localTools.set('listMessages', makeListMessagesTool(powers));
  localTools.set('dismiss', makeDismissTool(powers));

  /**
   * Process tool calls from the LLM response.
   * Parses JSON arguments and encodes results with passableAsJustin.
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
        args = {};
      }

      console.log(`[tool] ${name}(${passableAsJustin(harden(args), false)})`);

      let result;
      try {
        result = await executeTool(name, args, toolMap);
        console.log(`[tool] ${name} -> ${passableAsJustin(result, false)}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result = harden({ error: errorMessage });
        console.error(`[tool] ${name} error: ${errorMessage}`);
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
   * Run the agentic loop for a single incoming message.
   * Re-discovers tools after any adoptTool call so newly adopted tools
   * are immediately available in the same turn.
   *
   * @param {object[]} initialSchemas
   * @param {Map<string, object>} initialToolMap
   * @returns {Promise<void>}
   */
  const runAgenticLoop = async (initialSchemas, initialToolMap) => {
    let currentSchemas = initialSchemas;
    let currentToolMap = initialToolMap;
    let continueLoop = true;
    while (continueLoop) {
      console.log(
        `[fae] ${JSON.stringify(transcript[transcript.length - 1], null, 2)}`,
      );
      const response = await chat(transcript, currentSchemas);

      const { message: responseMessage } = response;
      if (!responseMessage) {
        break;
      }

      const rm = /** @type {any} */ (responseMessage);
      if ((!rm.tool_calls || rm.tool_calls.length === 0) && rm.content) {
        const extracted = extractToolCallsFromContent(rm.content);
        if (extracted.toolCalls) {
          rm.tool_calls = extracted.toolCalls;
          rm.content = extracted.cleanedContent;
        }
      }

      transcript.push(responseMessage);
      console.log(
        `[fae] sent: ${JSON.stringify(transcript[transcript.length - 1], null, 2)}`,
      );

      const toolCalls = Array.isArray(rm.tool_calls) ? rm.tool_calls : [];
      if (toolCalls.length !== 0) {
        const toolResults = await processToolCalls(toolCalls, currentToolMap);
        console.log(
          `[fae] tool results: ${JSON.stringify(toolResults, null, 2)}`,
        );
        transcript.push(...toolResults);

        // Re-discover tools if adoptTool was called so the new tool
        // is available in the next iteration of this loop.
        const adopted = toolCalls.some(
          tc => /** @type {any} */ (tc).function?.name === 'adoptTool',
        );
        if (adopted) {
          const refreshed = await discoverTools(powers, localTools);
          currentSchemas = refreshed.schemas;
          currentToolMap = refreshed.toolMap;
          console.log(
            `[fae] Re-discovered tools after adoption: ${currentSchemas.length} available`,
          );
        }
      } else {
        continueLoop = false;
        if (rm.content) {
          console.log(`[fae] ${rm.content}`);
        }
      }
    }
  };

  /**
   * Initialize: move any introduced tool entries into the tools/ subdirectory.
   * Tools introduced via provideGuest's introducedNames appear at the top level.
   * We detect them by checking for the FaeTool interface (schema, execute, help).
   *
   * @returns {Promise<void>}
   */
  const initializeIntroducedTools = async () => {
    try {
      await E(powers).makeDirectory(['tools']);
    } catch {
      // Already exists.
    }

    try {
      const topNames = /** @type {string[]} */ (await E(powers).list());
      for (const name of topNames) {
        if (name === 'tools' || specialNamePattern.test(name)) {
          continue;
        }
        try {
          const entry = await E(powers).lookup([name]);
          await E(entry).schema();
          await E(entry).help();
          // Looks like a FaeTool — move it into tools/
          await E(powers).copy([name], ['tools', name]);
          await E(powers).remove(name);
          console.log(`[fae] Moved introduced tool "${name}" into tools/`);
        } catch {
          // Not a FaeTool; leave it alone.
        }
      }
    } catch {
      // list() failed; skip initialization.
    }
  };

  /**
   * Main agent loop: follow messages and process them.
   *
   * @returns {Promise<void>}
   */
  const runAgent = async () => {
    await initializeIntroducedTools();

    await E(powers).send('HOST', ['Fae agent ready.'], [], []);

    /** @type {string | undefined} */
    const selfId = await E(powers).identify('SELF');
    const cancelled = await getCancelled();
    const cancelledSignal = cancelled
      ? cancelled.then(
          () => ({ cancelled: true }),
          () => ({ cancelled: true }),
        )
      : null;

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
          // ignore iterator return errors on cancellation
        }
        break;
      }
      const { value: message, done } = raced.result;
      if (done) {
        break;
      }
      const {
        from: fromId,
        number,
        type,
        strings,
        names,
      } = /** @type {any} */ (message);

      if (fromId === selfId) {
        continue;
      }

      console.log(`[fae] New message #${number} from ${fromId}`);
      console.log(
        `[fae] Transcript has ${transcript.length} messages before processing`,
      );

      // Discover tools (picks up newly adopted tools each turn)
      const { schemas: toolSchemas, toolMap } = await discoverTools(
        powers,
        localTools,
      );

      let textContent;
      if (type === 'package' && Array.isArray(strings)) {
        const parts = [];
        const namesArray = Array.isArray(names) ? names : [];
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

      transcript.push({
        role: 'user',
        content: `[Inbox message #${number}] ${textContent}\n\nUse reply(messageNumber: ${number}, ...) to respond to this message.`,
      });

      try {
        await runAgenticLoop(toolSchemas, toolMap);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error('[fae] LLM error, notifying sender:', errorMessage);
        await E(powers).reply(number, [errorMessage], [], []);
      }
      console.log(
        `[fae] Transcript has ${transcript.length} messages after processing`,
      );
    }
  };

  // Start the worker loop
  await runAgent();
};
harden(spawnWorkerLoop);

// ============================================================================
// Manager / Entry Point
// ============================================================================

/**
 * Creates a Fae agent manager.
 *
 * Sends a configuration form to HOST on startup. Each form submission
 * creates a new guest profile and spawns a worker loop for it.
 *
 * @param {import('@endo/eventual-send').FarRef<object>} guestPowers
 * @param {Promise<object> | object | undefined} _context
 * @returns {object}
 */
export const make = (guestPowers, _context) => {
  /** @type {any} */
  const powers = guestPowers;

  // Send the configuration form to HOST for adding agents.
  const runManager = async () => {
    await E(powers).form(
      'HOST',
      'Add an agent',
      harden([
        { name: 'name', label: 'Agent name' },
        {
          name: 'host',
          label: 'API host',
          example: 'https://api.anthropic.com',
        },
        {
          name: 'model',
          label: 'Model name',
          example: 'claude-sonnet-4-6-20250514',
        },
        { name: 'authToken', label: 'API auth token' },
      ]),
    );

    // Resolve the host agent reference for provideGuest calls.
    const agent = await E(powers).lookup('host-agent');
    const selfId = await E(powers).identify('SELF');
    const activeWorkers = new Map();

    // Restore existing sub-agents from persisted config.
    const configSuffix = '-config';
    try {
      const allNames = /** @type {string[]} */ (await E(powers).list());
      for (const entryName of allNames) {
        if (!entryName.endsWith(configSuffix)) continue;
        const agentName = entryName.slice(0, -configSuffix.length);
        if (activeWorkers.has(agentName)) continue;
        try {
          const config =
            /** @type {{ host: string, model: string, authToken: string }} */ (
              await E(powers).lookup(entryName)
            );
          const guest = await E(agent).provideGuest(agentName, {
            agentName: `profile-for-${agentName}`,
          });
          const workerP = spawnWorkerLoop(guest, null, {
            LAL_HOST: config.host,
            LAL_MODEL: config.model,
            LAL_AUTH_TOKEN: config.authToken,
          });
          activeWorkers.set(agentName, workerP);
          workerP.catch(error => {
            console.error(
              `[fae] Restored worker "${agentName}" error:`,
              error,
            );
            activeWorkers.delete(agentName);
          });
          console.log(`[fae] Restored sub-agent "${agentName}"`);
        } catch (error) {
          console.error(
            `[fae] Failed to restore sub-agent "${agentName}":`,
            error,
          );
        }
      }
    } catch (error) {
      console.error('[fae] Failed to list names for restoration:', error);
    }

    // Pre-scan existing messages to find our latest form messageId so that
    // old value messages (from prior sessions) that reply to an earlier form
    // are not accidentally matched when the iterator replays history.
    /** @type {string | undefined} */
    let formMessageId;
    const existingMessages = /** @type {any[]} */ (
      await E(powers).listMessages()
    );
    for (const msg of existingMessages) {
      if (msg.from === selfId && msg.type === 'form') {
        formMessageId = msg.messageId;
      }
    }

    const messageIterator = makeRefIterator(E(powers).followMessages());
    while (true) {
      const { value: message, done } = await messageIterator.next();
      if (done) break;

      const msg = /** @type {any} */ (message);

      // Capture the form's messageId from our own outbound message.
      if (msg.from === selfId && msg.type === 'form') {
        formMessageId = msg.messageId;
        continue;
      }

      // Skip non-value messages and value messages not replying to our form.
      if (msg.type !== 'value') continue;
      if (msg.replyTo !== formMessageId) continue;

      try {
        // Resolve the submitted values from the value message.
        const config =
          /** @type {{ name: string, host: string, model: string, authToken: string }} */ (
            await E(powers).lookupById(msg.valueId)
          );

        const { name } = config;

        // Skip if a worker is already running for this name.
        if (activeWorkers.has(name)) {
          await E(powers).reply(
            msg.number,
            [`Agent "${name}" already exists.`],
            [],
            [],
          );
          continue;
        }

        // Create the guest profile via the host agent.
        // provideGuest returns the full EndoGuest (not the handle).
        const guest = await E(agent).provideGuest(name, {
          agentName: `profile-for-${name}`,
        });

        // Persist the agent config so it survives restarts.
        await E(powers).store(
          `${name}${configSuffix}`,
          harden({
            host: config.host,
            model: config.model,
            authToken: config.authToken,
          }),
        );

        // Spawn a worker loop for this guest.
        const workerP = spawnWorkerLoop(guest, null, {
          LAL_HOST: config.host,
          LAL_MODEL: config.model,
          LAL_AUTH_TOKEN: config.authToken,
        });
        activeWorkers.set(name, workerP);
        workerP.catch(error => {
          console.error(`[fae] Worker "${name}" error:`, error);
          activeWorkers.delete(name);
        });

        await E(powers).reply(
          msg.number,
          [`Agent "${name}" is now running.`],
          [],
          [],
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error('[fae] Form submission error:', errorMessage);
        try {
          await E(powers).reply(
            msg.number,
            [`Error creating agent: ${errorMessage}`],
            [],
            [],
          );
        } catch {
          // Best-effort reply.
        }
      }
    }
  };

  runManager().catch(error => {
    console.error('[fae] Manager error:', error);
  });

  return makeExo('Fae', FaeInterface, {
    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'Fae agent manager. Submit the configuration form to add agents.';
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
