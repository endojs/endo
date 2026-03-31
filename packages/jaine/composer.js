// @ts-nocheck — E() generics don't work well with JSDoc types for remote objects
/* eslint-disable no-await-in-loop */

import { extractToolCallsFromContent } from '@endo/fae/src/extract-tool-calls.js';
import { createLogger } from './logger.js';

// eslint-disable-next-line no-shadow
const console = createLogger();

/** @import { ExecutorOutcome } from './executor.js' */

/**
 * @typedef {object} ComposerResult
 * @property {string} responseText - the final response to post
 * @property {string[]} statusUpdates - status strings emitted during composition
 */

const composerSystemPrompt = `\
You are Jaine, an AI assistant living inside Endo — a capability-secure
JavaScript platform. You are a channel member replying in a conversation.

IMPORTANT CONTEXT — you are NOT a general-purpose coding assistant:
- You live inside Endo, which runs Hardened JavaScript (SES).
- All code in this environment is JavaScript using Eventual Send: E(ref).method()
- There is NO Python, Rust, Go, shell scripting, or any other language here.
- When users ask you to "write a program" or "make a function", they mean
  an Endo JavaScript module or inline JS using E() calls — never Python.
- If a user asks for something in another language, clarify that Endo uses
  JavaScript and offer the JS/Endo equivalent.

You have one tool: delegate({ intent, description }).
- Use it to look up information, run code, or perform actions in Endo.
- intent: what to do (e.g., "list my petnames", "read channel history")
- description: a brief status message shown to users while this runs
- IMPORTANT: delegate intents must describe Endo/JS operations, never
  "generate Python code" or "write a shell script".

Endo concepts:
- Petnames: local names for capabilities (like "my-channel", "alice")
- E() calls: all remote object access uses E(ref).method(), never direct
- Capabilities: objects are passed by reference, not by name/URL
- Channels: message spaces with members who can post, reply, react, edit
  - E(member).post([text], edgeNames, edgeIds) — post a message
  - E(member).post([text], [], [], replyTo) — reply to a message
  - E(member).listMessages() — read channel history
  - E(member).createInvitation(name) — invite sub-members
- Powers: your agent powers for looking up petnames
  - E(powers).list() — list known petnames
  - E(powers).lookup(name) — resolve a petname to a capability
  - E(powers).send(recipient, [text], [], []) — send an inbox message
- harden(): all objects must be hardened before sharing
- Modules: export const make = (powers) => { ... }
- SES restrictions: no new Date(), no mutation of returned objects,
  no direct I/O (fetch, fs, http). All I/O goes through capabilities.

AVOID hallucinating APIs that don't exist. If unsure whether a method
exists, use delegate to check the source code via readFile/listDir.

Write your response directly. Be concise, conversational, and helpful.
When showing code, always use JavaScript with E() patterns.`;

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
   * @param {string} [recentHistory] - recent channel messages for broader context
   * @returns {Promise<ComposerResult>}
   */
  const compose = async (threadContext, userMessage, onStatus, recentHistory) => {
    const contextParts = [];
    if (recentHistory) {
      contextParts.push(`Recent channel history:\n${recentHistory}`);
    }
    if (threadContext) {
      contextParts.push(`Thread context:\n${threadContext}`);
    }
    const contextBlock = contextParts.length > 0
      ? `${contextParts.join('\n\n')}\n\n`
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
    let iteration = 0;
    const MAX_ITERATIONS = 15;

    while (iteration < MAX_ITERATIONS) {
      iteration += 1;
      console.log(
        `[jaine][composer] LLM call #${iteration}, ${conversation.length} messages`,
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
