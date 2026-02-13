// @ts-check

/** @import { FarEndoGuest } from '@endo/daemon/src/types.js' */
/** @import { LLMBackend } from './ollama-backend.js' */
/** @import { ConversationState, PendingToolCall } from './conversation-store.js' */

import Anthropic from '@anthropic-ai/sdk';
import { E } from '@endo/eventual-send';
import { getSystemPrompt } from './system-prompt.js';
import { saveConversation } from './conversation-store.js';

/** Tools that block awaiting host approval */
const BLOCKING_TOOLS = new Set(['define_code', 'request_evaluation']);

const tools = harden([
  {
    name: 'request_evaluation',
    description:
      'Propose JavaScript code for sandboxed evaluation. The host reviews and approves or rejects. Code runs in a Compartment with only the specified endowments. Prefer define_code instead, which separates code from capability binding.',
    input_schema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'JavaScript source code to evaluate',
        },
        codeNames: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Variable names in the code that map to endowment values',
        },
        petNamePaths: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Pet names from the guest directory providing values for each codeName',
        },
        resultName: {
          type: 'string',
          description: 'Optional pet name to store the evaluation result',
        },
      },
      required: ['source', 'codeNames', 'petNamePaths'],
    },
  },
  {
    name: 'define_code',
    description:
      'Propose code for evaluation with named capability slots. The host sees the code and decides which capabilities to provide for each slot. Preferred over request_evaluation because it separates code proposal from capability binding.',
    input_schema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'JavaScript source code to evaluate',
        },
        slots: {
          type: 'object',
          description:
            'Named capability slots. Keys are variable names in the code, values describe what capability is needed.',
          additionalProperties: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description:
                  'Human-readable description of what this slot needs',
              },
            },
            required: ['label'],
          },
        },
      },
      required: ['source', 'slots'],
    },
  },
  {
    name: 'list_names',
    description: 'List all available pet names in the guest directory.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'lookup_value',
    description: 'Look up a value by its pet name in the guest directory.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The pet name to look up',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'store_result',
    description:
      'Store a value in your directory under a pet name for later use. Use this to save intermediate results across multi-step computations.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Pet name to store the value under',
        },
        value: {
          description:
            'Value to store (string, number, boolean, object, or array)',
        },
      },
      required: ['name', 'value'],
    },
  },
  {
    name: 'chain_eval',
    description:
      'Execute code using your own stored results as endowments. Use this for multi-step computations where you already have the needed values stored in your directory.',
    input_schema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description: 'JavaScript source code to evaluate',
        },
        bindings: {
          type: 'object',
          description:
            'Map of code variable names to pet names from your directory',
          additionalProperties: { type: 'string' },
        },
        resultName: {
          type: 'string',
          description: 'Optional pet name to store the evaluation result',
        },
      },
      required: ['source', 'bindings'],
    },
  },
]);

/**
 * Execute a tool call against the guest's powers.
 *
 * @param {FarEndoGuest} powers - Endo guest powers
 * @param {string} name - Tool name
 * @param {Record<string, unknown>} input - Tool input parameters
 * @returns {Promise<unknown>}
 */
