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
  makeAdoptTool,
  makeSendTool,
  makeReplyTool,
  makeListMessagesTool,
  makeDismissTool,
  makeExecTool,
  makeReadChannelTool,
} from './src/tool-makers.js';
import { extractToolCallsFromContent } from './src/extract-tool-calls.js';

/** Same pattern as isSpecialName in packages/daemon/src/pet-name.js */
const specialNamePattern = /^[A-Z][A-Z0-9-]{0,127}$/;

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
You are Fae, an autonomous agent inside the Endo daemon.

## Rules
1. When a message contains code to run, use exec() to run it. Copy the code \
from the message — do not rewrite or add to it.
2. Channel notifications include ready-to-use exec code. Run it with ONLY \
your conversational reply as the post content. Never post internal \
reasoning, steps, logs, or recaps to a channel.
3. reply() sends a PRIVATE inbox message. It does NOT post to channels.
4. References labeled "(author)" are attributions — do not adopt them.
5. Keep channel posts concise and conversational — one or two sentences.

## Tools
- **exec** — Run JavaScript with powers, E, harden. Use for multi-step tasks.
- **reply** — Private inbox reply to sender by message number.
- **adopt** — Store a message reference under a pet name.
- **list/lookup/store/remove** — Manage your pet name directory.
- **send** — Send unsolicited inbox message to a named agent.
- **adoptTool** — Install a FaeTool capability from a message.
- **dismiss** — Dismiss a handled message.

