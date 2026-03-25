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
} from '@endo/fae/src/tool-makers.js';
import { discoverTools, executeTool } from '@endo/fae/src/tools.js';
import { extractToolCallsFromContent } from '@endo/fae/src/extract-tool-calls.js';

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

const executorSystemPrompt = `\
You are an execution agent. You receive a task description and must use the
available tools to accomplish it. Return the final result as plain text in
your last message. Be concise and factual.`;

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
 * Create an executor that performs capability operations given an intent.
 *
 * The executor has its own LLM context with the full tool set. It never
 * posts to channels directly — it returns results to the composer.
 *
 * @param {object} powers - agent guest powers
 * @param {{ chat: (messages: object[], tools: object[]) => Promise<{ message: object }> }} provider
 * @returns {{ execute: (intent: string) => Promise<ExecutorOutcome> }}
 */
export const makeExecutor = (powers, provider) => {
  // Build the full tool set
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

    const maxIterations = 5;
    let lastContent = '';

    for (let i = 0; i < maxIterations; i += 1) {
      console.log(
        `[jaine][executor] LLM call #${i + 1}, ${conversation.length} messages`,
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

    if (lastContent) {
      return harden({ type: 'result', value: lastContent });
    }
    return harden({ type: 'error', message: 'No result produced' });
  };

  return harden({ execute });
};
harden(makeExecutor);
