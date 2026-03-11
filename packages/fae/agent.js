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
import {
  makeConversationTree,
  makeEndoPetstoreBackend,
} from '@endo/conversation-tree';

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

const FaeFactoryInterface = M.interface('FaeFactory', {
  createAgent: M.callWhen(M.string()).optional(M.record()).returns(M.string()),
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
 * using the given LLM provider configuration.
 *
 * @param {any} powers - Guest powers (manager's own or a sub-guest's)
 * @param {Promise<object> | object | undefined} context - Context for cancellation
 * @param {{ host: string, model: string, authToken: string }} providerConfig - LLM provider config
 * @param {string} [systemPrompt] - Override system prompt (defaults to guestSystemPrompt)
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

  /**
   * @param {object[]} messages
   * @param {object[]} toolSchemas
   * @returns {Promise<{message: object}>}
   */
  const chat = (messages, toolSchemas) => provider.chat(messages, toolSchemas);

  const effectivePrompt = systemPrompt || guestSystemPrompt;
  const tree = makeConversationTree(makeEndoPetstoreBackend(powers));

  /**
   * Find or create the root node that carries the system prompt.
   *
   * @returns {Promise<string>} rootNodeId
   */
  const getOrCreateRoot = async () => {
    const roots = await tree.getRoots();
    if (roots.length > 0) {
      return roots[0].id;
    }
    const root = await tree.addNode(null, [
      { role: 'system', content: effectivePrompt },
    ]);
    return root.id;
  };

  const rootNodeIdP = getOrCreateRoot();

  // Built-in tools: petname ops + mail (no filesystem tools for guest)
  /** @type {Map<string, object>} */
  const localTools = new Map();
  localTools.set('list', makeListPetnamesTool(powers));
  localTools.set('lookup', makeLookupTool(powers));
  localTools.set('store', makeStoreTool(powers));
  localTools.set('remove', makeRemoveTool(powers));
  localTools.set('adoptTool', makeAdoptToolTool(powers));
  localTools.set('send', makeSendTool(powers));
  // Wrap the reply tool to track whether a reply was sent during
  // the current agentic loop iteration, so we can auto-reply if
  // the LLM outputs content without calling the tool.
  const replyTracker = { sent: false };
  const baseReplyTool = makeReplyTool(powers);
  localTools.set(
    'reply',
    harden({
      schema: () => baseReplyTool.schema(),
      async execute(/** @type {any} */ args) {
        replyTracker.sent = true;
        return baseReplyTool.execute(args);
      },
      help: () => baseReplyTool.help(),
    }),
  );
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
   * The context snapshot is rebuilt from the tree on each LLM call so
   * that newly appended nodes are always included.
   *
   * @param {object[]} initialSchemas
   * @param {Map<string, object>} initialToolMap
   * @param {string} leafNodeId - the node to continue from
   * @returns {Promise<string>} the final leaf node ID after the loop completes
   */
  const runAgenticLoop = async (initialSchemas, initialToolMap, leafNodeId) => {
    let currentSchemas = initialSchemas;
    let currentToolMap = initialToolMap;
    let currentLeafId = leafNodeId;
    /** @type {boolean} */
    let continueLoop = true;
    while (continueLoop) {
      const context = await tree.getPath(currentLeafId);
      console.log(
        `[fae] context has ${context.length} messages, sending to LLM`,
      );
      const response = await chat(context, currentSchemas);

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

      console.log(
        `[fae] sent: ${JSON.stringify(responseMessage, null, 2)}`,
      );

      const toolCalls = Array.isArray(rm.tool_calls) ? rm.tool_calls : [];
      if (toolCalls.length !== 0) {
        const toolResults = await processToolCalls(toolCalls, currentToolMap);
        console.log(
          `[fae] tool results: ${JSON.stringify(toolResults, null, 2)}`,
        );

        // Store the assistant response + tool results as a single tree node.
        const stepNode = await tree.addNode(
          currentLeafId,
          [responseMessage, ...toolResults],
        );
        currentLeafId = stepNode.id;

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
        // Final assistant response — store as a tree node.
        const finalNode = await tree.addNode(currentLeafId, [responseMessage]);
        currentLeafId = finalNode.id;
        continueLoop = false;
        if (rm.content) {
          console.log(`[fae] ${rm.content}`);
        }
      }
    }
    return currentLeafId;
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

    // Track the most recent leaf across messages so that follow-up
    // messages from the same sender continue the conversation rather
    // than branching from the root (which would lose all context).
    let lastLeafId = await rootNodeIdP;

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

      const {
        messageId,
        replyTo,
      } = /** @type {any} */ (message);

      const rootNodeId = await rootNodeIdP;

      console.log(`[fae] New message #${number} from ${fromId}`);

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

      // Determine the parent node for this message:
      //  1. If replyTo matches a node in the tree, branch from there
      //  2. Otherwise continue from the last leaf (preserves context)
      let parentId = lastLeafId;
      if (typeof replyTo === 'string') {
        const existingNode = await tree.getNode(replyTo);
        if (existingNode !== null) {
          parentId = replyTo;
        }
      }

      const userNode = await tree.addNode(
        parentId,
        [
          {
            role: 'user',
            content: `[Inbox message #${number}] ${textContent}\n\nUse reply(messageNumber: ${number}, ...) to respond to this message.`,
          },
        ],
        { messageId },
      );

      try {
        replyTracker.sent = false;
        lastLeafId = await runAgenticLoop(toolSchemas, toolMap, userNode.id);

        // If the LLM produced a final response without calling the reply
        // tool, send the content as a fallback reply so the sender
        // (e.g. a Whylip UI) actually receives it.
        if (!replyTracker.sent) {
          const finalNode = await tree.getNode(lastLeafId);
          if (finalNode) {
            const lastMsg = finalNode.messages[finalNode.messages.length - 1];
            if (
              lastMsg &&
              lastMsg.role === 'assistant' &&
              lastMsg.content
            ) {
              console.log('[fae] No reply tool called, sending fallback reply');
              await E(powers).reply(
                number,
                [lastMsg.content],
                [],
                [],
              );
            }
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error('[fae] LLM error, notifying sender:', errorMessage);
        await E(powers).reply(number, [errorMessage], [], []);
      }
    }
  };

  // Start the worker loop
  await runAgent();
};
harden(spawnWorkerLoop);

// ============================================================================
// Fae Factory — Entry Point
// ============================================================================

/**
 * Creates a Fae factory that provisions and manages agent instances.
 *
 * Reads `llm-provider` from its petstore for the LLM configuration.
 * Restores previously created agents on restart, and exposes a
 * `createAgent(name, options)` method for creating new ones.
 *
 * @param {import('@endo/eventual-send').FarRef<object>} guestPowers
 * @param {Promise<object> | object | undefined} _context
 * @returns {Promise<object>}
 */
export const make = async (guestPowers, _context) => {
  /** @type {any} */
  const powers = guestPowers;

  const providerConfig =
    /** @type {{ host: string, model: string, authToken: string }} */ (
      await E(powers).lookup('llm-provider')
    );

  const hostAgent = await E(powers).lookup('host-agent');
  const activeWorkers = new Map();
  const configSuffix = '-config';

  // Restore existing sub-agents from persisted config.
  try {
    const allNames = /** @type {string[]} */ (await E(powers).list());
    for (const entryName of allNames) {
      if (!entryName.endsWith(configSuffix)) continue;
      const agentName = entryName.slice(0, -configSuffix.length);
      if (activeWorkers.has(agentName)) continue;
      const guestName = agentName;
      try {
        const config = /** @type {{ systemPrompt?: string }} */ (
          await E(powers).lookup(entryName)
        );
        const guest = await E(hostAgent).provideGuest(guestName, {
          agentName: `profile-for-${guestName}`,
        });
        const workerP = spawnWorkerLoop(
          guest,
          null,
          providerConfig,
          config.systemPrompt,
        );
        activeWorkers.set(agentName, workerP);
        workerP.catch(error => {
          console.error(
            `[fae-factory] Restored worker "${agentName}" error:`,
            error,
          );
          activeWorkers.delete(agentName);
        });
        console.log(`[fae-factory] Restored sub-agent "${agentName}"`);
      } catch (error) {
        console.error(
          `[fae-factory] Failed to restore sub-agent "${agentName}":`,
          error,
        );
      }
    }
  } catch (error) {
    console.error('[fae-factory] Failed to list names for restoration:', error);
  }

  return makeExo('FaeFactory', FaeFactoryInterface, {
    /**
     * Create a new agent instance with its own guest, conversation tree,
     * and worker loop.
     *
     * @param {string} name - Unique name for this agent
     * @param {object} [options]
     * @param {string} [options.systemPrompt] - Override system prompt
     * @returns {Promise<string>} The agent's profile petname
     */
    async createAgent(name, options = {}) {
      const { systemPrompt } = /** @type {{ systemPrompt?: string }} */ (
        options
      );

      if (activeWorkers.has(name)) {
        throw new Error(`Agent "${name}" already exists.`);
      }

      const guestName = name;
      const profileName = `profile-for-${guestName}`;
      const guest = await E(hostAgent).provideGuest(guestName, {
        agentName: profileName,
      });

      await E(powers).storeValue(
        harden({
          systemPrompt: systemPrompt || undefined,
        }),
        `${name}${configSuffix}`,
      );

      const workerP = spawnWorkerLoop(
        guest,
        null,
        providerConfig,
        systemPrompt,
      );
      activeWorkers.set(name, workerP);
      workerP.catch(error => {
        console.error(`[fae-factory] Worker "${name}" error:`, error);
        activeWorkers.delete(name);
      });

      console.log(`[fae-factory] Created agent "${name}"`);
      return profileName;
    },

    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'Fae factory: creates LLM agent instances bound to a configured LLM provider. Use createAgent(name, { systemPrompt }) to create a new agent.';
      }
      if (methodName === 'createAgent') {
        return 'createAgent(name, { systemPrompt? }) — Create a new agent with its own guest and worker loop. Returns the profile petname.';
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
harden(make);