## Channel Mentions
When mentioned in a channel, the notification includes exec() code. \
Run it exactly as given, replacing YOUR_REPLY with your response and \
YOUR_NAME with "fae". Example:
  exec({ code: "const ch = await E(powers).lookup('channel-name');\\n\
const me = await E(ch).join('fae');\\n\
await E(me).post(['Hello!'], [], [], '42');\\n\
return 'done';" })
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
   * If the system prompt has changed since the last root was created,
   * start a fresh conversation tree so old messages with stale
   * instructions don't confuse the LLM.
   *
   * @returns {Promise<string>} rootNodeId
   */
  const getOrCreateRoot = async () => {
    const roots = await tree.getRoots();
    if (roots.length > 0) {
      const existingRoot = await tree.getNode(roots[0].id);
      if (existingRoot) {
        const rootMsg = existingRoot.messages[0];
        if (rootMsg && rootMsg.content === effectivePrompt) {
          return roots[0].id;
        }
        // System prompt changed — start fresh
        console.log(
          '[fae] System prompt changed, creating fresh conversation tree',
        );
      }
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
  localTools.set('adopt', makeAdoptTool(powers));
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
  localTools.set('exec', makeExecTool(powers));
  localTools.set('readChannel', makeReadChannelTool(powers));

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
        // Smallcaps decoding failed — try plain JSON parse
        try {
          const jsonString =
            typeof argsRaw === 'string' ? argsRaw : JSON.stringify(argsRaw);
          args = JSON.parse(jsonString);
        } catch {
          args = {};
        }
      }

      console.log(`[tool] ${name}(${passableAsJustin(harden(args), false)})`);
      replyTracker.anyToolCalled = true;

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

      console.log(`[fae] sent: ${JSON.stringify(responseMessage, null, 2)}`);

      const toolCalls = Array.isArray(rm.tool_calls) ? rm.tool_calls : [];
      if (toolCalls.length !== 0) {
        const toolResults = await processToolCalls(toolCalls, currentToolMap);
        console.log(
          `[fae] tool results: ${JSON.stringify(toolResults, null, 2)}`,
        );

        // Store the assistant response + tool results as a single tree node.
        const stepNode = await tree.addNode(currentLeafId, [
          responseMessage,
          ...toolResults,
        ]);
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

    await E(powers).send('@host', ['Fae agent ready.'], [], []);

    /** @type {string | undefined} */
    const selfLocator = await E(powers).locate('@self');
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

      if (fromId === selfLocator) {
        continue;
      }

      const { messageId, replyTo } = /** @type {any} */ (message);

      const rootNodeId = await rootNodeIdP;

      console.log(`[fae] New message #${number} from ${fromId}`);

      // Discover tools (picks up newly adopted tools each turn)
      const { schemas: toolSchemas, toolMap } = await discoverTools(
        powers,
        localTools,
      );

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

      // Detect channel mention notifications — these include exec
      // code that the agent should run directly.
      const isChannelMention =
        textContent.includes('You were mentioned in ') &&
        textContent.includes('exec');
      const footer = isChannelMention
        ? `\n\nRun the exec() code above with your reply. ` +
          `Replace YOUR_REPLY and YOUR_NAME.`
        : `\n\nUse reply(messageNumber: ${number}, ...) to respond to this message.`;

      const userNode = await tree.addNode(
        parentId,
        [
          {
            role: 'user',
            content: `[Inbox message #${number}] ${textContent}${footer}`,
          },
        ],
        { messageId },
      );

      try {
        replyTracker.sent = false;
        replyTracker.anyToolCalled = false;
        lastLeafId = await runAgenticLoop(toolSchemas, toolMap, userNode.id);

        // If the LLM produced a final response without calling any
        // tools, send the content as a fallback. If tools WERE called
        // (e.g. exec posted to a channel), skip the fallback to avoid
        // double-posting.
        if (!replyTracker.sent && !replyTracker.anyToolCalled) {
          const finalNode = await tree.getNode(lastLeafId);
          if (finalNode) {
            const lastMsg = finalNode.messages[finalNode.messages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content) {
              // Strip <think> blocks, tool call fragments, and
              // reasoning text from the content.
              let fallbackContent = lastMsg.content
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/<think>[\s\S]*/g, '')
                .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
                .replace(/<function=[^>]*>[\s\S]*?(?:<\/function>|$)/g, '')
                .trim();

              // For channel posts, strip reasoning that the model
              // outputs as plain text (not inside <think> tags).
              // Keep only lines that look like direct communication.
              if (isChannelMention && fallbackContent) {
                // Strip residual HTML-like tags
                fallbackContent = fallbackContent
                  .replace(/<\/?think>/g, '')
                  .trim();

                const lines = fallbackContent.split('\n');
                /* eslint-disable prettier/prettier */
                const reasoningRe =
                  /^([-•*] (Adopt|Look|Join|Post|Sen[dt]|Return|Perform|Call)|Thus|So |But |However|The (user|instruction|message|content|question|adopt|edge|tool|error)|We (need|should|have|can|could|attempt|perform)|Given |In (previous|earlier|the|that|this)|For (consistency|message|each|the|safety)|Now |Maybe |Possibly|Perhaps|Actually|Let('s|)|Looking|They |That (suggests|means|likely|seems)|This (suggests|means|is)|I('m| think| need| will| should| see|'ve (adopted|joined|posted))|Not sure|After adopt|Proceed|Since |Wait|Hmm|OK |Ok |The (phrase|question|safe)|Step |Recap|All steps|```)/;
                /* eslint-enable prettier/prettier */
                /** @type {string[]} */
                const kept = [];
                for (const line of lines) {
                  const trimmedLine = line.trim();
                  if (!trimmedLine) {
                    // eslint-disable-next-line no-continue
                    continue;
                  }
                  if (!reasoningRe.test(trimmedLine)) {
                    kept.push(trimmedLine);
                  }
                }
                fallbackContent = kept.join('\n').trim();
                // If everything was reasoning, use a brief
                // acknowledgment instead of posting nothing.
                if (!fallbackContent) {
                  fallbackContent =
                    'Got it! I see the mention. What would you like me to help with?';
                }
                // Cap length for channel posts — if still long,
                // take only the last paragraph.
                if (fallbackContent.length > 400) {
                  const paragraphs = fallbackContent.split(/\n\n+/);
                  fallbackContent =
                    paragraphs[paragraphs.length - 1].trim();
                }
                // Final length cap
                if (fallbackContent.length > 500) {
                  fallbackContent = `${fallbackContent.slice(0, 497)}...`;
                }
              }

              if (fallbackContent && isChannelMention && namesArray.length > 0) {
                // For channel mentions, post to the channel instead
                // of sending an inbox reply. Adopt the channel ref
                // from this message, then look it up and post.
                const channelEdge = namesArray[0];
                const channelPetName = `channel-${channelEdge}`;
                console.log(
                  `[fae] Channel mention fallback: posting to ${channelEdge}`,
                );
                try {
                  // Adopt the channel reference (idempotent if
                  // already adopted under this name)
                  try {
                    await E(powers).adopt(
                      number,
                      channelEdge,
                      channelPetName,
                    );
                  } catch {
                    // Already adopted — fine
                  }
                  const channelRef = await E(powers).lookup(channelPetName);
                  // Always join to get our own member ref — posting
                  // via the admin ref would attribute the message to
                  // the admin, not to fae. join() is idempotent.
                  const memberRef = await E(channelRef).join('fae');
                  await E(memberRef).post(
                    [fallbackContent],
                    [],
                    [],
                  );
                  console.log('[fae] Posted to channel as fae');
                } catch (channelErr) {
                  console.error(
                    '[fae] Channel post failed, falling back to inbox reply:',
                    channelErr,
                  );
                  await E(powers).reply(
                    number,
                    [fallbackContent],
                    [],
                    [],
                  );
                }
              } else if (fallbackContent) {
                console.log(
                  '[fae] No reply tool called, sending fallback reply',
                );
                await E(powers).reply(
                  number,
                  [fallbackContent],
                  [],
                  [],
                );
              } else {
                console.log(
                  '[fae] No reply tool called and content was only ' +
                    'internal reasoning — skipping fallback reply',
                );
              }
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

const driverSpecifier = new URL('driver.js', import.meta.url).href;

/**
 * Creates a Fae factory that provisions and manages agent instances.
 *
 * Reads `llm-provider` from its petstore for the LLM configuration.
 * Exposes `createAgent(name, options)` for creating new agents, each
 * backed by a driver caplet that can be pinned for restart survival.
 *
 * @param {import('@endo/eventual-send').FarRef<object>} guestPowers
 * @param {Promise<object> | object | undefined} _context
 * @returns {Promise<object>}
 */
export const make = async (guestPowers, _context) => {
  /** @type {any} */
  const powers = guestPowers;

  const hostAgent = await E(powers).lookup('host-agent');

  return makeExo('FaeFactory', FaeFactoryInterface, {
    /**
     * Create a new agent instance with its own guest, driver caplet,
     * and inbox/LLM loop.
     *
     * The driver is a standalone `make-unconfined` formula that holds
     * capability references to the LLM provider config and the agent
     * guest.  When `pin: true`, the driver is written to PINS so
     * `revivePins()` restarts it automatically on daemon reboot.
     *
     * @param {string} name - Unique name for this agent
     * @param {object} [options]
     * @param {string} [options.systemPrompt] - Override system prompt
     * @param {boolean} [options.pin] - Pin the driver to PINS for restart survival
     * @returns {Promise<string>} The agent's profile petname
     */
    async createAgent(name, options = {}) {
      const { systemPrompt, pin } =
        /** @type {{ systemPrompt?: string, pin?: boolean }} */ (options);

      const guestName = name;
      const profileName = `profile-for-${guestName}`;
      const driverHandleName = `${name}-driver-handle`;
      const driverProfileName = `profile-for-${driverHandleName}`;
      const driverResultName = `${name}-driver`;

      if (await E(hostAgent).has(driverResultName)) {
        throw new Error(`Agent "${name}" already exists.`);
      }

      // 1. Create the agent guest (inbox, petstore, tools).
      await E(hostAgent).provideGuest(guestName, {
        agentName: profileName,
      });

      // 2. Create a lightweight driver guest whose namespace will hold
      //    capability references to the provider config and the agent.
      const driverGuest = await E(hostAgent).provideGuest(driverHandleName, {
        agentName: driverProfileName,
      });

      // 3. Write capability references into the driver's namespace.
      const providerLocator = await E(powers).locate('llm-provider');
      await E(driverGuest).write('llm-provider', providerLocator);

      const agentLocator = await E(hostAgent).locate(profileName);
      await E(driverGuest).write('agent', agentLocator);

      // 4. Launch the driver caplet.
      await E(hostAgent).makeUnconfined('@main', driverSpecifier, {
        powersName: driverProfileName,
        resultName: driverResultName,
        env: harden({ FAE_SYSTEM_PROMPT: systemPrompt || '' }),
      });

      // 5. Pin the driver so it auto-restarts on daemon reboot.
      if (pin) {
        await E(hostAgent).copy(
          [driverResultName],
          ['@pins', driverResultName],
        );
        console.log(`[fae-factory] Pinned driver "${driverResultName}"`);
      }

      console.log(`[fae-factory] Created agent "${name}"`);
      return profileName;
    },

    /**
     * @param {string} [methodName]
     * @returns {string}
     */
    help(methodName) {
      if (methodName === undefined) {
        return 'Fae factory: creates LLM agent instances bound to a configured LLM provider. Use createAgent(name, { systemPrompt, pin }) to create a new agent.';
      }
      if (methodName === 'createAgent') {
        return 'createAgent(name, { systemPrompt?, pin? }) — Create a new agent with its own guest, driver caplet, and inbox loop. Pass pin: true to survive daemon restarts. Returns the profile petname.';
      }
      return `No documentation for method "${methodName}".`;
    },
  });
};
harden(make);
