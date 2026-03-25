// @ts-nocheck — E() generics don't work well with JSDoc types for remote objects
/* eslint-disable no-await-in-loop */

import { extractToolCallsFromContent } from '@endo/fae/src/extract-tool-calls.js';

/** @import { ExecutorOutcome } from './executor.js' */

/**
 * @typedef {object} ComposerResult
 * @property {string} responseText - the final response to post
 * @property {string[]} statusUpdates - status strings emitted during composition
 */

const composerSystemPrompt = `\
You are Jaine, a helpful channel agent replying to a thread.

You have one tool available: delegate({ intent, description }).
- Use it to request information or perform actions you cannot do yourself.
- intent: a short description of what to do
  (e.g., "look up CapTP spec", "list my petnames", "send Alice an invitation")
- description: a brief status message shown to users while this runs

Write your response directly. Be concise, conversational, and helpful.
Do not include metadata or formatting instructions.`;

/**
 * Create the delegate tool schema.
 *
 * @returns {object}
 */
const delegateSchema = harden({
  type: 'function',
  function: {
    name: 'delegate',
    description:
      'Delegate a task to the execution layer. Use for information lookup, capability operations, or any action requiring tools.',
    parameters: {
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          description: 'What to do (e.g., "look up CapTP spec")',
        },
        description: {
          type: 'string',
          description: 'Status message to show while executing',
        },
      },
      required: ['intent'],
    },
  },
});

/**
 * Create a response composer.
 *
 * The composer generates response text given pre-assembled context. It has
 * one tool — delegate() — which hands off to the executor for capability
 * operations. The composer never touches channels or inbox directly.
 *
 * @param {{ chat: (messages: object[], tools: object[]) => Promise<{ message: object }> }} provider
 * @param {(intent: string) => Promise<ExecutorOutcome>} executorFn
 * @returns {{ compose: (threadContext: string, userMessage: string, onStatus: (status: string) => Promise<void>) => Promise<ComposerResult> }}
 */
export const makeComposer = (provider, executorFn) => {
  const toolSchemas = [delegateSchema];

  /**
   * Compose a response to a channel message.
   *
   * @param {string} threadContext - pre-formatted thread transcript
   * @param {string} userMessage - the triggering message text
   * @param {(status: string) => Promise<void>} onStatus - callback for placeholder edits
   * @returns {Promise<ComposerResult>}
   */
  const compose = async (threadContext, userMessage, onStatus) => {
    const contextBlock = threadContext
      ? `Thread context:\n${threadContext}\n\n`
      : '';

    /** @type {object[]} */
    const conversation = [
      { role: 'system', content: composerSystemPrompt },
      {
        role: 'user',
        content: `${contextBlock}Message to respond to:\n${userMessage}`,
      },
    ];

    /** @type {string[]} */
    const statusUpdates = [];
    const maxIterations = 5;

    for (let i = 0; i < maxIterations; i += 1) {
      console.log(
        `[jaine][composer] LLM call #${i + 1}, ${conversation.length} messages`,
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
        conversation.push(responseMessage);

        for (const toolCall of toolCalls) {
          const { arguments: argsRaw } = /** @type {any} */ (toolCall)
            .function;

          /** @type {Record<string, unknown>} */
          let args;
          try {
            const jsonString =
              typeof argsRaw === 'string'
                ? argsRaw
                : JSON.stringify(argsRaw);
            args = JSON.parse(jsonString);
          } catch {
            args = {};
          }

          const intent = String(args.intent || '');
          const description = String(args.description || intent);

          console.log(`[jaine][composer] delegate: ${intent}`);

          // Update placeholder status
          if (description) {
            statusUpdates.push(description);
            try {
              await onStatus(description);
            } catch {
              // Status update is best-effort
            }
          }

          // Execute the intent via Layer 3
          let resultText;
          try {
            const outcome = await executorFn(intent);
            if (outcome.type === 'result') {
              resultText = outcome.value;
            } else if (outcome.type === 'error') {
              resultText = `Error: ${outcome.message}`;
            } else if (outcome.type === 'permission-needed') {
              resultText = `Permission needed: ${outcome.request}`;
            } else {
              resultText = JSON.stringify(outcome);
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            resultText = `Execution error: ${errorMessage}`;
          }

          console.log(
            `[jaine][composer] delegate result: ${resultText.slice(0, 200)}`,
          );

          conversation.push({
            role: 'tool',
            content: resultText,
            tool_call_id: /** @type {any} */ (toolCall).id,
          });
        }
        // Continue loop — composer may generate more text or delegate again
      } else {
        // Final text response
        const responseText = rm.content || '';
        console.log(
          `[jaine][composer] final: ${responseText.slice(0, 200)}`,
        );
        return harden({ responseText, statusUpdates });
      }
    }

    return harden({ responseText: '', statusUpdates });
  };

  return harden({ compose });
};
harden(makeComposer);
