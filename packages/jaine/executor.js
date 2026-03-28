// @ts-nocheck — E() generics don't work well with JSDoc types for remote objects
/* eslint-disable no-await-in-loop */

import { E } from '@endo/eventual-send';
import { makeMarshal, passableAsJustin } from '@endo/marshal';

import {
  makeAdoptTool,
  makeExecTool,
  makeReadChannelTool,
  makeLookupTool,
  makeListPetnamesTool,
  makeReplyTool,
  makeSendTool,
  makeDismissTool,
  makeReadFileTool,
  makeListDirTool,
} from '@endo/fae/src/tool-makers.js';
import { discoverTools, executeTool } from '@endo/fae/src/tools.js';
import { extractToolCallsFromContent } from '@endo/fae/src/extract-tool-calls.js';
import { createLogger } from './logger.js';

// eslint-disable-next-line no-shadow
const console = createLogger();

/**
 * @typedef {{ type: 'result', value: string }} ExecutorResult
 * @typedef {{ type: 'error', message: string }} ExecutorError
 * @typedef {{ type: 'permission-needed', request: string }} ExecutorPermissionNeeded
 * @typedef {{ type: 'deferred', message: string }} ExecutorDeferred
 * @typedef {ExecutorResult | ExecutorError | ExecutorPermissionNeeded | ExecutorDeferred} ExecutorOutcome
 */

const m = makeMarshal(undefined, undefined, {
  errorTagging: 'off',
  serializeBodyFormat: 'smallcaps',
});
const decodeSmallcaps = jsonString =>
  m.unserialize({ body: jsonString, slots: [] });

const projectRoot = new URL('../..', import.meta.url).pathname.replace(
  /\/$/,
  '',
);

const executorSystemPrompt = `\
You are an execution agent running inside Endo, a capability-secure
JavaScript platform. You receive a task and must use the available tools
to accomplish it. Return the final result as plain text in your last
message. Be concise and factual.

CRITICAL — Eventual Send (E):
All objects here are REMOTE references. You CANNOT call methods directly.
You MUST wrap every method call with E():

  WRONG: powers.list()          — throws "not a function"
  RIGHT: await E(powers).list()

  WRONG: channel.join("name")
  RIGHT: await E(channel).join("name")

E() returns a Promise. Always await it. This applies to powers AND to
every object returned from an E() call (channels, members, etc.).

Common patterns:
  const names = await E(powers).list();
  const ch    = await E(powers).lookup("my-channel");
  const member = await E(ch).join("jaine");
  const msgs  = await E(member).listMessages();
  await E(member).post(["Hello!"], [], []);
  await E(powers).adopt(42n, "edgeName", "petName");
  await E(powers).send("recipient", ["message text"], [], []);

SES environment restrictions:
- new Date() throws. Use Date.now() for timestamps.
- Objects returned from E() are frozen. Do not try to mutate them.
- Use harden() on any objects you create before passing them around.
- BigInt literals use the n suffix: 42n, not BigInt(42).

CHANNEL CONTEXT:
When handling channel messages, the exec tool gives you a \`member\` handle
(your channel identity), NOT raw powers. Use member for all channel ops:
  await E(member).post(["text"], [], [], "replyTo");
  await E(member).listMessages();
  const [inv, att] = await E(member).createInvitation("sub-bot");
Do NOT look up channels by name and call join() — that bypasses your
identity. Everything you create should go through your member handle so
the pedigree chain shows you as the creator.

If you need a capability you don't have, use the requestPermission tool
to ask the host.

You have access to your own source code and the broader Endo project via
readFile and listDir. Use these to understand your environment when needed.`;

/**
 * Parse tool call arguments from LLM output.
 *
 * @param {unknown} argsRaw
 * @returns {Record<string, unknown>}
 */
const parseToolArgs = argsRaw => {
  try {
    const jsonString =
      typeof argsRaw === 'string' ? argsRaw : JSON.stringify(argsRaw);
    return decodeSmallcaps(jsonString);
  } catch {
    try {
      const jsonString =
        typeof argsRaw === 'string' ? argsRaw : JSON.stringify(argsRaw);
      return JSON.parse(jsonString);
    } catch {
      return {};
    }
  }
};
harden(parseToolArgs);

