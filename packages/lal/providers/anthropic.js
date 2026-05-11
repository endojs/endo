// @ts-check
/**
 * Anthropic API provider for the Lal agent.
 * Converts our common message/tool format to Anthropic's API and back.
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * @typedef {object} CommonTool
 * @property {'function'} type
 * @property {{ name: string, description: string, parameters: object }} function
 */

/**
 * @typedef {object} CommonChatMessage
 * @property {'system'|'user'|'assistant'|'tool'} role
 * @property {string} content
 * @property {Array<{ id?: string, function: { name: string, arguments: string|object }}>} [tool_calls]
 * @property {string} [tool_call_id]
 */

/**
 * Convert common tool format to Anthropic's input_schema format.
 * @param {CommonTool[]} tools
 * @returns {Anthropic.Tool[]}
 */
const toAnthropicTools = tools =>
  tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: /** @type {Anthropic.Tool.InputSchema} */ (
      t.function.parameters
    ),
  }));

/**
 * Convert common messages to Anthropic's (system string + messages array).
 * @param {CommonChatMessage[]} messages
 * @returns {{ system: string, messages: Anthropic.MessageParam[] }}
 */
const toAnthropicMessages = messages => {
  let system = '';
  /** @type {Anthropic.MessageParam[]} */
  const anthropicMessages = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content;
    } else if (msg.role === 'user') {
      anthropicMessages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      /** @type {Anthropic.ContentBlockParam[]} */
      const content = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          const args =
            typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;
          content.push({
            type: 'tool_use',
            id:
              tc.id ||
              `tool_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: tc.function.name,
            input: args,
          });
        }
      }
      if (content.length > 0) {
        anthropicMessages.push({ role: 'assistant', content });
      }
    } else if (msg.role === 'tool') {
      const toolUseId = msg.tool_call_id || 'unknown';
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseId,
            content: msg.content,
          },
        ],
      });
    }
  }

  return { system, messages: anthropicMessages };
};

/**
 * Create an Anthropic-backed chat provider.
 * @param {{ apiKey: string, model: string }} options
 * @returns {{ chat: (messages: CommonChatMessage[], tools: CommonTool[]) => Promise<{ message: CommonChatMessage }> }}
 */
export const makeAnthropicProvider = ({ apiKey, model }) => {
  const client = new Anthropic({ apiKey });

  return {
    async chat(messages, tools) {
      const { system, messages: anthropicMessages } =
        toAnthropicMessages(messages);
      console.log('[LAL] Calling Anthropic API...');
      console.log(
        '[LAL] Messages:',
        JSON.stringify(anthropicMessages, null, 2),
      );
      let response;
      try {
        response = await client.messages.create({
          model,
          max_tokens: 4096,
          system,
          tools: toAnthropicTools(tools),
          messages: anthropicMessages,
        });
        console.log('[LAL] Anthropic response received');
      } catch (error) {
        console.error('[LAL] Anthropic API error:', error);
        const status = error?.status ?? error?.statusCode;
        const errBody = error?.error ?? error?.body;
        const isAuthError =
          status === 401 ||
          errBody?.type === 'authentication_error' ||
          /invalid x-api-key|api key|authentication/i.test(
            errBody?.message || error?.message || '',
          );
        if (isAuthError) {
          throw new Error(
            'Anthropic API authentication failed (invalid or expired API key). Check LAL_AUTH_TOKEN.',
          );
        }
        throw error;
      }

      /** @type {CommonChatMessage} */
      const message = { role: 'assistant', content: '' };
      /** @type {CommonChatMessage['tool_calls']} */
      const toolCalls = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          message.content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input),
            },
          });
        }
      }

      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
      }

      return { message };
    },
  };
};