const executeTool = async (powers, name, input) => {
  switch (name) {
    case 'request_evaluation':
      return E(powers).requestEvaluation(
        /** @type {string} */ (input.source),
        /** @type {string[]} */ (input.codeNames),
        /** @type {string[]} */ (input.petNamePaths),
        /** @type {string | undefined} */ (input.resultName),
      );
    case 'define_code':
      return E(powers).define(
        /** @type {string} */ (input.source),
        /** @type {Record<string, { label: string }>} */ (input.slots),
      );
    case 'list_names':
      return E(powers).list();
    case 'lookup_value':
      return E(powers).lookup(/** @type {string} */ (input.name));
    case 'store_result':
      await E(powers).storeValue(
        input.value,
        /** @type {string} */ (input.name),
      );
      return `Stored value under "${input.name}"`;
    case 'chain_eval': {
      const bindings = /** @type {Record<string, string>} */ (input.bindings);
      const codeNames = Object.keys(bindings);
      const petNamePaths = codeNames.map(k => bindings[k]);
      return E(powers).requestEvaluation(
        /** @type {string} */ (input.source),
        codeNames,
        petNamePaths,
        /** @type {string | undefined} */ (input.resultName),
      );
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
};

/**
 * Create an Anthropic-based LLM backend with tool calling.
 *
 * Uses the Anthropic Messages API with a tool call loop: the model can
 * invoke tools, results are fed back, and the loop continues until the
 * model produces a final text response.
 *
 * @param {FarEndoGuest} powers - Endo guest powers
 * @param {Array<{role: string, content: unknown}>} [initialMessages] - Optional saved conversation history
 * @param {Array<PendingToolCall>} [pendingToolCalls] - Tool calls pending from before a restart
 * @returns {LLMBackend & { resumePending: () => Promise<string | null> }}
 */
export const createAnthropicBackend = (
  powers,
  initialMessages,
  pendingToolCalls,
) => {
  const anthropic = new Anthropic();
  /** @type {Array<{role: string, content: unknown}>} */
  const messages = initialMessages ? [...initialMessages] : [];

  /** @type {bigint | undefined} */
  let lastSeenNumber;

  /** @type {Array<PendingToolCall>} */
  let pending = pendingToolCalls ? [...pendingToolCalls] : [];

  /**
   * Save the current conversation state with optional pending tool calls.
   * @param {Array<PendingToolCall>} [activePending]
   */
  const checkpoint = async activePending => {
    /** @type {ConversationState} */
    const state = {
      messages,
      ...(lastSeenNumber !== undefined && { lastSeenNumber }),
      ...(activePending &&
        activePending.length > 0 && { pendingToolCalls: activePending }),
    };
    try {
      await saveConversation(powers, state);
    } catch {
      // Best-effort persistence
    }
  };

  /**
   * Set the last seen message number for skip-on-resume.
   * @param {bigint} n
   */
  const setLastSeenNumber = n => {
    lastSeenNumber = n;
  };

  /**
   * Get the last seen message number.
   * @returns {bigint | undefined}
   */
  const getLastSeenNumber = () => lastSeenNumber;

  /**
   * Execute tool calls from an assistant response, checkpointing before
   * blocking tools (define_code, request_evaluation).
   *
   * @param {Array<{type: string, id?: string, name?: string, input?: Record<string, unknown>}>} assistantContent
   * @returns {Promise<Array<{type: string, tool_use_id: string, content: string, is_error?: boolean}>>}
   */
  const executeToolCalls = async assistantContent => {
    const toolResults = [];
    for (const block of assistantContent) {
      if (block.type === 'tool_use') {
        const toolName = /** @type {string} */ (block.name);
        const toolInput = /** @type {Record<string, unknown>} */ (block.input);
        const toolUseId = /** @type {string} */ (block.id);

        // Checkpoint before blocking tools so we can resume after restart
        if (BLOCKING_TOOLS.has(toolName)) {
          /** @type {PendingToolCall} */
          const pendingCall = harden({
            toolUseId,
            toolName,
            input: toolInput,
            messageNumber: lastSeenNumber ?? 0n,
          });
          await checkpoint([pendingCall]);
        }

        try {
          const result = await executeTool(powers, toolName, toolInput);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: JSON.stringify(result),
          });
        } catch (e) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: /** @type {Error} */ (e).message,
            is_error: true,
          });
        }
      }
    }
    return toolResults;
  };

  /**
   * Resume pending tool calls from before a restart.
   * Returns the final text response if there was pending work, or null.
   * @returns {Promise<string | null>}
   */
  const resumePending = async () => {
    if (pending.length === 0) {
      return null;
    }

    const pendingCopy = [...pending];
    pending = [];

    // Re-execute each pending tool call (the durable promises survive restarts)
    const toolResults = [];
    for (const tc of pendingCopy) {
      try {
        const result = await executeTool(powers, tc.toolName, tc.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.toolUseId,
          content: JSON.stringify(result),
        });
      } catch (e) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.toolUseId,
          content: /** @type {Error} */ (e).message,
          is_error: true,
        });
      }
    }

    // Feed tool results back into the conversation and continue the loop
    messages.push({ role: 'user', content: toolResults });

    let response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: getSystemPrompt(),
      messages,
      tools,
    });

    // Continue tool call loop if needed
    while (response.stop_reason === 'tool_use') {
      const assistantContent = response.content;
      messages.push({ role: 'assistant', content: assistantContent });

      const moreResults = await executeToolCalls(assistantContent);
      messages.push({ role: 'user', content: moreResults });

      response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: getSystemPrompt(),
        messages,
        tools,
      });
    }

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => /** @type {{ text: string }} */ (b).text)
      .join('');
    messages.push({ role: 'assistant', content: response.content });

    // Clear pending state on successful completion
    await checkpoint();

    return text;
  };

  /**
   * @param {string} userContent
   * @returns {Promise<string>}
   */
  const processMessage = async userContent => {
    messages.push({ role: 'user', content: userContent });

    let response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: getSystemPrompt(),
      messages,
      tools,
    });

    // Tool call loop: keep going while the model wants to use tools
    while (response.stop_reason === 'tool_use') {
      const assistantContent = response.content;
      messages.push({ role: 'assistant', content: assistantContent });

      const toolResults = await executeToolCalls(assistantContent);
      messages.push({ role: 'user', content: toolResults });

      response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: getSystemPrompt(),
        messages,
        tools,
      });
    }

    // Extract final text from the response
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => /** @type {{ text: string }} */ (b).text)
      .join('');
    messages.push({ role: 'assistant', content: response.content });

    // Save conversation state after each complete exchange (no pending)
    await checkpoint();

    return text;
  };

  return harden({
    processMessage,
    setLastSeenNumber,
    getLastSeenNumber,
    resumePending,
  });
};
harden(createAnthropicBackend);