/**
 * Process tool calls from an LLM response.
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

    const args = parseToolArgs(argsRaw);

    console.log(
      `[jaine][executor][tool] ${name}(${passableAsJustin(harden(args), false)})`,
    );

    let result;
    try {
      result = await executeTool(name, args, toolMap);
      console.log(
        `[jaine][executor][tool] ${name} -> ${passableAsJustin(result, false)}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result = harden({ error: errorMessage });
      console.error(`[jaine][executor][tool] ${name} error: ${errorMessage}`);
    }

    results.push({
      role: 'tool',
      content: passableAsJustin(result, false),
      tool_call_id: /** @type {any} */ (toolCall).id,
    });
  }
  return results;
};
harden(processToolCalls);

/**
 * @typedef {object} ChannelContext
 * @property {object} member - Jaine's member handle for this channel
 * @property {string} channelName - petname of the channel
 */

/**
 * Create a channel-scoped exec tool that exposes the member handle
 * instead of raw powers. The LLM can post, read, and create
 * sub-invitations through the member handle, maintaining proper
 * pedigree chains (admin -> jaine -> sub-member).
 *
 * @param {object} member - Jaine's channel member handle
 * @returns {object}
 */
const makeChannelExecTool = member => {
  /** @type {import('@endo/fae/src/tool-makers.js').ToolSchema} */
  const toolSchema = harden({
    type: 'function',
    function: {
      name: 'exec',
      description:
        'Execute JavaScript code scoped to this channel.\n\n' +
        'Available globals:\n' +
        '- member: your channel member handle (post, listMessages, createInvitation, getMembers)\n' +
        '- E: eventual send — use E(ref).method() for all remote calls\n' +
        '- harden: freeze objects for safe passing\n' +
        '- console: for logging\n\n' +
        'You are scoped to this channel. Use member to interact:\n' +
        '```\n' +
        'const msgs = await E(member).listMessages();\n' +
        'await E(member).post(["Hello!"], [], [], "42");\n' +
        'const [invitation, attenuator] = await E(member).createInvitation("bot-helper");\n' +
        'return "done";\n' +
        '```\n' +
        'Do NOT join channels or create new members directly. Use createInvitation() ' +
        'on your member handle so sub-members appear under your identity.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description:
              'JavaScript code to execute. Runs as an async function body. ' +
              'Use E(member).method() for channel operations. Return a result.',
          },
        },
        required: ['code'],
      },
    },
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const { code } = /** @type {{ code: string }} */ (args);
      if (!code) {
        throw new Error('code is required');
      }
      const wrappedSource = `(async (member, E, harden, console) => {\n${code}\n})`;
      const c = new Compartment({
        __options__: true,
        globals: { BigInt },
      });
      const fn = c.evaluate(wrappedSource);
      const result = await fn(member, E, harden, console);
      if (result === undefined) {
        return 'done (no return value)';
      }
      try {
        return JSON.stringify(result, null, 2);
      } catch {
        return String(result);
      }
    },
    help() {
      return 'Execute JavaScript scoped to the current channel member handle.';
    },
  });
};
harden(makeChannelExecTool);

/**
 * Create a tool that lets Jaine request permissions from the host
 * by sending a form.
 *
 * @param {object} powers - agent guest powers
 * @returns {object}
 */
const makeRequestPermissionTool = powers => {
  const toolSchema = harden({
    type: 'function',
    function: {
      name: 'requestPermission',
      description:
        'Request a capability or permission from the host by sending a form. ' +
        'The host will see the request in their inbox and can approve or deny it. ' +
        'Use this when you need access to something you do not currently have.',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description:
              'Human-readable description of what you need and why.',
          },
          fields: {
            type: 'array',
            description:
              'Form fields for the host to fill in. Each field has name, label, and optional default.',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                label: { type: 'string' },
                default: { type: 'string' },
              },
              required: ['name', 'label'],
            },
          },
        },
        required: ['description'],
      },
    },
  });

  return harden({
    schema() {
      return toolSchema;
    },
    async execute(args) {
      const { description, fields = [] } =
        /** @type {{ description: string, fields?: Array<{ name: string, label: string, default?: string }> }} */ (
          args
        );
      if (!description) {
        throw new Error('description is required');
      }
      const formFields = fields.length > 0
        ? fields.map(f => harden({
            name: f.name,
            label: f.label,
            default: f.default || '',
          }))
        : [harden({ name: 'approved', label: 'Approve this request?', default: 'yes' })];

      await E(powers).form(
        '@host',
        `Jaine permission request: ${description}`,
        harden(formFields),
      );
      return `Permission request sent to host: "${description}". Waiting for approval.`;
    },
    help() {
      return 'Request a capability or permission from the host via a form.';
    },
  });
};
harden(makeRequestPermissionTool);

