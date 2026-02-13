// @ts-check

/** @import { FarEndoGuest } from '@endo/daemon/src/types.js' */
/** @import { LLMBackend } from './ollama-backend.js' */

import Anthropic from '@anthropic-ai/sdk';
import { E } from '@endo/eventual-send';
import { getSystemPrompt } from './system-prompt.js';

const tools = harden([
  {
    name: 'request_evaluation',
    description:
      'Propose JavaScript code for sandboxed evaluation. The host reviews and approves or rejects. Code runs in a Compartment with only the specified endowments.',
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
    case 'list_names':
      return E(powers).list();
    case 'lookup_value':
      return E(powers).lookup(/** @type {string} */ (input.name));
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
 * @returns {LLMBackend}
 */
export const createAnthropicBackend = powers => {
  const anthropic = new Anthropic();
  /** @type {Array<{role: string, content: unknown}>} */
  const messages = [];

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

      const toolResults = [];
      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          try {
            const result = await executeTool(powers, block.name, block.input);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            });
          } catch (e) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: /** @type {Error} */ (e).message,
              is_error: true,
            });
          }
        }
      }
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
    return text;
  };

  return harden({ processMessage });
};
harden(createAnthropicBackend);