/**
 * Create an executor that performs capability operations given an intent.
 *
 * The executor has its own LLM context with the full tool set. It never
 * posts to channels directly — it returns results to the composer.
 *
 * When a channelContext is provided, the exec tool is scoped to the
 * channel member handle instead of raw powers. This ensures proper
 * pedigree chains (admin -> jaine -> sub-members) and prevents the
 * LLM from accessing unrelated channels.
 *
 * @param {object} powers - agent guest powers
 * @param {{ chat: (messages: object[], tools: object[]) => Promise<{ message: object }> }} provider
 * @param {ChannelContext} [channelContext] - if present, scopes exec to this channel
 * @returns {{ execute: (intent: string) => Promise<ExecutorOutcome> }}
 */
export const makeExecutor = (powers, provider, channelContext) => {
  // Build the full tool set
  /** @type {Map<string, object>} */
  const allTools = new Map();
  allTools.set('list', makeListPetnamesTool(powers));
  allTools.set('lookup', makeLookupTool(powers));
  allTools.set('adopt', makeAdoptTool(powers));
  // Use channel-scoped exec when in a channel context
  if (channelContext) {
    allTools.set('exec', makeChannelExecTool(channelContext.member));
  } else {
    allTools.set('exec', makeExecTool(powers));
  }
  allTools.set('readChannel', makeReadChannelTool(powers));
  allTools.set('send', makeSendTool(powers));
  allTools.set('reply', makeReplyTool(powers));
  allTools.set('dismiss', makeDismissTool(powers));
  allTools.set('readFile', makeReadFileTool(projectRoot));
  allTools.set('listDir', makeListDirTool(projectRoot));
  allTools.set('requestPermission', makeRequestPermissionTool(powers));

  // Timer tool
  const timerTool = harden({
    schema: () =>
      harden({
        type: 'function',
        function: {
          name: 'createTimer',
          description:
            'Create a recurring timer that sends tick messages to your inbox at a specified interval.',
          parameters: {
            type: 'object',
            properties: {
              petName: {
                type: 'string',
                description: 'Pet name for the timer (e.g. "my-reminder")',
              },
              intervalMinutes: {
                type: 'number',
                description: 'Interval in minutes between ticks',
              },
              label: {
                type: 'string',
                description: 'Human-readable label for the timer',
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
   * Execute an intent using the full tool set.
   *
   * @param {string} intent - natural language description of what to do
   * @returns {Promise<ExecutorOutcome>}
   */
  const execute = async intent => {
    console.log(`[jaine][executor] Intent: ${intent}`);

    const discovered = await discoverTools(powers, allTools);
    const { schemas: toolSchemas, toolMap } = discovered;

    /** @type {object[]} */
    const conversation = [
      { role: 'system', content: executorSystemPrompt },
      { role: 'user', content: intent },
    ];

    let lastContent = '';
    let iteration = 0;
    let lastToolSig = '';
    let repeatCount = 0;
    const MAX_ITERATIONS = 30;
    const MAX_REPEATS = 3;

    while (iteration < MAX_ITERATIONS) {
      iteration += 1;
      console.log(
        `[jaine][executor] LLM call #${iteration}, ${conversation.length} messages`,
      );
      const response = await provider.chat(conversation, toolSchemas);
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
        // Detect repetitive tool calls (model stuck in a loop)
        const toolSig = toolCalls
          .map(tc => {
            const f = /** @type {any} */ (tc).function;
            return `${f?.name}(${JSON.stringify(f?.arguments)})`;
          })
          .join(';');
        if (toolSig === lastToolSig) {
          repeatCount += 1;
          if (repeatCount >= MAX_REPEATS) {
            console.error(
              `[jaine][executor] Breaking: same tool call repeated ${MAX_REPEATS} times`,
            );
            lastContent =
              rm.content || '(Stopped: repeated the same action without progress)';
            break;
          }
        } else {
          repeatCount = 0;
          lastToolSig = toolSig;
        }

        const toolResults = await processToolCalls(toolCalls, toolMap);
        conversation.push(responseMessage);
        for (const tr of toolResults) {
          conversation.push(tr);
        }
        // Continue loop — LLM may need more tool calls
      } else {
        lastContent = rm.content || '';
        break;
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      console.error(
        `[jaine][executor] Hit iteration limit (${MAX_ITERATIONS})`,
      );
    }

    if (lastContent) {
      return harden({ type: 'result', value: lastContent });
    }
    return harden({ type: 'error', message: 'No result produced' });
  };

  return harden({ execute });
};
harden(makeExecutor);
